import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallGuidance } from "../src/components/pwa/install-guidance";
import {
  createDefaultNotificationPreferences,
  generateFinanceNotifications,
  getPrivacySafeNotificationCopy,
  isWithinQuietHours,
} from "../src/lib/notifications";
import {
  dismissNotification,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../src/lib/repositories/notification-repository";
import {
  budgetHealth,
  dashboardSummary,
  mockAppNotifications,
  mockBankConnections,
  mockBills,
  mockManualFinanceItems,
  mockNotificationPreferences,
} from "../src/lib/mock-data";

const notificationTables = [
  "notification_preferences",
  "notification_rules",
  "app_notifications",
  "push_subscriptions",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 5 notifications and PWA", () => {
  it("generates deterministic notifications from finance data", () => {
    const notifications = generateFinanceNotifications({
      userId: "user_mock_001",
      asOfDate: "2026-06-30",
      safeToSpend: 100,
      previousSafeToSpend: 260,
      preferences: mockNotificationPreferences,
      bills: mockBills,
      budgetHealth,
      bankConnections: mockBankConnections,
      manualFinanceItems: mockManualFinanceItems,
    });

    expect(notifications.map((notification) => notification.type)).toContain("low_balance");
    expect(notifications.map((notification) => notification.type)).toContain("bill_due");
    expect(notifications.map((notification) => notification.type)).toContain(
      "budget_threshold",
    );
    expect(notifications.map((notification) => notification.type)).toContain(
      "consent_renewal",
    );
    expect(notifications.map((notification) => notification.type)).toContain(
      "account_sync_failure",
    );
    expect(notifications.map((notification) => notification.type)).toContain(
      "safe_to_spend_change",
    );
  });

  it("counts unread fallback notifications", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(getUnreadNotificationCount()).resolves.toBe(
      mockAppNotifications.filter((notification) => notification.status === "unread")
        .length,
    );
  });

  it("marks one notification as read in fallback mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const updated = await markNotificationRead(mockAppNotifications[0].id);

    expect(updated?.status).toBe("read");
    expect(updated?.readAt).toBeTruthy();
  });

  it("marks all notifications as read in fallback mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const updated = await markAllNotificationsRead();

    expect(updated.length).toBeGreaterThan(0);
    expect(updated.every((notification) => notification.status === "read")).toBe(true);
  });

  it("dismisses a notification in fallback mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const dismissed = await dismissNotification(mockAppNotifications[0].id);

    expect(dismissed?.status).toBe("dismissed");
    expect(dismissed?.dismissedAt).toBeTruthy();
  });

  it("creates notification preference defaults", () => {
    const preferences = createDefaultNotificationPreferences("user_test", "2026-06-30T00:00:00.000Z");

    expect(preferences).toHaveLength(9);
    expect(preferences.every((preference) => preference.channels.includes("in_app"))).toBe(
      true,
    );
    expect(preferences[0].lowBalanceThreshold).toBe(250);
    expect(preferences[0].budgetWarningPercentage).toBe(0.85);
  });

  it("detects quiet hours across midnight", () => {
    expect(isWithinQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("06:30", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("12:00", "22:00", "07:00")).toBe(false);
  });

  it("returns privacy-safe notification copy", () => {
    expect(getPrivacySafeNotificationCopy("bill_due")).toEqual({
      title: "Bill due soon",
      body: "A planned commitment is coming up.",
    });
    expect(getPrivacySafeNotificationCopy("account_sync_failure").title).toBe(
      "Account connection needs attention",
    );
  });

  it("keeps notification migration files and RLS coverage", () => {
    const migrationPath = path.resolve(
      "supabase/migrations/20260702000000_phase5_notifications_pwa.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    for (const table of notificationTables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`'${table}'`);
      expect(sql).toMatch(
        new RegExp(
          `create table if not exists public\\.${table} \\([\\s\\S]*?user_id uuid not null`,
        ),
      );
    }

    expect(sql).toContain("auth.uid() = user_id");
    expect(sql).toContain("sensitive push subscription placeholders");
  });

  it("adds PWA manifest and service worker files", () => {
    const manifest = fs.readFileSync(path.resolve("public/manifest.webmanifest"), "utf8");
    const serviceWorker = fs.readFileSync(path.resolve("public/sw.js"), "utf8");

    expect(JSON.parse(manifest).name).toBe("Personal Finance HQ");
    expect(serviceWorker).toContain("notificationclick");
    expect(serviceWorker).toContain("push");
  });

  it("renders iPhone install guidance", () => {
    const html = renderToStaticMarkup(<InstallGuidance />);

    expect(html).toContain("Install on iPhone");
    expect(html).toContain("Open Personal Finance HQ in Safari");
    expect(html).toContain("Add to Home Screen");
  });

  it("keeps generated notification copy detailed only inside app", () => {
    const generated = generateFinanceNotifications({
      userId: "user_mock_001",
      asOfDate: "2026-06-30",
      safeToSpend: dashboardSummary.safeToSpend,
      preferences: mockNotificationPreferences,
      bills: mockBills,
      budgetHealth,
      bankConnections: mockBankConnections,
      manualFinanceItems: mockManualFinanceItems,
    });
    const billNotification = generated.find(
      (notification) => notification.type === "bill_due",
    );

    expect(billNotification?.body).toContain("£");
    expect(billNotification?.privacySafeTitle).toBe("Bill due soon");
    expect(billNotification?.privacySafeBody).not.toContain("£");
  });
});
