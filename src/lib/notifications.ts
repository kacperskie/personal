import type {
  AppNotification,
  BankConnection,
  Bill,
  ManualFinanceItem,
  NotificationPreference,
  NotificationSeverity,
  NotificationType,
  Transaction,
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
  "new_transaction",
  "transaction_updated",
  "large_transaction",
  "potential_duplicate_payment",
  "new_bill_detected",
  "new_subscription_detected",
  "subscription_price_changed",
  "missing_expected_bill",
  "unusual_spending",
  "projected_bills_account_shortfall",
  "transaction_needs_review",
  "ai_monthly_review_ready",
  "ai_payday_plan_ready",
  "ai_review_failed",
  "openai_not_configured",
  "payday_planning",
  "manual_item_review",
  "safe_to_spend_change",
  "weekly_spending_summary",
  "monthly_spending_summary",
  "category_overspend",
  "safe_to_spend_drop",
  "bills_account_shortfall",
  "overdraft_risk",
  "overdraft_repayment_reminder",
  "amex_pocket_underfunded",
];

export const defaultNotificationSettings = {
  lowBalanceThreshold: 250,
  budgetWarningPercentage: 0.85,
  billReminderDays: 7,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

const disabledByDefaultNotificationTypes = new Set<NotificationType>([
  "weekly_spending_summary",
  "monthly_spending_summary",
  "category_overspend",
  "safe_to_spend_drop",
  "bills_account_shortfall",
  "overdraft_risk",
  "overdraft_repayment_reminder",
  "amex_pocket_underfunded",
]);

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
  new_transaction: {
    title: "New transaction detected",
    body: "New account activity is ready to review.",
  },
  transaction_updated: {
    title: "Transaction updated",
    body: "Account activity changed and may need review.",
  },
  large_transaction: {
    title: "Large transaction detected",
    body: "Account activity may need attention.",
  },
  potential_duplicate_payment: {
    title: "Potential duplicate payment",
    body: "Similar account activity may need review.",
  },
  new_bill_detected: {
    title: "New bill detected",
    body: "A recurring commitment may need review.",
  },
  new_subscription_detected: {
    title: "New subscription detected",
    body: "A recurring payment may need review.",
  },
  subscription_price_changed: {
    title: "Subscription price changed",
    body: "A recurring payment changed and may need review.",
  },
  missing_expected_bill: {
    title: "Expected bill missing",
    body: "An expected commitment has not appeared yet.",
  },
  unusual_spending: {
    title: "Unusual spending",
    body: "Spending activity may need review.",
  },
  projected_bills_account_shortfall: {
    title: "Bills account needs attention",
    body: "Projected commitments may need review.",
  },
  transaction_needs_review: {
    title: "Transaction needs review",
    body: "A transaction needs categorisation review.",
  },
  ai_monthly_review_ready: {
    title: "Money coach review ready",
    body: "A finance review is ready inside the app.",
  },
  ai_payday_plan_ready: {
    title: "Payday plan ready",
    body: "A payday planning summary is ready inside the app.",
  },
  ai_review_failed: {
    title: "Money coach needs attention",
    body: "A finance review could not be generated.",
  },
  openai_not_configured: {
    title: "Money coach unavailable",
    body: "The AI coach is not configured yet.",
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
  weekly_spending_summary: {
    title: "Weekly spending summary",
    body: "Your weekly finance summary is ready.",
  },
  monthly_spending_summary: {
    title: "Monthly spending summary",
    body: "Your monthly finance summary is ready.",
  },
  category_overspend: {
    title: "Budget warning",
    body: "A category needs attention.",
  },
  safe_to_spend_drop: {
    title: "Safe-to-spend changed",
    body: "Your available spending position needs attention.",
  },
  bills_account_shortfall: {
    title: "Bills account needs attention",
    body: "Projected commitments may need review.",
  },
  overdraft_risk: {
    title: "Overdraft needs attention",
    body: "Your overdraft position may need review.",
  },
  overdraft_repayment_reminder: {
    title: "Overdraft repayment reminder",
    body: "A planned repayment may need review.",
  },
  amex_pocket_underfunded: {
    title: "Card reserve needs attention",
    body: "Reserved card funding may need review.",
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
    enabled: !disabledByDefaultNotificationTypes.has(type),
    channels: ["in_app"],
    lowBalanceThreshold: defaultNotificationSettings.lowBalanceThreshold,
    budgetWarningPercentage: defaultNotificationSettings.budgetWarningPercentage,
    billReminderDays: defaultNotificationSettings.billReminderDays,
    weeklySummaryDay: 1,
    excludedCategories: [],
    excludedAccounts: [],
    largeTransactionThreshold: type === "large_transaction" ? 250 : null,
    unusualSpendingSensitivity: "medium",
    notifyWhenAmexPocketUnderfunded: true,
    notifyWhenBillsAccountShortfallExists: true,
    notifyWhenOverdraftPositionWorsens: true,
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
  transactions?: Transaction[];
  weeklySpendingTotal?: number;
  monthlySpendingTotal?: number;
  billsAccountShortfall?: number;
  overdraftUsed?: number;
  overdraftWorsened?: boolean;
  amexUnfundedAmount?: number | null;
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

  if (
    isNotificationTypeEnabled(input.preferences, "safe_to_spend_drop") &&
    input.previousSafeToSpend !== undefined &&
    input.safeToSpend < input.previousSafeToSpend - 100
  ) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "safe_to_spend_drop",
        severity: input.safeToSpend < 0 ? "urgent" : "warning",
        title: "Safe-to-spend dropped",
        body: `Safe-to-spend has dropped to ${formatCurrency(input.safeToSpend)}.`,
        actionHref: "/",
        entityType: "dashboard",
        entityId: null,
        now,
      }),
    );
  }

  if (isNotificationTypeEnabled(input.preferences, "weekly_spending_summary")) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "weekly_spending_summary",
        severity: "info",
        title: "Weekly spending summary",
        body: `Tracked weekly spending is ${formatCurrency(input.weeklySpendingTotal ?? 0)}.`,
        actionHref: "/transactions",
        entityType: "dashboard",
        entityId: "weekly_spending",
        now,
      }),
    );
  }

  if (isNotificationTypeEnabled(input.preferences, "monthly_spending_summary")) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "monthly_spending_summary",
        severity: "info",
        title: "Monthly spending summary",
        body: `Tracked monthly spending is ${formatCurrency(input.monthlySpendingTotal ?? 0)}.`,
        actionHref: "/transactions",
        entityType: "dashboard",
        entityId: "monthly_spending",
        now,
      }),
    );
  }

  if (isNotificationTypeEnabled(input.preferences, "category_overspend")) {
    input.budgetHealth
      .filter((budget) => budget.usagePercentage >= 1)
      .forEach((budget) => {
        notifications.push(
          createNotificationDraft({
            userId: input.userId,
            type: "category_overspend",
            severity: "urgent",
            title: `${budget.category} is over budget`,
            body: `${budget.category} is over budget by ${formatCurrency(Math.abs(budget.remaining))}.`,
            actionHref: "/budgets",
            entityType: "budget_category",
            entityId: budget.categoryId,
            now,
          }),
        );
      });
  }

  if (
    isNotificationTypeEnabled(input.preferences, "bills_account_shortfall") &&
    (input.billsAccountShortfall ?? 0) > 0
  ) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "bills_account_shortfall",
        severity: "urgent",
        title: "Bills account shortfall",
        body: `Known bills exceed the bills account by ${formatCurrency(input.billsAccountShortfall ?? 0)}.`,
        actionHref: "/",
        entityType: "dashboard",
        entityId: "bills_account",
        now,
      }),
    );
  }

  if (
    isNotificationTypeEnabled(input.preferences, "overdraft_risk") &&
    (input.overdraftUsed ?? 0) > 0 &&
    input.overdraftWorsened
  ) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "overdraft_risk",
        severity: "warning",
        title: "Overdraft position needs review",
        body: `Overdraft used is ${formatCurrency(input.overdraftUsed ?? 0)}.`,
        actionHref: "/",
        entityType: "dashboard",
        entityId: "overdraft",
        now,
      }),
    );
  }

  if (
    isNotificationTypeEnabled(input.preferences, "amex_pocket_underfunded") &&
    input.amexUnfundedAmount !== null &&
    (input.amexUnfundedAmount ?? 0) > 0
  ) {
    notifications.push(
      createNotificationDraft({
        userId: input.userId,
        type: "amex_pocket_underfunded",
        severity: "warning",
        title: "Amex pocket is underfunded",
        body: `The linked card reserve is short by ${formatCurrency(input.amexUnfundedAmount ?? 0)}.`,
        actionHref: "/",
        entityType: "dashboard",
        entityId: "amex_funding",
        now,
      }),
    );
  }

  return notifications;
}
