import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppNotification, NotificationPreference } from "../src/lib/domain";
import { NotificationPreferencesManager } from "../src/components/notifications/notification-preferences-manager";
import {
  createDeliveryAttempt,
  deliverWebPushNotification,
  shouldDeliverPush,
} from "../src/lib/notifications/notification-delivery";
import {
  createPrivacySafePushPayload,
  getClientWebPushConfig,
  safeNotificationClickTarget,
} from "../src/lib/notifications/web-push";
import {
  createPushSubscriptionRecord,
  deletePushSubscriptionByEndpoint,
  savePushSubscription,
} from "../src/lib/notifications/push-subscriptions";
import {
  buildScheduledNotificationsForSnapshot,
  runScheduledNotificationGeneration,
} from "../src/lib/notifications/scheduled-alerts";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockManualFinanceItems,
  mockNotificationPreferences,
  mockTransactionRecords,
} from "../src/lib/mock-data";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const notification: AppNotification = {
  id: "notif_test",
  userId: "user_mock_001",
  type: "bill_due",
  severity: "warning",
  channel: "in_app",
  title: "Energy bill is due for GBP 118",
  body: "Energy bill at Nationwide is due for GBP 118.",
  privacySafeTitle: "Bill due soon",
  privacySafeBody: "A planned commitment is coming up.",
  actionHref: "/bills-and-subscriptions",
  entityType: "bill",
  entityId: "bill_energy",
  status: "unread",
  readAt: null,
  dismissedAt: null,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

const snapshot = {
  accounts: mockAccounts,
  bills: mockBills,
  budgets: mockBudgets,
  budgetPeriods: mockBudgetPeriods,
  categories: mockCategories,
  manualFinanceItems: mockManualFinanceItems,
  transactions: mockTransactionRecords,
  bankConnections: mockBankConnections,
};

function preferencesWithWebPush(changes: Partial<NotificationPreference> = {}) {
  return mockNotificationPreferences.map((preference) => ({
    ...preference,
    channels: ["in_app", "web_push"] as NotificationPreference["channels"],
    ...changes,
  }));
}

describe("phase 10 Web Push and scheduled notifications", () => {
  it("saves and deletes push subscriptions in fallback mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const input = {
      endpoint: "https://push.example.test/subscription/123",
      keys: {
        p256dh: "public-key",
        auth: "auth-secret",
      },
      browser: "iPhone Safari PWA",
      permission: "granted" as NotificationPermission,
    };
    const saved = await savePushSubscription(input);
    const deleted = await deletePushSubscriptionByEndpoint(input.endpoint);

    expect(saved.status).toBe("active");
    expect(saved.endpointHash).not.toContain(input.endpoint);
    expect(deleted.id).toBe(saved.id);
  });

  it("rejects unauthenticated push subscription API requests", async () => {
    const { POST } = await import("../src/app/api/notifications/push/subscribe/route");
    const response = await POST(
      new Request("http://localhost/api/notifications/push/subscribe", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("exposes only the VAPID public key to browser-safe config", () => {
    const config = getClientWebPushConfig({
      WEB_PUSH_VAPID_PUBLIC_KEY: "public-vapid-key",
      WEB_PUSH_VAPID_PRIVATE_KEY: "private-vapid-key",
      WEB_PUSH_SUBJECT: "mailto:test@example.com",
      NOTIFICATION_DELIVERY_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.publicKey).toBe("public-vapid-key");
    expect(JSON.stringify(config)).not.toContain("private-vapid-key");
  });

  it("keeps service worker push and notification click handlers", () => {
    const serviceWorker = fs.readFileSync(path.resolve("public/sw.js"), "utf8");

    expect(serviceWorker).toContain('addEventListener("push"');
    expect(serviceWorker).toContain("showNotification");
    expect(serviceWorker).toContain('addEventListener("notificationclick"');
    expect(serviceWorker).toContain("/notifications");
  });

  it("generates privacy-safe push payloads", () => {
    const payload = createPrivacySafePushPayload(notification);
    const serialised = JSON.stringify(payload);

    expect(payload.title).toBe("Bill due soon");
    expect(serialised).not.toContain("GBP 118");
    expect(serialised).not.toContain("Nationwide");
    expect(serialised).not.toContain("Energy");
  });

  it("rejects scheduled notification route requests with an invalid cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "expected");
    const { GET } = await import("../src/app/api/notifications/scheduled/route");
    const response = await GET(new Request("http://localhost/api/notifications/scheduled"));

    expect(response.status).toBe(401);
  });

  it("creates scheduled in-app notifications with a valid cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "expected");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("AI_SCHEDULED_REVIEWS_ENABLED", "false");
    const { GET } = await import("../src/app/api/notifications/scheduled/route");
    const response = await GET(
      new Request("http://localhost/api/notifications/scheduled?asOfDate=2026-06-30", {
        headers: { "x-cron-secret": "expected" },
      }),
    );
    const payload = (await response.json()) as { created: number; users: number };

    expect(response.status).toBe(200);
    expect(payload.users).toBe(1);
    expect(payload.created).toBeGreaterThan(0);
  });

  it("skips push delivery when disabled by channel preference", async () => {
    const attempts = await deliverWebPushNotification({
      notification,
      subscriptions: [
        createPushSubscriptionRecord("user_mock_001", {
          endpoint: "https://push.example.test/disabled",
          keys: { p256dh: "p256dh", auth: "auth" },
          browser: "test",
          permission: "granted",
        }),
      ],
      preferences: mockNotificationPreferences,
    });

    expect(attempts[0].status).toBe("skipped");
    expect(attempts[0].failureReason).toBe("web push channel disabled");
  });

  it("skips push delivery during quiet hours", () => {
    const decision = shouldDeliverPush({
      notification,
      preferences: preferencesWithWebPush({
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      }),
      currentTime: "23:00",
    });

    expect(decision.deliver).toBe(false);
    expect(decision.reason).toBe("quiet hours");
  });

  it("uses stable dedupe ids for duplicate bill alert windows", () => {
    const first = buildScheduledNotificationsForSnapshot({
      userId: "user_mock_001",
      asOfDate: "2026-06-30",
      preferences: preferencesWithWebPush(),
      snapshot,
    });
    const second = buildScheduledNotificationsForSnapshot({
      userId: "user_mock_001",
      asOfDate: "2026-06-30",
      preferences: preferencesWithWebPush(),
      snapshot,
    });

    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
  });

  it("dedupes budget threshold alerts by type, entity, window and severity", () => {
    const scheduled = buildScheduledNotificationsForSnapshot({
      userId: "user_mock_001",
      asOfDate: "2026-06-30",
      preferences: preferencesWithWebPush(),
      snapshot,
    }).filter((item) => item.type === "budget_threshold");

    expect(scheduled.length).toBeGreaterThan(0);
    expect(new Set(scheduled.map((item) => item.id)).size).toBe(scheduled.length);
    expect(scheduled[0].id).toContain("budget_threshold");
  });

  it("keeps AI scheduled reviews disabled by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("AI_SCHEDULED_REVIEWS_ENABLED", "false");

    const result = await runScheduledNotificationGeneration("2026-06-30");

    expect(result.aiReviews).toBe(0);
  });

  it("creates delivery log records for failure or success states", () => {
    const attempt = createDeliveryAttempt({
      userId: "user_mock_001",
      notificationId: "notif_test",
      status: "failed",
      failureReason: "provider rejected",
      providerResponseCode: 410,
      now: "2026-06-30T09:00:00.000Z",
    });

    expect(attempt.status).toBe("failed");
    expect(attempt.failedAt).toBe("2026-06-30T09:00:00.000Z");
    expect(attempt.providerResponseCode).toBe(410);
  });

  it("sanitises notification click targets", () => {
    expect(safeNotificationClickTarget("/notifications")).toBe("/notifications");
    expect(safeNotificationClickTarget("https://evil.example")).toBe("/notifications");
    expect(safeNotificationClickTarget("//evil.example")).toBe("/notifications");
  });

  it("renders iPhone notification guidance", () => {
    const html = renderToStaticMarkup(
      <NotificationPreferencesManager
        preferences={mockNotificationPreferences}
        webPushPublicKey="public-key"
        webPushConfigured
        deliveryEnabled={false}
      />,
    );

    expect(html).toContain("iPhone requirement");
    expect(html).toContain("Add to Home Screen");
    expect(html).toContain("Enable Notifications");
    expect(html).toContain("Test notification");
  });

  it("does not define live Vercel crons (diagnostic control deploy)", () => {
    // For the Vercel control-test deploy, scheduled work is intentionally NOT
    // wired via vercel.json: the every-6-hours schedule exceeds Vercel Hobby's
    // once-daily cron limit (deploy error) and we do not want live scheduled
    // work firing during a diagnostic. Netlify scheduled functions remain the
    // scheduling mechanism for the Netlify host.
    const config = JSON.parse(fs.readFileSync(path.resolve("vercel.json"), "utf8")) as {
      crons?: Array<{ path: string }>;
    };

    expect(config.crons ?? []).toHaveLength(0);
    expect(fs.existsSync(path.resolve("netlify/functions/scheduled-notifications.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve("netlify/functions/scheduled-bank-sync.ts"))).toBe(true);
  });
});
