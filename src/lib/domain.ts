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

export type Account = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  balance: number;
  includeInCash: boolean;
  includeInNetWorth: boolean;
  provider: "mock" | "manual";
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
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
