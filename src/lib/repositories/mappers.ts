import type {
  Account,
  AIInsight,
  BankConnection,
  Bill,
  BudgetPeriod,
  Budget,
  AppNotification,
  Category,
  Debt,
  ManualFinanceItem,
  MerchantRule,
  NotificationDeliveryAttempt,
  NotificationPreference,
  PushSubscriptionRecord,
  RecurringPaymentCandidate,
  SavingsGoal,
  SpendingAnomaly,
  Transaction,
  TransactionEnrichment,
  DetectedBill,
  DetectedSubscription,
  CashflowEvent,
  Subscription,
} from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type BankConnectionRow = Database["public"]["Tables"]["bank_connections"]["Row"];
type ManualFinanceItemRow =
  Database["public"]["Tables"]["manual_finance_items"]["Row"];
type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"];
type BudgetPeriodRow = Database["public"]["Tables"]["budget_periods"]["Row"];
type BillRow = Database["public"]["Tables"]["bills"]["Row"];
type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type SavingsGoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];
type DebtRow = Database["public"]["Tables"]["debts"]["Row"];
type AIInsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];
type NotificationPreferenceRow =
  Database["public"]["Tables"]["notification_preferences"]["Row"];
type AppNotificationRow = Database["public"]["Tables"]["app_notifications"]["Row"];
type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];
type NotificationDeliveryAttemptRow =
  Database["public"]["Tables"]["notification_delivery_attempts"]["Row"];
type MerchantRuleRow = Database["public"]["Tables"]["merchant_rules"]["Row"];
type TransactionEnrichmentRow =
  Database["public"]["Tables"]["transaction_enrichments"]["Row"];
type RecurringPaymentCandidateRow =
  Database["public"]["Tables"]["recurring_payment_candidates"]["Row"];
type DetectedBillRow = Database["public"]["Tables"]["detected_bills"]["Row"];
type DetectedSubscriptionRow =
  Database["public"]["Tables"]["detected_subscriptions"]["Row"];
type SpendingAnomalyRow = Database["public"]["Tables"]["spending_anomalies"]["Row"];
type CashflowEventRow = Database["public"]["Tables"]["cashflow_events"]["Row"];

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
    providerConnectionId: row.provider_connection_id,
    providerTransactionId: row.provider_transaction_id,
    providerUpdatedAt: row.provider_updated_at,
    providerStatus: row.provider_status,
    providerDeletedAt: row.provider_deleted_at,
    providerRestoredAt: row.provider_restored_at,
    date: row.date,
    merchant: row.merchant,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    kind: row.kind,
    status: row.status,
    flags: row.flags,
    pending: row.pending,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentId: row.parent_id,
    kind: row.kind,
    budgetType: row.budget_type as Category["budgetType"],
    includeInBudget: row.include_in_budget,
    status: row.status,
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

