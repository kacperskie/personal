import type {
  Account,
  BankConnection,
  Bill,
  Budget,
  BudgetPeriod,
  Category,
  ConnectionLifecycleStatus,
  Debt,
  ManualFinanceItem,
  SavingsGoal,
  Subscription,
  Transaction,
  TransactionBudgetOverride,
} from "@/lib/domain";
import { filterTransactionsForBudget } from "@/lib/finance-interpretation";

export type BudgetPaceStatus = "under pace" | "on pace" | "high" | "risk";
export type Tone = "good" | "neutral" | "warning" | "risk";

export type SafeToSpendInput = {
  currentCash: number;
  billsDueBeforePayday: number;
  plannedSavingsBeforePayday: number;
  debtPaymentsBeforePayday: number;
  minimumBuffer: number;
  reservedGoalContributions: number;
  confirmedAdjustments?: number;
};

export type SpendByCategory = {
  categoryId: string;
  category: string;
  spent: number;
};

export type BudgetHealthItem = {
  categoryId: string;
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  usagePercentage: number;
  forecast: number;
  paceRatio: number;
  status: BudgetPaceStatus;
  tone: Tone;
};

export type UpcomingCommitment = {
  id: string;
  name: string;
  dueDate: string;
  amount: number;
  currency: string;
  type: string;
  source: "bill" | "subscription" | "manual";
};

export type SavingsGoalProgress = {
  goalId: string;
  progressRatio: number;
  progressPercentage: number;
  remainingAmount: number;
};

export type DebtSummaryItem = {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  apr: number | null;
  source: "debt" | "manual";
};

export type DebtSummary = {
  totalDebt: number;
  totalMinimumPayment: number;
  averageApr: number;
  items: DebtSummaryItem[];
};

export type LinkedSavingsGoalBalance = {
  goalId: string;
  balance: number;
};

const toneByStatus: Record<BudgetPaceStatus, Tone> = {
  "under pace": "good",
  "on pace": "neutral",
  high: "warning",
  risk: "risk",
};

function isActiveStatus(status: string) {
  return status === "active" || status === "confirmed" || status === "pending_review";
}

function isUsableAccount(account: Account) {
  return isActiveStatus(account.status) && account.syncStatus !== "disconnected";
}

function isDateInRange(date: string | null, startDate: string, endDate: string) {
  return Boolean(date && date >= startDate && date <= endDate);
}

function absoluteAmount(value: number) {
  return Math.abs(value);
}

function isOwnAccountTransfer(transaction: Transaction) {
  return transaction.kind === "transfer" || transaction.flags.includes("own_account_transfer");
}

export function calculateAccountCashBalance(account: Account) {
  if (account.type === "credit_card" || account.type === "loan" || account.purpose === "ignore") {
    return 0;
  }

  if (account.balance <= 0) {
    return 0;
  }

  const providerAvailable = account.availableBalance ?? account.balance;

  return Math.max(Math.min(providerAvailable, account.balance), 0);
}

function accountIsLiquid(account: Account) {
  return (
    account.type === "current_account" ||
    account.type === "savings" ||
    account.type === "cash" ||
    account.type === "offline"
  );
}

function manualItemAffectsCurrentCash(item: ManualFinanceItem) {
  return (
    item.includeInCashflow &&
    isActiveStatus(item.status) &&
    (item.type === "cash" || item.type === "offline_account") &&
    item.direction === "asset"
  );
}

function manualItemIsAsset(item: ManualFinanceItem) {
  return (
    item.includeInNetWorth &&
    isActiveStatus(item.status) &&
    (item.direction === "asset" || item.direction === "receivable")
  );
}

function manualItemIsLiability(item: ManualFinanceItem) {
  return (
    item.includeInNetWorth &&
    isActiveStatus(item.status) &&
    (item.direction === "liability" || item.direction === "payable")
  );
}

function manualItemIsCashflowOutflow(item: ManualFinanceItem) {
  return (
    item.includeInCashflow &&
    isActiveStatus(item.status) &&
    (item.direction === "expense" ||
      item.direction === "payable" ||
      item.direction === "liability")
  );
}

