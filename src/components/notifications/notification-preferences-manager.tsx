"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Save, ShieldCheck } from "lucide-react";
import {
  saveNotificationPreferencesAction,
} from "@/app/settings/actions";
import type { NotificationChannel, NotificationPreference } from "@/lib/domain";

const notificationTypeLabels: Record<NotificationPreference["type"], string> = {
  low_balance: "Low balance",
  bill_due: "Bill due",
  budget_threshold: "Budget threshold",
  subscription_change: "Subscription change",
  consent_renewal: "Consent renewal",
  account_sync_failure: "Account sync failure",
  connection_successful: "Connection successful",
  sync_successful: "Sync successful",
  connection_revoked: "Connection revoked",
  new_transaction: "New transaction",
  transaction_updated: "Transaction updated",
  large_transaction: "Large transaction",
  potential_duplicate_payment: "Potential duplicate payment",
  new_bill_detected: "New bill detected",
  new_subscription_detected: "New subscription detected",
  subscription_price_changed: "Subscription price changed",
  missing_expected_bill: "Missing expected bill",
  unusual_spending: "Unusual spending",
  projected_bills_account_shortfall: "Bills account shortfall",
  transaction_needs_review: "Transaction review",
  ai_monthly_review_ready: "AI monthly review ready",
  ai_payday_plan_ready: "AI payday plan ready",
  ai_review_failed: "AI review failed",
  openai_not_configured: "OpenAI not configured",
  payday_planning: "Payday planning",
  manual_item_review: "Manual item review",
  safe_to_spend_change: "Safe-to-spend change",
  weekly_spending_summary: "Weekly spending summary",
  monthly_spending_summary: "Monthly spending summary",
  category_overspend: "Category overspend",
  safe_to_spend_drop: "Safe-to-spend drop",
  bills_account_shortfall: "Bills account shortfall",
  overdraft_risk: "Overdraft risk",
  overdraft_repayment_reminder: "Overdraft repayment reminder",
  amex_pocket_underfunded: "Amex pocket underfunded",
};

function hasChannel(preference: NotificationPreference, channel: NotificationChannel) {
  return preference.channels.includes(channel);
}

function updateChannel(
  preference: NotificationPreference,
  channel: NotificationChannel,
  enabled: boolean,
): NotificationPreference {
  const channels = enabled
    ? Array.from(new Set([...preference.channels, channel]))
    : preference.channels.filter((candidate) => candidate !== channel);

  return {
    ...preference,
    channels,
  };
}

