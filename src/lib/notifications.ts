import type {
  AppNotification,
  BankConnection,
  Bill,
  ManualFinanceItem,
  NotificationPreference,
  NotificationSeverity,
  NotificationType,
} from "@/lib/domain";
import type { BudgetHealthItem } from "@/lib/finance";
import { getConnectionLifecycleStatus } from "@/lib/finance";
import { formatCurrency, formatDateShort, formatPercent } from "@/lib/format";

export const notificationTypes: NotificationType[] = [
  "low_balance",
  "bill_due",
  "budget_threshold",
  "subscription_change",
  "consent_renewal",
  "account_sync_failure",
  "connection_successful",
  "sync_successful",
  "connection_revoked",
  "payday_planning",
  "manual_item_review",
  "safe_to_spend_change",
];

export const defaultNotificationSettings = {
  lowBalanceThreshold: 250,
  budgetWarningPercentage: 0.85,
  billReminderDays: 7,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

const privacyCopy: Record<NotificationType, { title: string; body: string }> = {
  low_balance: {
    title: "Low balance warning",
    body: "Your finance dashboard needs attention.",
  },
  bill_due: {
    title: "Bill due soon",
    body: "A planned commitment is coming up.",
  },
  budget_threshold: {
    title: "Budget warning",
    body: "A budget needs attention.",
  },
  subscription_change: {
    title: "Subscription update",
    body: "A subscription may need review.",
  },
  consent_renewal: {
    title: "Account connection needs attention",
    body: "A connection may need renewed consent.",
  },
  account_sync_failure: {
    title: "Account connection needs attention",
    body: "A connection did not sync successfully.",
  },
  connection_successful: {
    title: "Account connection ready",
    body: "A connection was completed successfully.",
  },
  sync_successful: {
    title: "Account sync complete",
    body: "A connection synced successfully.",
  },
  connection_revoked: {
    title: "Account connection disconnected",
    body: "A connection was disconnected.",
  },
  payday_planning: {
    title: "Payday planning",
    body: "Your payday plan is ready to review.",
  },
  manual_item_review: {
    title: "Manual item needs review",
    body: "A manual finance item needs attention.",
  },
  safe_to_spend_change: {
    title: "Safe-to-spend changed",
    body: "Your available spending position has changed.",
  },
};

export function createDefaultNotificationPreferences(
  userId: string,
  now = new Date().toISOString(),
): NotificationPreference[] {
  return notificationTypes.map((type) => ({
    id: `pref_${type}`,
    userId,
    type,
    enabled: true,
    channels: ["in_app"],
    lowBalanceThreshold: defaultNotificationSettings.lowBalanceThreshold,
    budgetWarningPercentage: defaultNotificationSettings.budgetWarningPercentage,
    billReminderDays: defaultNotificationSettings.billReminderDays,
    quietHoursStart: defaultNotificationSettings.quietHoursStart,
    quietHoursEnd: defaultNotificationSettings.quietHoursEnd,
    createdAt: now,
    updatedAt: now,
  }));
}

export function getPreferenceForType(
  preferences: NotificationPreference[],
  type: NotificationType,
) {
  return (
    preferences.find((preference) => preference.type === type) ??
    createDefaultNotificationPreferences("user_mock_001").find(
      (preference) => preference.type === type,
    )
  );
}

export function isNotificationTypeEnabled(
  preferences: NotificationPreference[],
  type: NotificationType,
) {
  return getPreferenceForType(preferences, type)?.enabled ?? true;
}

export function isWithinQuietHours(
  currentTime: string,
  quietHoursStart: string | null,
  quietHoursEnd: string | null,
) {
  if (!quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const current = currentTime.slice(0, 5);

  if (quietHoursStart <= quietHoursEnd) {
    return current >= quietHoursStart && current < quietHoursEnd;
  }

  return current >= quietHoursStart || current < quietHoursEnd;
}

export function getPrivacySafeNotificationCopy(type: NotificationType) {
  return privacyCopy[type];
}

type NotificationDraftInput = {
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionHref: string | null;
  entityType: string | null;
  entityId: string | null;
  now: string;
};

function createNotificationDraft(input: NotificationDraftInput): AppNotification {
  const safeCopy = getPrivacySafeNotificationCopy(input.type);

  return {
    id: `notif_${input.type}_${input.entityId ?? "general"}_${input.now.slice(0, 10)}`,
    userId: input.userId,
    type: input.type,
    severity: input.severity,
    channel: "in_app",
    title: input.title,
    body: input.body,
    privacySafeTitle: safeCopy.title,
    privacySafeBody: safeCopy.body,
    actionHref: input.actionHref,
    entityType: input.entityType,
    entityId: input.entityId,
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function dateDiffInDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.ceil((end - start) / 86_400_000);
}

export type NotificationGenerationInput = {
  userId: string;
  asOfDate: string;
  safeToSpend: number;
  previousSafeToSpend?: number;
  preferences: NotificationPreference[];
  bills: Bill[];
  budgetHealth: BudgetHealthItem[];
  bankConnections: BankConnection[];
  manualFinanceItems: ManualFinanceItem[];
};

export function generateFinanceNotifications(
  input: NotificationGenerationInput,
): AppNotification[] {
  const now = `${input.asOfDate}T09:00:00.000Z`;
  const notifications: AppNotification[] = [];
  const lowBalancePreference = getPreferenceForType(input.preferences, "low_balance");
  const billPreference = getPreferenceForType(input.preferences, "bill_due");
  const budgetPreference = getPreferenceForType(input.preferences, "budget_threshold");

  if (
    isNotificationTypeEnabled(input.preferences, "low_balance") &&
    input.safeToSpend < (lowBalancePreference?.lowBalanceThreshold ?? 250)
  ) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "low_balance",
        severity: input.safeToSpend < 0 ? "urgent" : "warning",
        title: "Safe-to-spend is below your threshold",
        body: `Safe-to-spend is ${formatCurrency(input.safeToSpend)}, below your configured threshold.`,
        actionHref: "/",
        entityType: "dashboard",
        entityId: null,
        now,
      }),
    );
  }

  if (isNotificationTypeEnabled(input.preferences, "bill_due")) {
    const reminderDays = billPreference?.billReminderDays ?? 7;

    input.bills
      .filter((bill) => {
        const daysUntilDue = dateDiffInDays(input.asOfDate, bill.dueDate);
        return daysUntilDue >= 0 && daysUntilDue <= reminderDays;
      })
      .forEach((bill) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "bill_due",
            severity: dateDiffInDays(input.asOfDate, bill.dueDate) <= 2 ? "urgent" : "warning",
            title: `${bill.name} is due soon`,
            body: `${bill.name} is due on ${formatDateShort(bill.dueDate)} for ${formatCurrency(bill.amount)}.`,
            actionHref: "/bills-and-subscriptions",
            entityType: "bill",
            entityId: bill.id,
            now,
          }),
        );
      });
  }

  if (isNotificationTypeEnabled(input.preferences, "budget_threshold")) {
    const threshold = budgetPreference?.budgetWarningPercentage ?? 0.85;

    input.budgetHealth
      .filter((budget) => budget.usagePercentage >= threshold)
      .forEach((budget) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "budget_threshold",
            severity: budget.usagePercentage >= 1 ? "urgent" : "warning",
            title: `${budget.category} budget warning`,
            body: `${budget.category} is at ${formatPercent(budget.usagePercentage)} of its budget.`,
            actionHref: "/budgets",
            entityType: "budget_category",
            entityId: budget.categoryId,
            now,
          }),
        );
      });
  }

  if (isNotificationTypeEnabled(input.preferences, "consent_renewal")) {
    input.bankConnections
      .filter((connection) => {
        const status = getConnectionLifecycleStatus(connection, input.asOfDate);
        const daysUntilExpiry = connection.consentExpiresAt
          ? dateDiffInDays(input.asOfDate, connection.consentExpiresAt.slice(0, 10))
          : Number.POSITIVE_INFINITY;
        return status === "needs_reconsent" || daysUntilExpiry <= 14;
      })
      .forEach((connection) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "consent_renewal",
            severity: "warning",
            title: `${connection.institutionName} consent needs attention`,
            body: `${connection.institutionName} consent is expired or expires soon.`,
            actionHref: "/settings/connected-accounts",
            entityType: "bank_connection",
            entityId: connection.id,
            now,
          }),
        );
      });
  }

  if (isNotificationTypeEnabled(input.preferences, "account_sync_failure")) {
    input.bankConnections
      .filter((connection) => connection.status === "sync_failed")
      .forEach((connection) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "account_sync_failure",
            severity: "urgent",
            title: `${connection.institutionName} sync failed`,
            body: connection.errorMessage ?? "A provider connection failed to sync.",
            actionHref: "/settings/connected-accounts",
            entityType: "bank_connection",
            entityId: connection.id,
            now,
          }),
        );
      });
  }

  if (isNotificationTypeEnabled(input.preferences, "manual_item_review")) {
    input.manualFinanceItems
      .filter((item) => item.reviewDate && item.reviewDate <= input.asOfDate)
      .forEach((item) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "manual_item_review",
            severity: "info",
            title: `${item.name} needs review`,
            body: `${item.name} has reached its review date.`,
            actionHref: "/manual-entries",
            entityType: "manual_finance_item",
            entityId: item.id,
            now,
          }),
        );
      });
  }

  if (
    isNotificationTypeEnabled(input.preferences, "safe_to_spend_change") &&
    input.previousSafeToSpend !== undefined
  ) {
    const difference = input.safeToSpend - input.previousSafeToSpend;

    if (Math.abs(difference) >= 100) {
      notifications.push(
        createNotificationDraft({
          userId: input.userId,
          type: "safe_to_spend_change",
          severity: "info",
          title: "Safe-to-spend changed",
          body: `Safe-to-spend changed by ${formatCurrency(difference)} since the last snapshot.`,
          actionHref: "/",
          entityType: "dashboard",
          entityId: null,
          now,
        }),
      );
    }
  }

  return notifications;
}
