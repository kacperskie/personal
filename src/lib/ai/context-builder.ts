import type {
  AIMoneyCoachMode,
  AIDataUsedSummary,
  BudgetPeriod,
  CashflowEvent,
  Transaction,
} from "@/lib/domain";
import {
  calculateBillsDueBeforePayday,
  calculateBudgetHealth,
  calculateDebtSummary,
  calculateMonthlyIncome,
  calculateMonthlySpending,
  calculateNetWorth,
  calculateSafeToSpendAmount,
  calculateSafeToSpendEligibleCash,
  calculateTotalAssets,
  calculateTotalCurrentCash,
  calculateTotalLiabilities,
  getUpcomingBillItems,
} from "@/lib/finance";
import {
  getAccounts,
  getBills,
  getBudgetPeriods,
  getBudgets,
  getCashflowEvents,
  getCategories,
  getDebts,
  getDetectedBills,
  getDetectedSubscriptions,
  getManualFinanceItems,
  getSavingsGoals,
  getSpendingAnomalies,
  getSubscriptions,
  getTransactionEnrichments,
  getTransactions,
  getUserProfile,
} from "@/lib/repositories/finance-repository";
import { redactFinanceContext } from "@/lib/ai/redaction";
import { forecastCashflow } from "@/lib/transaction-intelligence";

export type MoneyCoachContextDepth = "summary" | "deep";

export type MoneyCoachFinanceContext = {
  app: {
    name: "Personal Finance HQ";
    locale: "en-GB";
    currency: "GBP";
    mode: AIMoneyCoachMode;
    asOfDate: string;
    deterministicEngine: true;
  };
  userSettings: {
    paydayDayOfMonth: number;
    minimumBuffer: number;
  };
  cashPosition: {
    currentCash: number;
    safeToSpend: number;
    safeToSpendEligibleCash: number;
    billsDueBeforePayday: number;
    monthlyIncome: number;
    monthlySpending: number;
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
  };
  accountBalancesByPurpose: Array<{
    purpose: string;
    accounts: number;
    balance: number;
    includedInSafeToSpend: boolean;
    includedInCashflow: boolean;
    includedInNetWorth: boolean;
  }>;
  upcomingBills: Array<{ name: string; dueDate: string; amount: number; source: string }>;
  upcomingSubscriptions: Array<{ name: string; dueDate: string; amount: number; status: string }>;
  cashflowForecast: ReturnType<typeof forecastCashflow>;
  budgetUsage: Array<{
    category: string;
    budget: number;
    spent: number;
    remaining: number;
    usagePercentage: number;
    status: string;
  }>;
  savingsGoals: Array<{
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    priority: string;
  }>;
  debtsAndLiabilities: ReturnType<typeof calculateDebtSummary>;
  manualFinanceItems: Array<{
    type: string;
    direction: string;
    amount: number;
    includeInCashflow: boolean;
    includeInNetWorth: boolean;
    status: string;
  }>;
  spendingAnomalies: Array<{
    type: string;
    severity: string;
    category: string | null;
    amount: number | null;
    status: string;
  }>;
  recentTransactionsSummary: {
    count: number;
    incomeTotal: number;
    spendingTotal: number;
    pendingCount: number;
    needsReviewCount: number;
    topMerchants: Array<{ merchant: string; amount: number; count: number }>;
    sampleTransactions?: Array<{
      date: string;
      merchant: string;
      category: string;
      amount: number;
      pending: boolean;
    }>;
  };
  reviewedTransferExclusions: {
    count: number;
  };
  detectedItemsNeedingReview: {
    bills: number;
    subscriptions: number;
    transactionEnrichments: number;
  };
  sourceSummary: AIDataUsedSummary;
  uncertaintyNotes: string[];
};

