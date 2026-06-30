import type {
  Account,
  BankConnection,
  Bill,
  Budget,
  AppNotification,
  ManualFinanceItem,
  NotificationPreference,
  PushSubscriptionRecord,
  SavingsGoal,
  Transaction,
} from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type BankConnectionRow = Database["public"]["Tables"]["bank_connections"]["Row"];
type ManualFinanceItemRow =
  Database["public"]["Tables"]["manual_finance_items"]["Row"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];
type BillRow = Database["public"]["Tables"]["bills"]["Row"];
type SavingsGoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];
type NotificationPreferenceRow =
  Database["public"]["Tables"]["notification_preferences"]["Row"];
type AppNotificationRow = Database["public"]["Tables"]["app_notifications"]["Row"];
type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];

export function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    providerConnectionId: row.provider_connection_id,
    providerAccountId: row.provider_account_id,
    institutionName: row.institution_name,
    institutionId: row.institution_id,
    name: row.name,
    officialName: row.official_name,
    type: row.type,
    subtype: row.subtype,
    balance: row.balance,
    availableBalance: row.available_balance,
    creditLimit: row.credit_limit,
    currency: row.currency,
    mask: row.mask,
    purpose: row.purpose,
    accountRole: row.account_role,
    includeInCashflow: row.include_in_cashflow,
    includeInNetWorth: row.include_in_net_worth,
    includeInSafeToSpend: row.include_in_safe_to_spend,
    isSpendingAccount: row.is_spending_account,
    isBillsAccount: row.is_bills_account,
    isSavingsAccount: row.is_savings_account,
    linkedGoalIds: row.linked_goal_ids,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    consentExpiresAt: row.consent_expires_at,
    notes: row.notes,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function accountToRow(account: Account): AccountRow {
  return {
    id: account.id,
    user_id: account.userId,
    provider_connection_id: account.providerConnectionId,
    provider_account_id: account.providerAccountId,
    institution_name: account.institutionName,
    institution_id: account.institutionId,
    name: account.name,
    official_name: account.officialName,
    type: account.type,
    subtype: account.subtype,
    balance: account.balance,
    available_balance: account.availableBalance,
    credit_limit: account.creditLimit,
    currency: account.currency,
    mask: account.mask,
    purpose: account.purpose,
    account_role: account.accountRole,
    include_in_cashflow: account.includeInCashflow,
    include_in_net_worth: account.includeInNetWorth,
    include_in_safe_to_spend: account.includeInSafeToSpend,
    is_spending_account: account.isSpendingAccount,
    is_bills_account: account.isBillsAccount,
    is_savings_account: account.isSavingsAccount,
    linked_goal_ids: account.linkedGoalIds,
    sync_status: account.syncStatus,
    last_synced_at: account.lastSyncedAt,
    consent_expires_at: account.consentExpiresAt,
    notes: account.notes,
    provider: account.provider,
    status: account.status,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  };
}