export function NotificationPreferencesManager({
  preferences,
  webPushPublicKey,
  webPushConfigured,
  deliveryEnabled,
}: {
  preferences: NotificationPreference[];
  webPushPublicKey: string | null;
  webPushConfigured: boolean;
  deliveryEnabled: boolean;
}) {
  const [drafts, setDrafts] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }

    return Notification.permission;
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();
  const shared = drafts[0];

  useEffect(() => {
    if (!("Notification" in window)) {
      return;
    }

    void navigator.serviceWorker?.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, []);

  function updatePreference(id: string, changes: Partial<NotificationPreference>) {
    setDrafts((current) =>
      current.map((preference) =>
        preference.id === id
          ? { ...preference, ...changes, updatedAt: new Date().toISOString() }
          : preference,
      ),
    );
  }

  function updateAllShared(changes: Partial<NotificationPreference>) {
    setDrafts((current) =>
      current.map((preference) => ({
        ...preference,
        ...changes,
        updatedAt: new Date().toISOString(),
      })),
    );
  }

  function savePreferences() {
    setMessage(null);
    startTransition(() => {
      void saveNotificationPreferencesAction(drafts)
        .then((saved) => {
          setDrafts(saved);
          setMessage("Notification preferences saved.");
        })
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function requestNotifications() {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
          setPermissionStatus("unsupported");
          setMessage("This browser does not support Web Push notifications.");
          return;
        }

        if (!webPushPublicKey) {
          setMessage("Web Push is not configured. Add VAPID keys on the server first.");
          return;
        }

        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);

        if (permission !== "granted") {
          setMessage("Notification permission was not granted. In-app notifications remain enabled.");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(webPushPublicKey),
          }));

        const response = await fetch("/api/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            permission,
            browser: navigator.userAgent,
          }),
        });

        if (!response.ok) {
          throw new Error("Push subscription could not be saved.");
        }

        setPushEnabled(true);
        setMessage(
          deliveryEnabled
            ? "Push notifications are enabled for this device."
            : "Push subscription saved. Delivery remains disabled until the server flag is enabled.",
        );
      })().catch((error: Error) => setMessage(error.message));
    });
  }

  function unsubscribePush() {
    setMessage(null);
    startTransition(() => {
      void (async () => {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          setPushEnabled(false);
          setMessage("No push subscription is active on this device.");
          return;
        }

        await fetch("/api/notifications/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        setPushEnabled(false);
        setMessage("Push notifications are disabled on this device.");
      })()
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function sendTestNotification() {
    setMessage(null);
    startTransition(() => {
      void fetch("/api/notifications/push/test", { method: "POST" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Test notification could not be sent.");
          }

          const payload = (await response.json()) as { attempts?: Array<{ status: string }> };
          const status = payload.attempts?.map((attempt) => attempt.status).join(", ") ?? "created";
          setMessage(`Test notification processed: ${status}.`);
        })
        .catch((error: Error) => setMessage(error.message));
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Notification preferences</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            In-app notifications are available now. Web Push works on iPhone only when
            Personal Finance HQ is installed from Safari using Add to Home Screen.
          </p>
        </div>
        <Bell className="h-5 w-5 text-teal" aria-hidden="true" />
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-ink/70 md:grid-cols-4">
        <div>
          <p className="font-semibold text-ink">iPhone requirement</p>
          <p className="mt-1">Install to Home Screen before enabling push on iPhone.</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Permission</p>
          <p className="mt-1">{permissionStatus}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Push status</p>
          <p className="mt-1">{pushEnabled ? "Enabled on this device" : "Disabled"}</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Server delivery</p>
          <p className="mt-1">
            {webPushConfigured
              ? deliveryEnabled
                ? "Enabled"
                : "Configured, disabled"
              : "Missing VAPID public key"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="text-sm text-ink/70">
          Low-balance threshold
          <input
            type="number"
            min="0"
            value={shared?.lowBalanceThreshold ?? 250}
            onChange={(event) =>
              updateAllShared({ lowBalanceThreshold: Number(event.target.value) })
            }
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-sm text-ink/70">
          Budget warning percentage
          <input
            type="number"
            min="0"
            max="100"
            value={Math.round((shared?.budgetWarningPercentage ?? 0.85) * 100)}
            onChange={(event) =>
              updateAllShared({ budgetWarningPercentage: Number(event.target.value) / 100 })
            }
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-sm text-ink/70">
          Bill reminder days
          <input
            type="number"
            min="0"
            value={shared?.billReminderDays ?? 7}
            onChange={(event) =>
              updateAllShared({ billReminderDays: Number(event.target.value) })
            }
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-sm text-ink/70">
          Quiet hours start
          <input
            type="time"
            value={shared?.quietHoursStart ?? ""}
            onChange={(event) =>
              updateAllShared({ quietHoursStart: event.target.value || null })
            }
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-sm text-ink/70">
          Quiet hours end
          <input
            type="time"
            value={shared?.quietHoursEnd ?? ""}
            onChange={(event) =>
              updateAllShared({ quietHoursEnd: event.target.value || null })
            }
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3">
        {drafts.map((preference) => (
          <div
            key={preference.id}
            className="grid gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <label className="flex items-center gap-3 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={preference.enabled}
                onChange={(event) =>
                  updatePreference(preference.id, { enabled: event.target.checked })
                }
              />
              {notificationTypeLabels[preference.type]}
            </label>
            <div className="flex flex-wrap gap-3">
              {(["in_app", "web_push", "email_placeholder"] as NotificationChannel[]).map(
                (channel) => (
                  <label
                    key={channel}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/70"
                  >
                    <input
                      type="checkbox"
                      checked={hasChannel(preference, channel)}
                      onChange={(event) =>
                        updatePreference(
                          preference.id,
                          updateChannel(preference, channel, event.target.checked),
                        )
                      }
                    />
                    {channel.replaceAll("_", " ")}
                  </label>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={savePreferences}
          disabled={isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save preferences
        </button>
        <button
          type="button"
          onClick={requestNotifications}
          disabled={isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Enable Notifications
        </button>
        <button
          type="button"
          onClick={sendTestNotification}
          disabled={isPending || !pushEnabled}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Test notification
        </button>
        <button
          type="button"
          onClick={unsubscribePush}
          disabled={isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/70 disabled:opacity-50"
        >
          <BellOff className="h-4 w-4" aria-hidden="true" />
          Disable push
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-ink/70">{message}</p> : null}
    </section>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}