export function calculateTotalCurrentCash(
  accounts: Account[],
  manualFinanceItems: ManualFinanceItem[] = [],
) {
  const accountCash = accounts
    .filter(
      (account) =>
        account.includeInCashflow && isUsableAccount(account) && accountIsLiquid(account),
    )
    .reduce((total, account) => total + calculateAccountCashBalance(account), 0);

  const manualCash = manualFinanceItems
    .filter(manualItemAffectsCurrentCash)
    .reduce((total, item) => total + item.amount, 0);

  return accountCash + manualCash;
}

export function calculateSafeToSpendEligibleCash(accounts: Account[]) {
  return accounts
    .filter((account) => account.includeInSafeToSpend && isUsableAccount(account))
    .reduce((total, account) => total + calculateAccountCashBalance(account), 0);
}

export function calculateBillsAccountBalance(accounts: Account[]) {
  return accounts
    .filter((account) => account.isBillsAccount && isUsableAccount(account))
    .reduce((total, account) => total + calculateAccountCashBalance(account), 0);
}

export function calculateCashflowAccountBalance(accounts: Account[]) {
  return accounts
    .filter((account) => account.includeInCashflow && isUsableAccount(account))
    .reduce((total, account) => total + calculateAccountCashBalance(account), 0);
}

export function getUpcomingManualCashflowItems(
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  endDate: string,
) {
  return manualFinanceItems
    .filter(
      (item) =>
        item.includeInCashflow &&
        isActiveStatus(item.status) &&
        isDateInRange(item.dueDate, startDate, endDate),
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

export function getUpcomingBillItems(
  bills: Bill[],
  subscriptions: Subscription[],
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  endDate: string,
): UpcomingCommitment[] {
  const billItems: UpcomingCommitment[] = bills
    .filter(
      (bill) =>
        bill.includeInCashflow &&
        isActiveStatus(bill.status) &&
        isDateInRange(bill.dueDate, startDate, endDate),
    )
    .map((bill) => ({
      id: bill.id,
      name: bill.name,
      dueDate: bill.dueDate,
      amount: bill.amount,
      currency: bill.currency,
      type: bill.essential ? "Essential bill" : "Bill",
      source: "bill",
    }));

  const subscriptionItems: UpcomingCommitment[] = subscriptions
    .filter(
      (subscription) =>
        subscription.includeInCashflow &&
        isActiveStatus(subscription.status) &&
        isDateInRange(subscription.dueDate, startDate, endDate),
    )
    .map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      dueDate: subscription.dueDate,
      amount: subscription.amount,
      currency: subscription.currency,
      type: "Subscription",
      source: "subscription",
    }));

  const manualItems: UpcomingCommitment[] = manualFinanceItems
    .filter(
      (item) =>
        item.includeInCashflow &&
        isActiveStatus(item.status) &&
        (item.type === "manual_bill" || item.type === "future_expense") &&
        isDateInRange(item.dueDate, startDate, endDate),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      dueDate: String(item.dueDate),
      amount: item.amount,
      currency: item.currency,
      type: item.type === "future_expense" ? "Future expense" : "Manual bill",
      source: "manual",
    }));

  return [...billItems, ...subscriptionItems, ...manualItems].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
}

export function calculateBillsDueBeforePayday(
  bills: Bill[],
  subscriptions: Subscription[],
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  paydayDate: string,
) {
  return getUpcomingBillItems(
    bills,
    subscriptions,
    manualFinanceItems,
    startDate,
    paydayDate,
  ).reduce((total, item) => total + item.amount, 0);
}

export function calculateDebtPaymentsDueBeforePayday(
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  paydayDate: string,
) {
  const debtPayments = debts
    .filter(
      (debt) =>
        isActiveStatus(debt.status) && isDateInRange(debt.dueDate, startDate, paydayDate),
    )
    .reduce((total, debt) => total + debt.minimumPayment, 0);

  const manualPayments = manualFinanceItems
    .filter(
      (item) =>
        manualItemIsCashflowOutflow(item) &&
        (item.direction === "liability" || item.direction === "payable") &&
        isDateInRange(item.dueDate, startDate, paydayDate),
    )
    .reduce((total, item) => total + (item.minimumPayment ?? item.amount), 0);

  return debtPayments + manualPayments;
}