export function bankConnectionFromRow(row: BankConnectionRow): BankConnection {
  return {
    id: row.id,
    provider: row.provider,
    institutionName: row.institution_name,
    institutionId: row.institution_id,
    status: row.status,
    consentStatus: row.consent_status,
    consentStartedAt: row.consent_started_at,
    consentExpiresAt: row.consent_expires_at,
    lastSyncedAt: row.last_synced_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function bankConnectionToRow(
  connection: BankConnection,
  userId: string,
): BankConnectionRow {
  return {
    id: connection.id,
    user_id: userId,
    provider: connection.provider,
    institution_name: connection.institutionName,
    institution_id: connection.institutionId,
    status: connection.status,
    consent_status: connection.consentStatus,
    consent_started_at: connection.consentStartedAt,
    consent_expires_at: connection.consentExpiresAt,
    last_synced_at: connection.lastSyncedAt,
    error_message: connection.errorMessage,
    created_at: connection.createdAt,
    updated_at: connection.updatedAt,
  };
}

export function manualFinanceItemFromRow(row: ManualFinanceItemRow): ManualFinanceItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.due_date,
    recurrence: row.recurrence,
    apr: row.apr,
    minimumPayment: row.minimum_payment,
    counterparty: row.counterparty,
    includeInCashflow: row.include_in_cashflow,
    includeInNetWorth: row.include_in_net_worth,
    notes: row.notes,
    status: row.status,
    reviewDate: row.review_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function manualFinanceItemToRow(
  item: ManualFinanceItem,
  userId: string,
): ManualFinanceItemRow {
  return {
    id: item.id,
    user_id: userId,
    name: item.name,
    type: item.type,
    direction: item.direction,
    amount: item.amount,
    currency: item.currency,
    due_date: item.dueDate,
    recurrence: item.recurrence,
    apr: item.apr,
    minimum_payment: item.minimumPayment,
    counterparty: item.counterparty,
    include_in_cashflow: item.includeInCashflow,
    include_in_net_worth: item.includeInNetWorth,
    notes: item.notes,
    status: item.status,
    review_date: item.reviewDate,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function transactionFromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    date: row.date,
    merchant: row.merchant,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    kind: row.kind,
    status: row.status,
    flags: row.flags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function budgetFromRow(row: BudgetRow): Budget {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    periodId: row.period_id,
    amount: row.amount,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function billFromRow(row: BillRow): Bill {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.due_date,
    recurrence: row.recurrence,
    categoryId: row.category_id,
    accountId: row.account_id,
    essential: row.essential,
    includeInCashflow: row.include_in_cashflow,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function savingsGoalFromRow(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    targetAmount: row.target_amount,
    currentAmount: row.current_amount,
    currency: row.currency,
    targetDate: row.target_date,
    priority: row.priority,
    monthlyContribution: row.monthly_contribution,
    includeInNetWorth: row.include_in_net_worth,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function notificationPreferenceFromRow(
  row: NotificationPreferenceRow,
): NotificationPreference {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    enabled: row.enabled,
    channels: row.channels,
    lowBalanceThreshold: row.low_balance_threshold,
    budgetWarningPercentage: row.budget_warning_percentage,
    billReminderDays: row.bill_reminder_days,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function notificationPreferenceToRow(
  preference: NotificationPreference,
  userId: string,
): NotificationPreferenceRow {
  return {
    id: preference.id,
    user_id: userId,
    type: preference.type,
    enabled: preference.enabled,
    channels: preference.channels,
    low_balance_threshold: preference.lowBalanceThreshold,
    budget_warning_percentage: preference.budgetWarningPercentage,
    bill_reminder_days: preference.billReminderDays,
    quiet_hours_start: preference.quietHoursStart,
    quiet_hours_end: preference.quietHoursEnd,
    created_at: preference.createdAt,
    updated_at: preference.updatedAt,
  };
}

export function appNotificationFromRow(row: AppNotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    severity: row.severity,
    channel: row.channel,
    title: row.title,
    body: row.body,
    privacySafeTitle: row.privacy_safe_title,
    privacySafeBody: row.privacy_safe_body,
    actionHref: row.action_href,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function appNotificationToRow(
  notification: AppNotification,
  userId: string,
): AppNotificationRow {
  return {
    id: notification.id,
    user_id: userId,
    type: notification.type,
    severity: notification.severity,
    channel: notification.channel,
    title: notification.title,
    body: notification.body,
    privacy_safe_title: notification.privacySafeTitle,
    privacy_safe_body: notification.privacySafeBody,
    action_href: notification.actionHref,
    entity_type: notification.entityType,
    entity_id: notification.entityId,
    status: notification.status,
    read_at: notification.readAt,
    dismissed_at: notification.dismissedAt,
    created_at: notification.createdAt,
    updated_at: notification.updatedAt,
  };
}

export function pushSubscriptionFromRow(row: PushSubscriptionRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpointHash: row.endpoint_hash,
    browser: row.browser,
    permission: row.permission,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