export function budgetPeriodFromRow(row: BudgetPeriodRow): BudgetPeriod {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
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

export function subscriptionFromRow(row: SubscriptionRow): Subscription {
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
    includeInCashflow: row.include_in_cashflow,
    status: row.status,
    reviewDate: row.review_date,
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

export function debtFromRow(row: DebtRow): Debt {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    balance: row.balance,
    currency: row.currency,
    apr: row.apr,
    minimumPayment: row.minimum_payment,
    dueDate: row.due_date,
    lender: row.lender,
    accountId: row.account_id,
    includeInNetWorth: row.include_in_net_worth,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function aiInsightFromRow(row: AIInsightRow): AIInsight {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as AIInsight["type"],
    mode: row.mode ?? undefined,
    title: row.title,
    summary: row.summary,
    evidence: row.evidence,
    assumptions: row.assumptions,
    nextAction: row.next_action,
    prompt: row.prompt ?? undefined,
    redactedContextSummary: row.redacted_context_summary ?? undefined,
    responseSummary: row.response_summary ?? undefined,
    dataUsed: row.data_used as AIInsight["dataUsed"],
    model: row.model ?? undefined,
    errorStatus: row.error_status,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function aiInsightToRow(insight: AIInsight, userId: string): AIInsightRow {
  return {
    id: insight.id,
    user_id: userId,
    type: insight.type,
    mode: insight.mode ?? null,
    title: insight.title,
    summary: insight.summary,
    evidence: insight.evidence,
    assumptions: insight.assumptions,
    next_action: insight.nextAction,
    prompt: insight.prompt ?? null,
    redacted_context_summary: insight.redactedContextSummary ?? null,
    response_summary: insight.responseSummary ?? null,
    data_used: insight.dataUsed ?? {},
    model: insight.model ?? null,
    error_status: insight.errorStatus ?? null,
    status: insight.status,
    created_at: insight.createdAt,
  };
}

export function merchantRuleFromRow(row: MerchantRuleRow): MerchantRule {
  return {
    id: row.id,
    userId: row.user_id,
    matchPattern: row.match_pattern,
    normalisedMerchantName: row.normalised_merchant_name,
    merchantGroup: row.merchant_group,
    category: row.category,
    subcategory: row.subcategory,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function merchantRuleToRow(rule: MerchantRule, userId: string): MerchantRuleRow {
  return {
    id: rule.id,
    user_id: userId,
    match_pattern: rule.matchPattern,
    normalised_merchant_name: rule.normalisedMerchantName,
    merchant_group: rule.merchantGroup,
    category: rule.category,
    subcategory: rule.subcategory,
    priority: rule.priority,
    status: rule.status,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

export function transactionEnrichmentFromRow(
  row: TransactionEnrichmentRow,
): TransactionEnrichment {
  return {
    id: row.id,
    userId: row.user_id,
    transactionId: row.transaction_id,
    normalisedMerchantName: row.normalised_merchant_name,
    merchantGroup: row.merchant_group,
    category: row.category,
    subcategory: row.subcategory,
    confidenceScore: row.confidence_score,
    enrichmentSource: row.enrichment_source,
    userReviewed: row.user_reviewed,
    excludedFromSpending: row.excluded_from_spending,
    internalTransfer: row.internal_transfer,
    billCandidate: row.bill_candidate,
    subscriptionCandidate: row.subscription_candidate,
    recurringCandidate: row.recurring_candidate,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transactionEnrichmentToRow(
  enrichment: TransactionEnrichment,
  userId: string,
): TransactionEnrichmentRow {
  return {
    id: enrichment.id,
    user_id: userId,
    transaction_id: enrichment.transactionId,
    normalised_merchant_name: enrichment.normalisedMerchantName,
    merchant_group: enrichment.merchantGroup,
    category: enrichment.category,
    subcategory: enrichment.subcategory,
    confidence_score: enrichment.confidenceScore,
    enrichment_source: enrichment.enrichmentSource,
    user_reviewed: enrichment.userReviewed,
    excluded_from_spending: enrichment.excludedFromSpending,
    internal_transfer: enrichment.internalTransfer,
    bill_candidate: enrichment.billCandidate,
    subscription_candidate: enrichment.subscriptionCandidate,
    recurring_candidate: enrichment.recurringCandidate,
    review_status: enrichment.reviewStatus,
    created_at: enrichment.createdAt,
    updated_at: enrichment.updatedAt,
  };
}

export function recurringPaymentCandidateFromRow(
  row: RecurringPaymentCandidateRow,
): RecurringPaymentCandidate {
  return {
    id: row.id,
    userId: row.user_id,
    merchant: row.merchant,
    amountEstimate: row.amount_estimate,
    frequency: row.frequency,
    nextExpectedDate: row.next_expected_date,
    confidence: row.confidence,
    linkedAccountId: row.linked_account_id,
    latestTransactionDate: row.latest_transaction_date,
    transactionIds: row.transaction_ids,
    candidateType: row.candidate_type,
    status: row.status,
    reviewed: row.reviewed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function recurringPaymentCandidateToRow(
  candidate: RecurringPaymentCandidate,
  userId: string,
): RecurringPaymentCandidateRow {
  return {
    id: candidate.id,
    user_id: userId,
    merchant: candidate.merchant,
    amount_estimate: candidate.amountEstimate,
    frequency: candidate.frequency,
    next_expected_date: candidate.nextExpectedDate,
    confidence: candidate.confidence,
    linked_account_id: candidate.linkedAccountId,
    latest_transaction_date: candidate.latestTransactionDate,
    transaction_ids: candidate.transactionIds,
    candidate_type: candidate.candidateType,
    status: candidate.status,
    reviewed: candidate.reviewed,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
  };
}

export function detectedBillFromRow(row: DetectedBillRow): DetectedBill {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    merchant: row.merchant,
    amountEstimate: row.amount_estimate,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    paymentAccountId: row.payment_account_id,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    status: row.status,
    reviewed: row.reviewed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function detectedBillToRow(bill: DetectedBill, userId: string): DetectedBillRow {
  return {
    id: bill.id,
    user_id: userId,
    name: bill.name,
    merchant: bill.merchant,
    amount_estimate: bill.amountEstimate,
    frequency: bill.frequency,
    next_due_date: bill.nextDueDate,
    payment_account_id: bill.paymentAccountId,
    category: bill.category,
    confidence: bill.confidence,
    source: bill.source,
    status: bill.status,
    reviewed: bill.reviewed,
    created_at: bill.createdAt,
    updated_at: bill.updatedAt,
  };
}

export function detectedSubscriptionFromRow(
  row: DetectedSubscriptionRow,
): DetectedSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    merchant: row.merchant,
    amountEstimate: row.amount_estimate,
    frequency: row.frequency,
    nextExpectedDate: row.next_expected_date,
    paymentAccountId: row.payment_account_id,
    category: row.category,
    confidence: row.confidence,
    status: row.status,
    reviewed: row.reviewed,
    priceChangeDetected: row.price_change_detected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function detectedSubscriptionToRow(
  subscription: DetectedSubscription,
  userId: string,
): DetectedSubscriptionRow {
  return {
    id: subscription.id,
    user_id: userId,
    name: subscription.name,
    merchant: subscription.merchant,
    amount_estimate: subscription.amountEstimate,
    frequency: subscription.frequency,
    next_expected_date: subscription.nextExpectedDate,
    payment_account_id: subscription.paymentAccountId,
    category: subscription.category,
    confidence: subscription.confidence,
    status: subscription.status,
    reviewed: subscription.reviewed,
    price_change_detected: subscription.priceChangeDetected,
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
  };
}

export function spendingAnomalyFromRow(row: SpendingAnomalyRow): SpendingAnomaly {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    transactionIds: row.transaction_ids,
    merchant: row.merchant,
    category: row.category,
    amount: row.amount,
    expectedAmount: row.expected_amount,
    detectedAt: row.detected_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function cashflowEventFromRow(row: CashflowEventRow): CashflowEvent {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    direction: row.direction,
    source: row.source,
    accountId: row.account_id,
    includeInCashflow: row.include_in_cashflow,
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
    endpoint: row.endpoint ?? undefined,
    p256dh: row.p256dh ?? undefined,
    auth: row.auth ?? undefined,
    browser: row.browser,
    permission: row.permission,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function notificationDeliveryAttemptFromRow(
  row: NotificationDeliveryAttemptRow,
): NotificationDeliveryAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    notificationId: row.notification_id,
    channel: row.channel,
    status: row.status,
    attemptedAt: row.attempted_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    providerResponseCode: row.provider_response_code,
    createdAt: row.created_at,
  };
}

export function notificationDeliveryAttemptToRow(
  attempt: NotificationDeliveryAttempt,
  userId: string,
): NotificationDeliveryAttemptRow {
  return {
    id: attempt.id,
    user_id: userId,
    notification_id: attempt.notificationId,
    channel: attempt.channel,
    status: attempt.status,
    attempted_at: attempt.attemptedAt,
    delivered_at: attempt.deliveredAt,
    failed_at: attempt.failedAt,
    failure_reason: attempt.failureReason,
    provider_response_code: attempt.providerResponseCode,
    created_at: attempt.createdAt,
  };
}