export function calculateSafeToSpendAmount(input: SafeToSpendInput) {
  return (
    input.currentCash -
    input.billsDueBeforePayday -
    input.plannedSavingsBeforePayday -
    input.debtPaymentsBeforePayday -
    input.minimumBuffer -
    input.reservedGoalContributions +
    (input.confirmedAdjustments ?? 0)
  );
}

export const calculateSafeToSpend = calculateSafeToSpendAmount;

export function calculateMonthlyIncome(
  transactions: Transaction[],
  manualFinanceItems: ManualFinanceItem[],
  period: BudgetPeriod,
) {
  const transactionIncome = transactions
    .filter(
      (transaction) =>
        transaction.kind === "income" &&
        transaction.amount > 0 &&
        isDateInRange(transaction.date, period.startDate, period.endDate),
    )
    .reduce((total, transaction) => total + transaction.amount, 0);

  const manualIncome = manualFinanceItems
    .filter(
      (item) =>
        item.type === "manual_income" &&
        item.direction === "income" &&
        item.includeInCashflow &&
        isActiveStatus(item.status) &&
        isDateInRange(item.dueDate, period.startDate, period.endDate),
    )
    .reduce((total, item) => total + item.amount, 0);

  return transactionIncome + manualIncome;
}

export function calculateMonthlySpending(
  transactions: Transaction[],
  manualFinanceItems: ManualFinanceItem[],
  period: BudgetPeriod,
  accounts: Account[] = [],
  transactionBudgetOverrides: TransactionBudgetOverride[] = [],
) {
  const interpretedTransactions =
    accounts.length > 0 || transactionBudgetOverrides.length > 0
      ? filterTransactionsForBudget(
          transactions,
          accounts,
          transactionBudgetOverrides,
          "monthly",
        )
      : transactions.filter((transaction) => !isOwnAccountTransfer(transaction));

  const transactionSpending = interpretedTransactions
    .filter(
      (transaction) =>
        transaction.kind === "expense" &&
        transaction.amount < 0 &&
        isDateInRange(transaction.date, period.startDate, period.endDate),
    )
    .reduce((total, transaction) => total + absoluteAmount(transaction.amount), 0);

  const manualSpending = manualFinanceItems
    .filter(
      (item) =>
        (item.type === "manual_bill" || item.type === "future_expense") &&
        item.direction === "expense" &&
        item.includeInCashflow &&
        isActiveStatus(item.status) &&
        isDateInRange(item.dueDate, period.startDate, period.endDate),
    )
    .reduce((total, item) => total + item.amount, 0);

  return transactionSpending + manualSpending;
}

export function calculateSpendByCategory(
  transactions: Transaction[],
  categories: Category[],
  period: BudgetPeriod,
  accounts: Account[] = [],
  transactionBudgetOverrides: TransactionBudgetOverride[] = [],
): SpendByCategory[] {
  const interpretedTransactions =
    accounts.length > 0 || transactionBudgetOverrides.length > 0
      ? filterTransactionsForBudget(
          transactions,
          accounts,
          transactionBudgetOverrides,
          "summaries",
        )
      : transactions.filter((transaction) => !isOwnAccountTransfer(transaction));

  const spendByCategoryId = interpretedTransactions
    .filter(
      (transaction) =>
        transaction.kind === "expense" &&
        transaction.amount < 0 &&
        isDateInRange(transaction.date, period.startDate, period.endDate),
    )
    .reduce<Record<string, number>>((groups, transaction) => {
      groups[transaction.categoryId] =
        (groups[transaction.categoryId] ?? 0) + absoluteAmount(transaction.amount);
      return groups;
    }, {});

  return Object.entries(spendByCategoryId)
    .map(([categoryId, spent]) => ({
      categoryId,
      category: categories.find((category) => category.id === categoryId)?.name ?? "Other",
      spent,
    }))
    .sort((a, b) => b.spent - a.spent);
}

