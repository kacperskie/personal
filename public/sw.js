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
  let payload = {};

  try {
    payload = event.data?.json?.() ?? {};
  } catch {
    payload = {};
  }

  const title = payload.title ?? "New finance alert";
  const body = payload.body ?? "Open Personal Finance HQ to review it.";
  const url =
    typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
      ? payload.url
      : "/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag ?? "personal-finance-hq",
      badge: "/icons/icon-192.svg",
      icon: "/icons/icon-192.svg",
      data: {
        url,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.pathname === url;
      });

      if (matchingClient) {
        return matchingClient.focus();
      }

      return self.clients.openWindow(url || "/notifications");
    }),
  );
});
