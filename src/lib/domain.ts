export type CurrencyCode = "GBP";

export type EntityStatus =
  | "active"
  | "inactive"
  | "archived"
  | "pending_review"
  | "confirmed";

export type RecurrenceFrequency =
  | "none"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "one_off";

export type Recurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
};

export type UserProfile = {
  id: string;
  displayName: string;
  locale: "en-GB";
  currency: CurrencyCode;
  paydayDayOfMonth: number;
  minimumBuffer: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountType =
  | "current_account"
  | "savings"
  | "credit_card"
  | "cash"
  | "offline"
  | "isa"
  | "investment"
  | "pension"
  | "loan";

export type AccountSubtype =
  | "current"
  | "savings"
  | "pocket"
  | "vault"
  | "credit_card"
  | "charge_card"
  | "loan"
  | "cash"
  | "pension"
  | "investment"
  | "isa"
  | "offline"
  | "other";

export type AccountPurpose =
  | "main_current_account"
  | "everyday_spending"
  | "bills_account"
  | "overdraft_account"
  | "credit_card"
  | "pocket"
  | "savings"
  | "emergency_fund"
  | "short_term_savings"
  | "holiday_fund"
  | "pet_fund"
  | "house_deposit"
  | "loan_account"
  | "pension"
  | "investment"
  | "cash"
  | "offline_account"
  | "ignore"
  | "other";

export type AccountRole =
  | "spending"
  | "bills"
  | "savings"
  | "credit"
  | "loan"
  | "investment"
  | "pension"
  | "cash"
  | "offline"
  | "other";

export type BankProvider = "moneyhub" | "truelayer" | "tink" | "plaid" | "mock";

export type ConnectionLifecycleStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "needs_reconsent"
  | "syncing"
  | "sync_failed"
  | "disconnected"
  | "archived";

export type ConsentStatus =
  | "not_started"
  | "pending"
  | "active"
  | "expired"
  | "revoked"
  | "failed";

export type AccountBalanceSource = "current" | "statement" | "unavailable";

export type CreditCardPlanningBalanceSource =
  | "provider_current"
  | "provider_statement_estimate"
  | "manual_anchor_estimate"
  | "unavailable";

export type CreditCardBalanceConfidence = "confirmed" | "estimated" | "unavailable";

export type Account = {
  id: string;
  userId: string;
  providerConnectionId: string | null;
  providerAccountId: string | null;
  institutionName: string;
  institutionId: string;
  name: string;
  officialName: string;
  type: AccountType;
  subtype: AccountSubtype;
  currency: CurrencyCode;
  balance: number;
  /** True only when the provider returned a real balance value. False prevents fake GBP0 card debt. */
  balanceAvailable?: boolean;
  balanceUnavailableReason?: string | null;
  balanceSource?: AccountBalanceSource | null;
  currentBalance?: number | null;
  statementBalance?: number | null;
  paymentDueDate?: string | null;
  statementStartDate?: string | null;
  statementEndDate?: string | null;
  manualAnchorBalance?: number | null;
  manualAnchorDate?: string | null;
  manualAnchorNote?: string | null;
  balanceDiagnostics?: {
    endpointCalled?: boolean;
    status?: number | null;
    balanceValuePresent?: boolean;
    statementBalancePresent?: boolean;
    availableCreditPresent?: boolean;
    currentBalancePresent?: boolean;
    paymentDueDatePresent?: boolean;
    statementStartDatePresent?: boolean;
    statementEndDatePresent?: boolean;
    balanceSource?: AccountBalanceSource;
    explicitZeroReturned?: boolean;
    mappedAsLiability?: boolean;
    providerReason?: string | null;
  } | null;
  availableBalance: number | null;
  creditLimit: number | null;
  mask: string | null;
  purpose: AccountPurpose;
  accountRole: AccountRole;
  includeInCashflow: boolean;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  isSpendingAccount: boolean;
  isBillsAccount: boolean;
  isSavingsAccount: boolean;
  /** Optional reserved purpose for pockets/pots, e.g. "amex". */
  reservedFor?: string | null;
  /** Optional linked liability account, e.g. an Amex pocket linked to Amex card. */
  linkedLiabilityAccountId?: string | null;
  /** Arranged overdraft limit, stored for interpretation only and never counted as cash. */
  overdraftLimit?: number | null;
  /** Target repayment/reduction for overdraft planning. */
  overdraftRepaymentTarget?: number | null;
  linkedGoalIds: string[];
  syncStatus: ConnectionLifecycleStatus;
  lastSyncedAt: string | null;
  consentExpiresAt: string | null;
  notes: string | null;
  provider: BankProvider | "manual";
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type BankConnection = {
  id: string;
  userId?: string;
  provider: BankProvider;
  providerUserId?: string | null;
  institutionName: string;
  institutionId: string;
  status: ConnectionLifecycleStatus;
  consentStatus: ConsentStatus;
  consentStartedAt: string | null;
  consentCompletedAt?: string | null;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastManualSyncAt?: string | null;
  lastAutomaticSyncAt?: string | null;
  lastSyncTrigger?: "manual" | "sync_all" | "scheduled" | "webhook" | null;
  lastTransactionSyncedAt?: string | null;
  lastTransactionSyncStartedAt?: string | null;
  lastTransactionSyncStatus?: "success" | "failed" | "no_transactions" | null;
  lastTransactionSyncMessage?: string | null;
  lastTransactionDateFrom?: string | null;
  lastTransactionDateTo?: string | null;
  lastTransactionReturnedCount?: number | null;
  lastTransactionStoredCount?: number | null;
  lastTransactionSkippedCount?: number | null;
  lastTransactionFailedEndpoint?: string | null;
  lastTransactionFailureReason?: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  // Safe, non-secret provider/institution identification metadata. Populated at
  // callback/sync time so multiple live connections are distinguishable. Never
  // holds tokens, secrets, or raw payloads.
  mode?: "sandbox" | "live";
  providerName?: string | null;
  providerId?: string | null;
  displayName?: string | null;
  lastFailedSyncAt?: string | null;
  lastFailedEndpoint?: string | null;
  lastFailedStatus?: number | null;
  lastFailureReason?: string | null;
  accountsSyncedCount?: number | null;
  cardsSyncedCount?: number | null;
};

export type ProviderTokenStorageRecord = {
  id: string;
  userId?: string;
  connectionId: string;
  provider: BankProvider;
  mode?: "sandbox" | "live";
  status?: "active" | "revoked";
  encryptedTokenPayload: string | null;
  tokenReference: string;
  providerUserId: string | null;
  providerConnectionId: string | null;
  expiresAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankBalance = {
  id: string;
  userId: string;
  accountId: string;
  connectionId: string;
  providerAccountId: string;
  currency: CurrencyCode;
  currentBalance: number;
  availableBalance: number | null;
  overdraftLimit: number | null;
  lastSyncedAt: string;
};

export type BankSyncRun = ProviderSyncEvent & {
  userId?: string;
  connectionId?: string;
  accountsFetched?: number;
  transactionsFetched?: number;
  errorCode?: string | null;
};

export type ProviderAccount = {
  providerConnectionId: string;
  providerAccountId: string;
  institutionName: string;
  institutionId: string;
  name: string;
  officialName: string;
  type: AccountType;
  subtype: AccountSubtype;
  balance: number;
  balanceAvailable?: boolean;
  balanceUnavailableReason?: string | null;
  balanceSource?: AccountBalanceSource | null;
  currentBalance?: number | null;
  statementBalance?: number | null;
  paymentDueDate?: string | null;
  statementStartDate?: string | null;
  statementEndDate?: string | null;
  balanceDiagnostics?: Account["balanceDiagnostics"];
  availableBalance: number | null;
  creditLimit: number | null;
  currency: CurrencyCode;
  mask: string | null;
};

export type ProviderTransaction = {
  id: string;
  providerConnectionId: string;
  providerAccountId: string;
  providerTransactionId: string;
  date: string;
  providerUpdatedAt: string | null;
  providerStatus?: "pending" | "posted" | "deleted" | "restored" | "unknown";
  merchant: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  pending: boolean;
  category: string | null;
  isOwnAccountTransfer: boolean;
};

export type TransactionBudgetExclusionReason =
  | "internal_transfer"
  | "credit_card_payment"
  | "amex_pocket_transfer"
  | "bill"
  | "rent"
  | "savings_transfer"
  | "debt_payment"
  | "refund"
  | "exceptional"
  | "ignored"
  | "other";

export type TransactionBudgetOverride = {
  id: string;
  userId: string;
  transactionId: string;
  accountId: string;
  includeInWeeklyBudget: boolean;
  includeInMonthlyBudget: boolean;
  includeInSpendingSummaries: boolean;
  includeInSafeToSpendImpact: boolean;
  includeInCreditCardBalanceEstimate?: boolean;
  budgetCategory?: string | null;
  exclusionReason?: TransactionBudgetExclusionReason | null;
  userNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreditCardBalanceSummary = {
  accountId: string;
  providerCurrentBalance: number | null;
  providerStatementBalance: number | null;
  statementStartDate: string | null;
  statementEndDate: string | null;
  paymentDueDate: string | null;
  manualAnchorBalance: number | null;
  manualAnchorDate: string | null;
  estimatedCurrentBalance: number | null;
  balanceUsedForPlanning: number | null;
  balanceSource: CreditCardPlanningBalanceSource;
  confidence: CreditCardBalanceConfidence;
  postStatementPurchases: number;
  postStatementPayments: number;
  postStatementRefunds: number;
  postStatementFees: number;
  transactionsIncludedCount: number;
  transactionsExcludedCount: number;
  calculatedAt: string;
};

export type ProviderSyncEvent = {
  id: string;
  providerConnectionId: string;
  provider: BankProvider;
  status: ConnectionLifecycleStatus;
  message: string;
  startedAt: string;
  finishedAt: string | null;
};

export type ProviderWebhookEventType =
  | "newTransactions"
  | "updatedTransactions"
  | "deletedTransactions"
  | "restoredTransactions"
  | "syncCompleted"
  | "syncFailed";

export type ProviderWebhookProcessingStatus =
  | "received"
  | "queued"
  | "processed"
  | "failed"
  | "duplicate";

export type ProviderWebhookEvent = {
  id: string;
  userId: string;
  provider: BankProvider;
  providerEventId: string;
  providerEventType: ProviderWebhookEventType;
  receivedAt: string;
  processedAt: string | null;
  processingStatus: ProviderWebhookProcessingStatus;
  connectionId: string;
  accountIds: string[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncJobScope = "connection" | "account";

export type SyncJobStatus = "pending" | "processing" | "completed" | "failed";

export type SyncJob = {
  id: string;
  userId: string;
  provider: BankProvider;
  scope: SyncJobScope;
  connectionId: string;
  accountIds: string[];
  status: SyncJobStatus;
  reason: string;
  idempotencyKey: string;
  attempts: number;
  errorMessage: string | null;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CategoryKind = "income" | "expense" | "transfer";

export type FinanceCategory =
  | "income"
  | "rent_or_mortgage"
  | "council_tax"
  | "utilities"
  | "groceries"
  | "eating_out"
  | "transport"
  | "subscriptions"
  | "entertainment"
  | "shopping"
  | "pets"
  | "health"
  | "insurance"
  | "savings"
  | "debt_repayment"
  | "transfers"
  | "cash_withdrawal"
  | "fees"
  | "other";

export type TransactionReviewStatus =
  | "needs_review"
  | "reviewed"
  | "approved"
  | "dismissed";

export type EnrichmentSource = "rule" | "deterministic" | "provider" | "user";

export type Category = {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
  budgetType:
    | "essential"
    | "flexible"
    | "income"
    | "savings"
    | "debt"
    | "transfer";
  includeInBudget: boolean;
  status: EntityStatus;
};

export type Transaction = {
  id: string;
  accountId: string;
  categoryId: string;
  providerConnectionId?: string | null;
  providerTransactionId?: string | null;
  providerUpdatedAt?: string | null;
  providerStatus?: "pending" | "posted" | "deleted" | "restored" | "unknown" | null;
  providerDeletedAt?: string | null;
  providerRestoredAt?: string | null;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  kind: CategoryKind;
  status: "reviewed" | "needs_review" | "suggested" | "excluded";
  flags: string[];
  pending?: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MerchantRule = {
  id: string;
  userId: string;
  matchPattern: string;
  normalisedMerchantName: string;
  merchantGroup: string | null;
  category: FinanceCategory;
  subcategory: string | null;
  priority: number;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type TransactionEnrichment = {
  id: string;
  userId: string;
  transactionId: string;
  normalisedMerchantName: string;
  merchantGroup: string | null;
  category: FinanceCategory;
  subcategory: string | null;
  confidenceScore: number;
  enrichmentSource: EnrichmentSource;
  userReviewed: boolean;
  excludedFromSpending: boolean;
  internalTransfer: boolean;
  billCandidate: boolean;
  subscriptionCandidate: boolean;
  recurringCandidate: boolean;
  reviewStatus: TransactionReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type RecurringPaymentCandidateType =
  | "bill"
  | "subscription"
  | "income"
  | "transfer"
  | "unknown";

export type RecurringPaymentCandidate = {
  id: string;
  userId: string;
  merchant: string;
  amountEstimate: number;
  frequency: RecurrenceFrequency;
  nextExpectedDate: string;
  confidence: number;
  linkedAccountId: string;
  latestTransactionDate: string;
  transactionIds: string[];
  candidateType: RecurringPaymentCandidateType;
  status: TransactionReviewStatus;
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DetectedBill = {
  id: string;
  userId: string;
  name: string;
  merchant: string;
  amountEstimate: number;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  paymentAccountId: string | null;
  category: FinanceCategory;
  confidence: number;
  source: "recurring_detection" | "manual_review" | "rule";
  status: TransactionReviewStatus | "confirmed" | "inactive";
  reviewed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DetectedSubscription = {
  id: string;
  userId: string;
  name: string;
  merchant: string;
  amountEstimate: number;
  frequency: RecurrenceFrequency;
  nextExpectedDate: string;
  paymentAccountId: string | null;
  category: FinanceCategory;
  confidence: number;
  status: TransactionReviewStatus | "confirmed" | "inactive";
  reviewed: boolean;
  priceChangeDetected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SpendingAnomalyType =
  | "merchant_spend_high"
  | "category_spend_high"
  | "duplicate_transaction"
  | "subscription_price_increase"
  | "missing_expected_bill"
  | "large_transaction"
  | "budget_pace_high";

export type SpendingAnomaly = {
  id: string;
  userId: string;
  type: SpendingAnomalyType;
  title: string;
  description: string;
  severity: "info" | "warning" | "urgent";
  transactionIds: string[];
  merchant: string | null;
  category: FinanceCategory | null;
  amount: number | null;
  expectedAmount: number | null;
  detectedAt: string;
  status: TransactionReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type CashflowEvent = {
  id: string;
  userId: string;
  date: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  direction: "inflow" | "outflow";
  source: "bill" | "subscription" | "manual" | "income";
  accountId: string | null;
  includeInCashflow: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AIMoneyCoachMode =
  | "monthly_review"
  | "weekly_review"
  | "payday_plan"
  | "can_i_afford_this"
  | "budget_explainer"
  | "bill_review"
  | "subscription_review"
  | "cashflow_review"
  | "debt_summary"
  | "net_worth_summary"
  | "anomaly_explainer"
  | "free_question";

export type AIMoneyCoachConfidence = "low" | "medium" | "high";

export type AIKeyNumber = {
  label: string;
  value: string;
  source: string;
};

export type AIDataUsedSummary = {
  accounts: number;
  transactions: number;
  budgets: number;
  bills: number;
  subscriptions: number;
  savingsGoals: number;
  debts: number;
  manualItems: number;
  anomalies: number;
  dateRange: string;
};

export type AIMoneyCoachResponse = {
  answerSummary: string;
  keyNumbers: AIKeyNumber[];
  explanation: string[];
  assumptions: string[];
  risksOrWatchouts: string[];
  suggestedNextActions: string[];
  confidence: AIMoneyCoachConfidence;
  dataUsed: AIDataUsedSummary;
};

export type BudgetPeriod = {
  id: string;
  userId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "planned";
};

export type Budget = {
  id: string;
  userId: string;
  categoryId: string;
  periodId: string;
  amount: number;
  currency: CurrencyCode;
  createdAt: string;
  updatedAt: string;
};

export type Bill = {
  id: string;
  userId: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  dueDate: string;
  recurrence: Recurrence;
  categoryId: string;
  accountId: string | null;
  essential: boolean;
  includeInCashflow: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  userId: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  dueDate: string;
  recurrence: Recurrence;
  categoryId: string;
  accountId: string | null;
  includeInCashflow: boolean;
  status: EntityStatus;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavingsGoal = {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: CurrencyCode;
  targetDate: string;
  priority: "high" | "medium" | "low";
  monthlyContribution: number;
  includeInNetWorth: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type Debt = {
  id: string;
  userId: string;
  name: string;
  balance: number;
  currency: CurrencyCode;
  apr: number;
  minimumPayment: number;
  dueDate: string;
  lender: string;
  accountId: string | null;
  includeInNetWorth: boolean;
  /**
   * Optional manual priority used by the "custom" debt strategy. Lower numbers
   * are attacked first. Optional so existing Supabase/mock data stays valid.
   */
  priority?: number | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type NetWorthSnapshot = {
  id: string;
  userId: string;
  date: string;
  assetsTotal: number;
  liabilitiesTotal: number;
  netWorth: number;
  currency: CurrencyCode;
  createdAt: string;
};

export type AIInsight = {
  id: string;
  userId: string;
  type: AIMoneyCoachMode | "affordability" | "budget_note";
  mode?: AIMoneyCoachMode;
  title: string;
  summary: string;
  evidence: string[];
  assumptions: string[];
  nextAction: string;
  prompt?: string;
  redactedContextSummary?: string;
  responseSummary?: string;
  dataUsed?: AIDataUsedSummary;
  model?: string;
  errorStatus?: string | null;
  status: EntityStatus;
  createdAt: string;
};

export type Alert = {
  id: string;
  userId: string;
  type:
    | "low_balance"
    | "bill_increase"
    | "duplicate_payment"
    | "budget_pace_high"
    | "subscription_review"
    | "goal_at_risk"
    | "uncategorised_transactions";
  severity: "info" | "warning" | "risk";
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  status: "new" | "acknowledged" | "dismissed";
  createdAt: string;
};

export type NotificationType =
  | "low_balance"
  | "bill_due"
  | "budget_threshold"
  | "subscription_change"
  | "consent_renewal"
  | "account_sync_failure"
  | "connection_successful"
  | "sync_successful"
  | "connection_revoked"
  | "new_transaction"
  | "transaction_updated"
  | "large_transaction"
  | "potential_duplicate_payment"
  | "new_bill_detected"
  | "new_subscription_detected"
  | "subscription_price_changed"
  | "missing_expected_bill"
  | "unusual_spending"
  | "projected_bills_account_shortfall"
  | "transaction_needs_review"
  | "ai_monthly_review_ready"
  | "ai_payday_plan_ready"
  | "ai_review_failed"
  | "openai_not_configured"
  | "payday_planning"
  | "manual_item_review"
  | "safe_to_spend_change"
  | "weekly_spending_summary"
  | "monthly_spending_summary"
  | "category_overspend"
  | "safe_to_spend_drop"
  | "bills_account_shortfall"
  | "overdraft_risk"
  | "overdraft_repayment_reminder"
  | "amex_pocket_underfunded";

export type NotificationChannel = "in_app" | "web_push" | "email_placeholder";

export type NotificationSeverity = "info" | "warning" | "urgent";

export type NotificationStatus = "unread" | "read" | "dismissed";
export type NotificationDeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

export type NotificationPreference = {
  id: string;
  userId: string;
  type: NotificationType;
  enabled: boolean;
  channels: NotificationChannel[];
  lowBalanceThreshold: number;
  budgetWarningPercentage: number;
  billReminderDays: number;
  weeklySummaryDay?: number | null;
  excludedCategories?: string[];
  excludedAccounts?: string[];
  largeTransactionThreshold?: number | null;
  unusualSpendingSensitivity?: "low" | "medium" | "high";
  notifyWhenAmexPocketUnderfunded?: boolean;
  notifyWhenBillsAccountShortfallExists?: boolean;
  notifyWhenOverdraftPositionWorsens?: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRule = {
  id: string;
  userId: string;
  type: NotificationType;
  enabled: boolean;
  thresholdAmount: number | null;
  thresholdPercentage: number | null;
  daysBefore: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  channel: NotificationChannel;
  title: string;
  body: string;
  privacySafeTitle: string;
  privacySafeBody: string;
  actionHref: string | null;
  entityType: string | null;
  entityId: string | null;
  status: NotificationStatus;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpointHash: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  browser: string;
  permission: NotificationPermission | "unsupported";
  status: "placeholder" | "active" | "revoked";
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDeliveryAttempt = {
  id: string;
  userId: string;
  notificationId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attemptedAt: string;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  providerResponseCode: number | null;
  createdAt: string;
};

export type ManualFinanceItemType =
  | "debt"
  | "money_owed_to_user"
  | "money_user_owes"
  | "offline_account"
  | "cash"
  | "pension_estimate"
  | "isa_investment_balance"
  | "future_expense"
  | "manual_bill"
  | "manual_income";

export type ManualFinanceDirection =
  | "asset"
  | "liability"
  | "receivable"
  | "payable"
  | "income"
  | "expense";

export type ManualFinanceItem = {
  id: string;
  name: string;
  type: ManualFinanceItemType;
  direction: ManualFinanceDirection;
  amount: number;
  currency: CurrencyCode;
  dueDate: string | null;
  recurrence: Recurrence | null;
  apr: number | null;
  minimumPayment: number | null;
  counterparty: string | null;
  includeInCashflow: boolean;
  includeInNetWorth: boolean;
  notes: string | null;
  status: EntityStatus;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// v2 finance engine models (payday planning, overdraft escape, debt freedom,
// bills-account funding, savings phases, next best action).
// These are deterministic, GBP-only, and contain no real financial data.
// ---------------------------------------------------------------------------

/**
 * Stored payday plan: the income and the seven ordered allocation targets the
 * deterministic waterfall fills on payday. Targets are gross monthly amounts.
 */
export type PaydayPlan = {
  id: string;
  userId: string;
  monthlyIncome: number;
  paydayDate: string;
  preferredBuffer: number;
  billsAccountTarget: number;
  minimumDebtPaymentsTarget: number;
  overdraftReductionTarget: number;
  essentialSpendingTarget: number;
  emergencyBufferTarget: number;
  savingsTarget: number;
  flexibleSpendingTarget: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Computed result of running the payday waterfall against income and targets.
 * Not persisted on its own; derived from a {@link PaydayPlan} or ad-hoc input.
 */
export type PaydayAllocation = {
  income: number;
  billsAccountAllocation: number;
  minimumDebtPaymentsAllocation: number;
  overdraftReductionAllocation: number;
  essentialSpendingAllocation: number;
  emergencyBufferAllocation: number;
  savingsAllocation: number;
  flexibleSpendingAllocation: number;
  leftover: number;
  shortfall: number;
  warnings: string[];
};

export type OverdraftRiskLevel = "none" | "low" | "medium" | "high";

export type OverdraftPlanStatus =
  | "active"
  | "overdraft_free"
  | "paused"
  | "archived";

/**
 * Stored overdraft escape plan for a single account.
 * `currentOverdraftUsed` is a positive number representing how much of the
 * overdraft facility is currently drawn (0 = not in overdraft).
 */
export type OverdraftPlan = {
  id: string;
  userId: string;
  linkedAccountId: string;
  overdraftLimit: number;
  currentOverdraftUsed: number;
  targetReductionPerPayday: number;
  feesOrInterest: number | null;
  targetOverdraftFreeDate: string | null;
  projectedOverdraftFreeDate: string | null;
  riskBeforePayday: OverdraftRiskLevel;
  recommendedPaydayAction: string;
  status: OverdraftPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type DebtStrategy = "snowball" | "avalanche" | "custom";

export type OrderedDebt = {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  apr: number | null;
  priority: number | null;
  payoffOrder: number;
  source: "debt" | "manual" | "account";
};

export type DebtFreedomSummary = {
  totalDebt: number;
  totalMinimumPayments: number;
  extraPaymentAvailable: number;
  selectedStrategy: DebtStrategy;
  nextDebtToAttack: OrderedDebt | null;
  projectedDebtFreeDate: string | null;
  orderedDebts: OrderedDebt[];
  warnings: string[];
};

export type BillsAccountSummary = {
  billsAccountId: string | null;
  billsAccountBalance: number;
  billsDueBeforePayday: number;
  expectedShortfall: number;
  expectedSurplus: number;
  paydayTransferRequired: number;
  isFullyFunded: boolean;
  warnings: string[];
};

export type SavingsPhase =
  | "starter_emergency_buffer"
  | "overdraft_free"
  | "emergency_fund"
  | "debt_free"
  | "one_month_essential_expenses";

export type SavingsPhaseSummary = {
  currentPhase: SavingsPhase;
  nextPhase: SavingsPhase | null;
  currentSavings: number;
  targetAmount: number;
  progressPercentage: number;
  recommendedAction: string;
};

export type NextBestActionType =
  | "fund_bills_account"
  | "address_overdraft_risk"
  | "pay_debt_due"
  | "raise_safe_to_spend"
  | "reduce_overdraft"
  | "overpay_debt"
  | "contribute_emergency_buffer"
  | "contribute_savings_goal"
  | "all_clear";

export type NextBestAction = {
  type: NextBestActionType;
  title: string;
  description: string;
  amount: number | null;
  priority: number;
  reason: string;
  relatedEntityId: string | null;
};