export function calculateBudgetRemaining(budget: Budget, spent: number) {
  return budget.amount - spent;
}

export function calculateBudgetUsagePercentage(budget: Budget, spent: number) {
  if (budget.amount <= 0) {
    return 0;
  }

  return spent / budget.amount;
}

export function calculateBudgetPace(
  actualSpendToDate: number,
  monthlyBudget: number,
  elapsedBudgetPeriodRatio: number,
): {
  expectedSpendToDate: number;
  paceRatio: number;
  status: BudgetPaceStatus;
} {
  if (monthlyBudget <= 0 || elapsedBudgetPeriodRatio <= 0) {
    return {
      expectedSpendToDate: 0,
      paceRatio: 0,
      status: "under pace",
    };
  }

  const expectedSpendToDate = monthlyBudget * elapsedBudgetPeriodRatio;
  const paceRatio = actualSpendToDate / expectedSpendToDate;

  if (paceRatio <= 0.9) {
    return { expectedSpendToDate, paceRatio, status: "under pace" };
  }

  if (paceRatio <= 1.1) {
    return { expectedSpendToDate, paceRatio, status: "on pace" };
  }

  if (paceRatio <= 1.3) {
    return { expectedSpendToDate, paceRatio, status: "high" };
  }

  return { expectedSpendToDate, paceRatio, status: "risk" };
}

export function calculateBudgetHealth(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  period: BudgetPeriod,
  elapsedBudgetPeriodRatio: number,
  accounts: Account[] = [],
  transactionBudgetOverrides: TransactionBudgetOverride[] = [],
): BudgetHealthItem[] {
  const spendByCategory = calculateSpendByCategory(
    transactions,
    categories,
    period,
    accounts,
    transactionBudgetOverrides,
  );

  return budgets.map((budget) => {
    const category =
      categories.find((candidate) => candidate.id === budget.categoryId)?.name ?? "Other";
    const spent =
      spendByCategory.find((spend) => spend.categoryId === budget.categoryId)?.spent ?? 0;
    const remaining = calculateBudgetRemaining(budget, spent);
    const usagePercentage = calculateBudgetUsagePercentage(budget, spent);
    const pace = calculateBudgetPace(spent, budget.amount, elapsedBudgetPeriodRatio);
    const forecast =
      elapsedBudgetPeriodRatio <= 0 ? spent : spent / elapsedBudgetPeriodRatio;

    return {
      categoryId: budget.categoryId,
      category,
      budget: budget.amount,
      spent,
      remaining,
      usagePercentage,
      forecast,
      paceRatio: pace.paceRatio,
      status: pace.status,
      tone: toneByStatus[pace.status],
    };
  });
}

export function calculateProjectedMonthEndBalance({
  currentCash,
  expectedIncome,
  plannedOutflows,
}: {
  currentCash: number;
  expectedIncome: number;
  plannedOutflows: number;
}) {
  return currentCash + expectedIncome - plannedOutflows;
}

export function calculateSavingsGoalProgress(
  goal: SavingsGoal,
  linkedAccountBalance = 0,
): SavingsGoalProgress {
  const currentAmount = goal.currentAmount + linkedAccountBalance;
  const progressRatio =
    goal.targetAmount <= 0 ? 0 : Math.min(currentAmount / goal.targetAmount, 1);

  return {
    goalId: goal.id,
    progressRatio,
    progressPercentage: progressRatio * 100,
    remainingAmount: Math.max(goal.targetAmount - currentAmount, 0),
  };
}

export function calculateLinkedSavingsGoalBalance(accounts: Account[], goalId: string) {
  return accounts
    .filter(
      (account) =>
        account.linkedGoalIds.includes(goalId) &&
        isUsableAccount(account) &&
        account.isSavingsAccount,
    )
    .reduce((total, account) => total + calculateAccountCashBalance(account), 0);
}

export function calculateLinkedSavingsGoalBalances(
  accounts: Account[],
  goals: SavingsGoal[],
): LinkedSavingsGoalBalance[] {
  return goals.map((goal) => ({
    goalId: goal.id,
    balance: calculateLinkedSavingsGoalBalance(accounts, goal.id),
  }));
}

