"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, Save, ShieldCheck } from "lucide-react";
import {
  auditPushPermissionRequestedAction,
  deletePushSubscriptionPlaceholderAction,
  saveNotificationPreferencesAction,
  savePushSubscriptionPlaceholderAction,
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
}: {
  preferences: NotificationPreference[];
}) {
  const [drafts, setDrafts] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const shared = drafts[0];

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
        const permission =
          "Notification" in window ? await Notification.requestPermission() : "unsupported";
        await auditPushPermissionRequestedAction(permission);
        await savePushSubscriptionPlaceholderAction({
          permission,
          browser: navigator.userAgent,
        });
        setMessage(
          permission === "granted"
            ? "Browser notification permission granted. Real push delivery is still disabled."
            : "Notification permission was not granted. In-app notifications remain enabled.",
        );
      })().catch((error: Error) => setMessage(error.message));
    });
  }

  function deletePlaceholder() {
    setMessage(null);
    startTransition(() => {
      void deletePushSubscriptionPlaceholderAction()
        .then(() => setMessage("Push placeholder removed."))
        .catch((error: Error) => setMessage(error.message));
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Notification preferences</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            In-app notifications are available now. Web push is a placeholder and only asks
            for permission after you tap the enable button.
          </p>
        </div>
        <Bell className="h-5 w-5 text-teal" aria-hidden="true" />
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
          onClick={deletePlaceholder}
          disabled={isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/70 disabled:opacity-50"
        >
          <BellOff className="h-4 w-4" aria-hidden="true" />
          Remove push placeholder
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-ink/70">{message}</p> : null}
    </section>
  );
}
