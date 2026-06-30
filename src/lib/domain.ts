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
  | "bills_account"
  | "everyday_spending"
  | "emergency_fund"
  | "short_term_savings"
  | "holiday_fund"
  | "pet_fund"
  | "house_deposit"
  | "credit_card"
  | "loan_account"
  | "pension"
  | "investment"
  | "cash"
  | "offline_account"
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
  | "disconnected";

export type ConsentStatus =
  | "not_started"
  | "pending"
  | "active"
  | "expired"
  | "revoked"
  | "failed";

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
  provider: BankProvider;
  institutionName: string;
  institutionId: string;
  status: ConnectionLifecycleStatus;
  consentStatus: ConsentStatus;
  consentStartedAt: string | null;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
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
  merchant: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  pending: boolean;
  category: string | null;
  isOwnAccountTransfer: boolean;
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

export type CategoryKind = "income" | "expense" | "transfer";

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
  date: string;
  merchant: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  kind: CategoryKind;
  status: "reviewed" | "needs_review" | "suggested" | "excluded";
  flags: string[];
  createdAt: string;
  updatedAt: string;
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
  type: "monthly_review" | "weekly_review" | "affordability" | "budget_note";
  title: string;
  summary: string;
  evidence: string[];
  assumptions: string[];
  nextAction: string;
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
  | "payday_planning"
  | "manual_item_review"
  | "safe_to_spend_change";

export type NotificationChannel = "in_app" | "web_push" | "email_placeholder";

export type NotificationSeverity = "info" | "warning" | "urgent";

export type NotificationStatus = "unread" | "read" | "dismissed";

export type NotificationPreference = {
  id: string;
  userId: string;
  type: NotificationType;
  enabled: boolean;
  channels: NotificationChannel[];
  lowBalanceThreshold: number;
  budgetWarningPercentage: number;
  billReminderDays: number;
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
  browser: string;
  permission: NotificationPermission | "unsupported";
  status: "placeholder" | "active" | "revoked";
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
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