export function calculateTotalAssets(
  accounts: Account[],
  manualFinanceItems: ManualFinanceItem[],
) {
  const accountAssets = accounts
    .filter((account) => account.includeInNetWorth && isUsableAccount(account))
    .reduce((total, account) => total + Math.max(account.balance, 0), 0);

  const manualAssets = manualFinanceItems
    .filter(manualItemIsAsset)
    .reduce((total, item) => total + item.amount, 0);

  return accountAssets + manualAssets;
}

export function calculateTotalLiabilities(
  accounts: Account[],
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[],
) {
  const debtAccountIds = new Set(
    debts
      .filter((debt) => debt.includeInNetWorth && isActiveStatus(debt.status))
      .map((debt) => debt.accountId)
      .filter(Boolean),
  );

  const accountLiabilities = accounts
    .filter(
      (account) =>
        account.includeInNetWorth &&
        isUsableAccount(account) &&
        account.balance < 0 &&
        !debtAccountIds.has(account.id),
    )
    .reduce((total, account) => total + absoluteAmount(account.balance), 0);

  const debtLiabilities = debts
    .filter((debt) => debt.includeInNetWorth && isActiveStatus(debt.status))
    .reduce((total, debt) => total + debt.balance, 0);

  const manualLiabilities = manualFinanceItems
    .filter(manualItemIsLiability)
    .reduce((total, item) => total + item.amount, 0);

  return accountLiabilities + debtLiabilities + manualLiabilities;
}

export function calculateNetWorth(
  accounts: Account[],
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[],
) {
  return (
    calculateTotalAssets(accounts, manualFinanceItems) -
    calculateTotalLiabilities(accounts, debts, manualFinanceItems)
  );
}

export function calculateDebtSummary(
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[],
  accounts: Account[] = [],
): DebtSummary {
  const debtAccountIds = new Set(
    debts
      .filter((debt) => isActiveStatus(debt.status))
      .map((debt) => debt.accountId)
      .filter(Boolean),
  );
  const accountDebtItems: DebtSummaryItem[] = accounts
    .filter(
      (account) =>
        isUsableAccount(account) &&
        account.balance < 0 &&
        (account.type === "credit_card" ||
          account.type === "loan" ||
          account.purpose === "overdraft_account") &&
        !debtAccountIds.has(account.id),
    )
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: absoluteAmount(account.balance),
      minimumPayment: 0,
      apr: null,
      source: "debt",
    }));

  const debtItems: DebtSummaryItem[] = debts
    .filter((debt) => isActiveStatus(debt.status))
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: debt.balance,
      minimumPayment: debt.minimumPayment,
      apr: debt.apr,
      source: "debt",
    }));

  const manualDebtItems: DebtSummaryItem[] = manualFinanceItems
    .filter(
      (item) =>
        isActiveStatus(item.status) &&
        (item.direction === "liability" || item.direction === "payable"),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      balance: item.amount,
      minimumPayment: item.minimumPayment ?? (item.direction === "payable" ? item.amount : 0),
      apr: item.apr,
      source: "manual",
    }));

  const items = [...accountDebtItems, ...debtItems, ...manualDebtItems];
  const totalDebt = items.reduce((total, item) => total + item.balance, 0);
  const totalMinimumPayment = items.reduce(
    (total, item) => total + item.minimumPayment,
    0,
  );
  const aprWeightedBalance = items.reduce(
    (total, item) => total + item.balance * (item.apr ?? 0),
    0,
  );

  return {
    totalDebt,
    totalMinimumPayment,
    averageApr: totalDebt === 0 ? 0 : aprWeightedBalance / totalDebt,
    items,
  };
}

export function getConnectionLifecycleStatus(
  connection: BankConnection,
  asOfDate: string,
): ConnectionLifecycleStatus {
  if (
    connection.consentStatus === "expired" ||
    (connection.consentExpiresAt && connection.consentExpiresAt < asOfDate)
  ) {
    return "needs_reconsent";
  }

  return connection.status;
}