function currentMonthPeriod(asOfDate: string): BudgetPeriod {
  const monthStart = `${asOfDate.slice(0, 8)}01`;
  const end = new Date(`${monthStart}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);

  return {
    id: `period_${asOfDate.slice(0, 7)}`,
    userId: "derived",
    label: asOfDate.slice(0, 7),
    startDate: monthStart,
    endDate: end.toISOString().slice(0, 10),
    status: "open",
  };
}

function nextPayday(asOfDate: string, dayOfMonth: number) {
  const date = new Date(`${asOfDate}T00:00:00.000Z`);
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), dayOfMonth));

  if (candidate.toISOString().slice(0, 10) <= asOfDate) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }

  return candidate.toISOString().slice(0, 10);
}

function groupCashflowEventsToPayday(events: CashflowEvent[], asOfDate: string, paydayDate: string) {
  return events.filter(
    (event) => event.includeInCashflow && event.date >= asOfDate && event.date <= paydayDate,
  );
}

function buildAccountPurposeSummary(accounts: Awaited<ReturnType<typeof getAccounts>>) {
  const groups = new Map<
    string,
    {
      purpose: string;
      accounts: number;
      balance: number;
      includedInSafeToSpend: boolean;
      includedInCashflow: boolean;
      includedInNetWorth: boolean;
    }
  >();

  accounts.forEach((account) => {
    const existing =
      groups.get(account.purpose) ??
      {
        purpose: account.purpose,
        accounts: 0,
        balance: 0,
        includedInSafeToSpend: false,
        includedInCashflow: false,
        includedInNetWorth: false,
      };

    existing.accounts += 1;
    existing.balance += account.balance;
    existing.includedInSafeToSpend ||= account.includeInSafeToSpend;
    existing.includedInCashflow ||= account.includeInCashflow;
    existing.includedInNetWorth ||= account.includeInNetWorth;
    groups.set(account.purpose, existing);
  });

  return Array.from(groups.values()).sort((a, b) => b.balance - a.balance);
}

function buildRecentTransactionSummary(
  transactions: Transaction[],
  enrichments: Awaited<ReturnType<typeof getTransactionEnrichments>>,
  depth: MoneyCoachContextDepth,
) {
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const merchantGroups = new Map<string, { merchant: string; amount: number; count: number }>();

  recent.forEach((transaction) => {
    if (transaction.kind !== "expense" || transaction.amount >= 0) {
      return;
    }

    const enrichment = enrichments.find((item) => item.transactionId === transaction.id);
    const merchant = enrichment?.normalisedMerchantName ?? transaction.merchant;
    const existing = merchantGroups.get(merchant) ?? { merchant, amount: 0, count: 0 };
    existing.amount += Math.abs(transaction.amount);
    existing.count += 1;
    merchantGroups.set(merchant, existing);
  });

  return {
    count: recent.length,
    incomeTotal: recent
      .filter((transaction) => transaction.kind === "income")
      .reduce((total, transaction) => total + transaction.amount, 0),
    spendingTotal: recent
      .filter((transaction) => transaction.kind === "expense" && transaction.amount < 0)
      .reduce((total, transaction) => total + Math.abs(transaction.amount), 0),
    pendingCount: recent.filter((transaction) => transaction.pending).length,
    needsReviewCount: recent.filter((transaction) => transaction.status === "needs_review").length,
    topMerchants: Array.from(merchantGroups.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    sampleTransactions:
      depth === "deep"
        ? recent.slice(0, 10).map((transaction) => ({
            date: transaction.date,
            merchant: transaction.merchant,
            category:
              enrichments.find((item) => item.transactionId === transaction.id)?.category ??
              transaction.categoryId,
            amount: transaction.amount,
            pending: Boolean(transaction.pending),
          }))
        : undefined,
  };
}

export async function buildMoneyCoachContext({
  mode,
  asOfDate = "2026-06-30",
  depth = "summary",
}: {
  mode: AIMoneyCoachMode;
  question?: string;
  asOfDate?: string;
  depth?: MoneyCoachContextDepth;
}): Promise<MoneyCoachFinanceContext> {
  const [
    userProfile,
    accounts,
    bills,
    subscriptions,
    manualFinanceItems,
    transactions,
    categories,
    budgets,
    budgetPeriods,
    savingsGoals,
    debts,
    detectedBills,
    detectedSubscriptions,
    cashflowEvents,
    anomalies,
    enrichments,
  ] = await Promise.all([
    getUserProfile(),
    getAccounts(),
    getBills(),
    getSubscriptions(),
    getManualFinanceItems(),
    getTransactions(),
    getCategories(),
    getBudgets(),
    getBudgetPeriods(),
    getSavingsGoals(),
    getDebts(),
    getDetectedBills(),
    getDetectedSubscriptions(),
    getCashflowEvents(),
    getSpendingAnomalies(),
    getTransactionEnrichments(),
  ]);

  const activePeriod =
    budgetPeriods.find((period) => period.startDate <= asOfDate && period.endDate >= asOfDate) ??
    currentMonthPeriod(asOfDate);
  const paydayDate = nextPayday(asOfDate, userProfile.paydayDayOfMonth);
  const plannedSavingsBeforePayday = savingsGoals.reduce(
    (total, goal) => total + goal.monthlyContribution,
    0,
  );
  const upcomingBills = getUpcomingBillItems(
    bills,
    subscriptions,
    manualFinanceItems,
    asOfDate,
    paydayDate,
  );
  const billsDueBeforePayday = calculateBillsDueBeforePayday(
    bills,
    subscriptions,
    manualFinanceItems,
    asOfDate,
    paydayDate,
  );
  const budgetUsage = calculateBudgetHealth(
    budgets,
    transactions,
    categories,
    activePeriod,
    1,
  );
  const cashflowForecast = forecastCashflow({
    accounts,
    events: groupCashflowEventsToPayday(cashflowEvents, asOfDate, paydayDate),
    minimumBuffer: userProfile.minimumBuffer,
  });
  const safeToSpendEligibleCash = calculateSafeToSpendEligibleCash(accounts);
  const totalAssets = calculateTotalAssets(accounts, manualFinanceItems);
  const totalLiabilities = calculateTotalLiabilities(accounts, debts, manualFinanceItems);

  const context: MoneyCoachFinanceContext = {
    app: {
      name: "Personal Finance HQ",
      locale: "en-GB",
      currency: "GBP",
      mode,
      asOfDate,
      deterministicEngine: true,
    },
    userSettings: {
      paydayDayOfMonth: userProfile.paydayDayOfMonth,
      minimumBuffer: userProfile.minimumBuffer,
    },
    cashPosition: {
      currentCash: calculateTotalCurrentCash(accounts, manualFinanceItems),
      safeToSpend: calculateSafeToSpendAmount({
        currentCash: safeToSpendEligibleCash,
        billsDueBeforePayday,
        plannedSavingsBeforePayday,
        debtPaymentsBeforePayday: debts.reduce((total, debt) => total + debt.minimumPayment, 0),
        minimumBuffer: userProfile.minimumBuffer,
        reservedGoalContributions: 0,
      }),
      safeToSpendEligibleCash,
      billsDueBeforePayday,
      monthlyIncome: calculateMonthlyIncome(transactions, manualFinanceItems, activePeriod),
      monthlySpending: calculateMonthlySpending(transactions, manualFinanceItems, activePeriod),
      netWorth: calculateNetWorth(accounts, debts, manualFinanceItems),
      totalAssets,
      totalLiabilities,
    },
    accountBalancesByPurpose: buildAccountPurposeSummary(accounts),
    upcomingBills: upcomingBills.map((item) => ({
      name: item.name,
      dueDate: item.dueDate,
      amount: item.amount,
      source: item.source,
    })),
    upcomingSubscriptions: subscriptions
      .filter((subscription) => subscription.dueDate >= asOfDate && subscription.dueDate <= paydayDate)
      .map((subscription) => ({
        name: subscription.name,
        dueDate: subscription.dueDate,
        amount: subscription.amount,
        status: subscription.status,
      })),
    cashflowForecast,
    budgetUsage: budgetUsage.map((item) => ({
      category: item.category,
      budget: item.budget,
      spent: item.spent,
      remaining: item.remaining,
      usagePercentage: item.usagePercentage,
      status: item.status,
    })),
    savingsGoals: savingsGoals.map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: goal.targetDate,
      priority: goal.priority,
    })),
    debtsAndLiabilities: calculateDebtSummary(debts, manualFinanceItems, accounts),
    manualFinanceItems: manualFinanceItems.map((item) => ({
      type: item.type,
      direction: item.direction,
      amount: item.amount,
      includeInCashflow: item.includeInCashflow,
      includeInNetWorth: item.includeInNetWorth,
      status: item.status,
    })),
    spendingAnomalies: anomalies.map((anomaly) => ({
      type: anomaly.type,
      severity: anomaly.severity,
      category: anomaly.category,
      amount: anomaly.amount,
      status: anomaly.status,
    })),
    recentTransactionsSummary: buildRecentTransactionSummary(transactions, enrichments, depth),
    reviewedTransferExclusions: {
      count: enrichments.filter(
        (enrichment) => enrichment.internalTransfer && enrichment.excludedFromSpending,
      ).length,
    },
    detectedItemsNeedingReview: {
      bills: detectedBills.filter((bill) => !bill.reviewed).length,
      subscriptions: detectedSubscriptions.filter((subscription) => !subscription.reviewed)
        .length,
      transactionEnrichments: enrichments.filter(
        (enrichment) => enrichment.reviewStatus === "needs_review",
      ).length,
    },
    sourceSummary: {
      accounts: accounts.length,
      transactions: transactions.length,
      budgets: budgets.length,
      bills: bills.length + detectedBills.length,
      subscriptions: subscriptions.length + detectedSubscriptions.length,
      savingsGoals: savingsGoals.length,
      debts: debts.length,
      manualItems: manualFinanceItems.length,
      anomalies: anomalies.length,
      dateRange: `${activePeriod.startDate} to ${activePeriod.endDate}`,
    },
    uncertaintyNotes: [
      "OpenAI receives summaries from the deterministic finance engine, not raw provider payloads.",
      ...(transactions.length === 0 ? ["No transaction history is available."] : []),
      ...(accounts.length === 0 ? ["No account balances are available."] : []),
    ],
  };

  return redactFinanceContext(context);
}
