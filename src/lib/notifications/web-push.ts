import "server-only";

import crypto from "node:crypto";
import webPush from "web-push";
import type { AppNotification, PushSubscriptionRecord } from "@/lib/domain";

export type WebPushConfig = {
  configured: boolean;
  deliveryEnabled: boolean;
  publicKey: string | null;
  missing: string[];
};

export type SafePushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function getWebPushConfig(env: NodeJS.ProcessEnv = process.env): WebPushConfig {
  const missing = [
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ].filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    deliveryEnabled: env.NOTIFICATION_DELIVERY_ENABLED === "true",
    publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
    missing,
  };
}

export function getClientWebPushConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = getWebPushConfig(env);

  return {
    publicKey: config.publicKey,
    configured: Boolean(config.publicKey),
    deliveryEnabled: config.deliveryEnabled,
  };
}

export function configureWebPush(env: NodeJS.ProcessEnv = process.env) {
  const config = getWebPushConfig(env);

  if (!config.configured) {
    return config;
  }

  webPush.setVapidDetails(
    String(env.WEB_PUSH_SUBJECT),
    String(env.WEB_PUSH_VAPID_PUBLIC_KEY),
    String(env.WEB_PUSH_VAPID_PRIVATE_KEY),
  );

  return config;
}

export function createEndpointHash(endpoint: string) {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

export function createPrivacySafePushPayload(
  notification: AppNotification,
): SafePushPayload {
  return {
    title: notification.privacySafeTitle || "New finance alert",
    body: notification.privacySafeBody || "Open Personal Finance HQ to review it.",
    url: safeNotificationClickTarget(notification.actionHref),
    tag: `pfhq-${notification.type}-${notification.entityId ?? "general"}`,
  };
}

export function safeNotificationClickTarget(url: string | null) {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return "/notifications";
  }

  if (url.includes("://")) {
    return "/notifications";
  }

  return url;
}

export async function sendWebPushNotification(
  subscription: PushSubscriptionRecord,
  notification: AppNotification,
) {
  const config = configureWebPush();

  if (!config.configured) {
    return {
      status: "skipped" as const,
      reason: `Missing Web Push configuration: ${config.missing.join(", ")}`,
      responseCode: null,
    };
  }

  if (!config.deliveryEnabled) {
    return {
      status: "skipped" as const,
      reason: "Notification delivery is disabled.",
      responseCode: null,
    };
  }

  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    return {
      status: "skipped" as const,
      reason: "Push subscription is incomplete.",
      responseCode: null,
    };
  }

  try {
    const result = await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(createPrivacySafePushPayload(notification)),
    );

    return {
      status: "delivered" as const,
      reason: null,
      responseCode: result.statusCode ?? null,
    };
  } catch (error) {
    const candidate = error as { statusCode?: number; message?: string };

    return {
      status: "failed" as const,
      reason: candidate.message ?? "Web Push delivery failed.",
      responseCode: candidate.statusCode ?? null,
    };
  }
}
