const CACHE_NAME = "personal-finance-hq-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      if (event.request.mode === "navigate") {
        return caches.match(OFFLINE_URL);
      }

      const cached = await caches.match(event.request);
      return cached ?? Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = payload.title ?? "Personal Finance HQ";
  const body = payload.body ?? "Finance notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag ?? "personal-finance-hq",
      data: {
        url: payload.url ?? "/notifications",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url.endsWith(url));

      if (matchingClient) {
        return matchingClient.focus();
      }

      return self.clients.openWindow(url);
    }),
  );
});
