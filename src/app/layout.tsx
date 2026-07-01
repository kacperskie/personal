import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { getUnreadNotificationCount } from "@/lib/repositories/notification-repository";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Finance HQ",
  description: "Private UK-focused personal finance dashboard with an AI money coach.",
  manifest: "/manifest.webmanifest",
  applicationName: "Personal Finance HQ",
  appleWebApp: {
    capable: true,
    title: "Finance HQ",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Finance HQ",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17211f",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const unreadNotificationCount = await getUnreadNotificationCount();
  const isLiveTrueLayer =
    process.env.OPEN_BANKING_PROVIDER === "truelayer" &&
    process.env.TRUELAYER_SANDBOX_ENABLED === "false";
  const isMockBackend = process.env.BACKEND_PROVIDER === "mock";
  const appMode = isLiveTrueLayer
    ? {
        appModeLabel: "Live bank connections",
        appModeDescription: "TrueLayer read-only data with encrypted server-side tokens.",
        appModeTone: "live" as const,
      }
    : isMockBackend
      ? {
          appModeLabel: "Mock workspace",
          appModeDescription: "Synthetic demo data only; no banking provider calls.",
          appModeTone: "mock" as const,
        }
      : {
          appModeLabel: "Private finance workspace",
          appModeDescription: "Connect read-only accounts or use explicit mock/dev mode.",
          appModeTone: "setup" as const,
        };

  return (
    <html lang="en-GB">
      <body>
        <ServiceWorkerRegistrar />
        <AppShell unreadNotificationCount={unreadNotificationCount} {...appMode}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
