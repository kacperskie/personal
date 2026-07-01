import "server-only";

import type {
  Account,
  Bill,
  BillsAccountSummary,
  Budget,
  BudgetPeriod,
  Category,
  Debt,
  DebtFreedomSummary,
  ManualFinanceItem,
  NextBestAction,
  OverdraftPlan,
  PaydayAllocation,
  PaydayPlan,
  SavingsGoal,
  Subscription,
  Transaction,
  UserProfile,
} from "@/lib/domain";
import type { BudgetHealthItem, DebtSummary, UpcomingCommitment } from "@/lib/finance";
import { getBackendProvider } from "@/lib/backend/provider";
import {
  calculateBillsAccountBalance,
  calculateBillsDueBeforePayday,
  calculateBudgetHealth,
  calculateCashflowAccountBalance,
  calculateDebtPaymentsDueBeforePayday,
  calculateDebtSummary,
  calculateMonthlyIncome,
  calculateMonthlySpending,
  calculateNetWorth,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpendAmount,
  calculateSafeToSpendEligibleCash,
  calculateTotalAssets,
  calculateTotalCurrentCash,
  calculateTotalLiabilities,
  getUpcomingBillItems,
} from "@/lib/finance";
import {
  buildDebtInputs,
  calculateDebtFreedomSummary,
  calculateOverdraftProjection,
  calculatePaydayAllocation,
  determineNextBestAction,
  paydayAllocationInputFromPlan,
  summariseBillsAccount,
  type OverdraftProjection,
} from "@/lib/finance-v2";
import { formatDateShort } from "@/lib/format";
import {
  budgetHealth as mockBudgetHealth,
  dashboardSummary as mockDashboardSummary,
  mockAccounts,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockDebts,
  mockManualFinanceItems,
  mockOverdraftPlans,
  mockPaydayPlans,
  mockSavingsGoals,
  mockSubscriptions,
  mockTransactionRecords,
  mockUserProfile,
  upcomingBills as mockUpcomingBills,
} from "@/lib/mock-data";
import { logServerEvent } from "@/lib/observability/server-logger";
import {
  type FirebaseAuthenticatedContext,
  getFirebaseAuthenticatedContext,
  getFirebaseCollectionForContext,
} from "@/lib/repositories/firebase-repository";

export type DashboardTopLineSummary = {
  currentCash: number;
  safeToSpend: number;
  billsDueBeforePayday: number;
  monthlyIncome: number;
  monthlySpending: number;
  projectedMonthEndBalance: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  debtSummary: DebtSummary;
  safeToSpendEligibleCash: number;
  billsAccountBalance: number;
  cashflowAccountBalance: number;
  nextPayday: string;
  nextPaydayDate: string;
  budgetStatus: string;
};

export type DashboardFinanceV2Summary = {
  billsAccount: BillsAccountSummary;
  paydayAllocation: PaydayAllocation | null;
  overdraft: OverdraftProjection | null;
  debtFreedom: DebtFreedomSummary;
  nextBestAction: NextBestAction;
};

export type DashboardSummaryData = {
  userId: string;
  profile: UserProfile;
  accounts: Account[];
  bills: Bill[];
  subscriptions: Subscription[];
  debts: Debt[];
  savingsGoals: SavingsGoal[];
  transactions: Transaction[];
  manualFinanceItems: ManualFinanceItem[];
  paydayPlans: PaydayPlan[];
  overdraftPlans: OverdraftPlan[];
  budgets: Budget[];
  budgetPeriods: BudgetPeriod[];
  categories: Category[];
};

export type DashboardSource = "firebase" | "mock" | "firebase_fallback";

export type DashboardReadyModel = {
  kind: "ready";
  source: DashboardSource;
  summary: DashboardTopLineSummary;
  financeV2: DashboardFinanceV2Summary;
  budgetHealth: BudgetHealthItem[];
  upcomingBills: Array<UpcomingCommitment & { dueDateLabel: string }>;
  dataCounts: {
    accounts: number;
    bills: number;
    debts: number;
    savingsGoals: number;
    transactions: number;
    manualFinanceItems: number;
    paydayPlans: number;
    overdraftPlans: number;
  };
  fallbackReason: string | null;
};

export type DashboardEmptyModel = {
  kind: "empty";
  source: "firebase";
};

export type DashboardErrorModel = {
  kind: "error";
  source: "firebase";
  message: string;
};

export type DashboardViewModel =
  | DashboardReadyModel
  | DashboardEmptyModel
  | DashboardErrorModel;

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function clampDay(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(day, 1), lastDay);
}

export function getNextPaydayDate(asOfDate: string, paydayDayOfMonth: number) {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const day = asOf.getUTCDate();
  const targetMonth = day <= paydayDayOfMonth ? month : month + 1;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalisedMonth = ((targetMonth % 12) + 12) % 12;
  const targetDay = clampDay(targetYear, normalisedMonth, paydayDayOfMonth);

  return new Date(Date.UTC(targetYear, normalisedMonth, targetDay))
    .toISOString()
    .slice(0, 10);
}

function monthPeriod(asOfDate: string): BudgetPeriod {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const startDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  return {
    id: `derived_${startDate}`,
    userId: "derived",
    label: formatDateShort(startDate).replace(/^1 /, ""),
    startDate,
    endDate,
    status: "open",
  };
}

function activePeriod(periods: BudgetPeriod[], asOfDate: string) {
  return (
    periods.find(
      (period) =>
        period.status === "open" &&
        period.startDate <= asOfDate &&
        period.endDate >= asOfDate,
    ) ?? monthPeriod(asOfDate)
  );
}

function elapsedRatio(period: BudgetPeriod, asOfDate: string) {
  const start = new Date(`${period.startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${period.endDate}T00:00:00.000Z`).getTime();
  const current = new Date(`${asOfDate}T00:00:00.000Z`).getTime();

  if (end <= start) {
    return 1;
  }

  return Math.min(Math.max((current - start) / (end - start), 0.01), 1);
}

function budgetStatus(health: BudgetHealthItem[]) {
  if (health.length === 0) {
    return "No budget set";
  }

  if (health.some((item) => item.status === "risk")) {
    return "Budget at risk";
  }

  if (health.some((item) => item.status === "high")) {
    return "Spending pace high";
  }

  return "On track";
}

function isCurrentUserRecord<T extends { userId?: string }>(record: T, userId: string) {
  return !record.userId || record.userId === userId;
}

function userDataPresent(data: DashboardSummaryData) {
  return (
    data.accounts.length > 0 ||
    data.bills.length > 0 ||
    data.subscriptions.length > 0 ||
    data.debts.length > 0 ||
    data.savingsGoals.length > 0 ||
    data.transactions.length > 0 ||
    data.manualFinanceItems.length > 0 ||
    data.paydayPlans.length > 0 ||
    data.overdraftPlans.length > 0
  );
}

function nextDebtDue(
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  paydayDate: string,
) {
  const debtDue = debts
    .filter(
      (debt) =>
        debt.status === "active" &&
        debt.dueDate >= startDate &&
        debt.dueDate <= paydayDate &&
        debt.minimumPayment > 0,
    )
    .map((debt) => ({ id: debt.id, name: debt.name, amount: debt.minimumPayment }));
  const manualDue = manualFinanceItems
    .filter(
      (item) =>
        item.status === "active" &&
        (item.direction === "liability" || item.direction === "payable") &&
        item.dueDate !== null &&
        item.dueDate >= startDate &&
        item.dueDate <= paydayDate,
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.minimumPayment ?? item.amount,
    }));

  return [...debtDue, ...manualDue].sort((a, b) => b.amount - a.amount)[0] ?? null;
}

export function buildDashboardSummaryFromData(
  data: DashboardSummaryData,
  asOfDate = isoToday(),
): Omit<DashboardReadyModel, "kind" | "source" | "fallbackReason"> {
  const period = activePeriod(data.budgetPeriods, asOfDate);
  const ratio = elapsedRatio(period, asOfDate);
  const nextPaydayDate = getNextPaydayDate(asOfDate, data.profile.paydayDayOfMonth);
  const plannedSavingsBeforePayday = data.savingsGoals
    .filter((goal) => goal.status === "active")
    .reduce((total, goal) => total + goal.monthlyContribution, 0);
  const currentCash = calculateTotalCurrentCash(data.accounts, data.manualFinanceItems);
  const safeToSpendEligibleCash = calculateSafeToSpendEligibleCash(data.accounts);
  const billsDueBeforePayday = calculateBillsDueBeforePayday(
    data.bills,
    data.subscriptions,
    data.manualFinanceItems,
    asOfDate,
    nextPaydayDate,
  );
  const debtPaymentsBeforePayday = calculateDebtPaymentsDueBeforePayday(
    data.debts,
    data.manualFinanceItems,
    asOfDate,
    nextPaydayDate,
  );
  const safeToSpend = calculateSafeToSpendAmount({
    currentCash: safeToSpendEligibleCash,
    billsDueBeforePayday,
    plannedSavingsBeforePayday,
    debtPaymentsBeforePayday,
    minimumBuffer: data.profile.minimumBuffer,
    reservedGoalContributions: 0,
  });
  const monthEnd = period.endDate;
  const projectionIncome = calculateMonthlyIncome(data.transactions, data.manualFinanceItems, {
    ...period,
    startDate: asOfDate,
    endDate: monthEnd,
  });
  const projectionOutflows =
    calculateBillsDueBeforePayday(
      data.bills,
      data.subscriptions,
      data.manualFinanceItems,
      asOfDate,
      monthEnd,
    ) +
    calculateDebtPaymentsDueBeforePayday(data.debts, data.manualFinanceItems, asOfDate, monthEnd) +
    plannedSavingsBeforePayday;
  const activeBudgets = data.budgets.filter((budget) => budget.periodId === period.id);
  const budgetHealth = calculateBudgetHealth(
    activeBudgets,
    data.transactions,
    data.categories,
    period,
    ratio,
  );
  const billsAccount = summariseBillsAccount(
    data.accounts,
    data.bills,
    data.subscriptions,
    data.manualFinanceItems,
    asOfDate,
    nextPaydayDate,
  );
  const paydayPlan =
    data.paydayPlans
      .slice()
      .sort((a, b) => b.paydayDate.localeCompare(a.paydayDate))[0] ?? null;
  const paydayAllocation = paydayPlan
    ? calculatePaydayAllocation(paydayAllocationInputFromPlan(paydayPlan))
    : null;
  const overdraftPlan =
    data.overdraftPlans.find((plan) => plan.status === "active") ??
    data.overdraftPlans.find((plan) => plan.status === "overdraft_free") ??
    null;
  const overdraftAccount = overdraftPlan
    ? data.accounts.find((account) => account.id === overdraftPlan.linkedAccountId)
    : null;
  const overdraft = overdraftPlan
    ? calculateOverdraftProjection({
        linkedAccountId: overdraftPlan.linkedAccountId,
        overdraftLimit: overdraftPlan.overdraftLimit,
        currentOverdraftUsed:
          overdraftAccount && overdraftAccount.balance < 0
            ? Math.abs(overdraftAccount.balance)
            : overdraftPlan.currentOverdraftUsed,
        targetReductionPerPayday: overdraftPlan.targetReductionPerPayday,
        projectedBalanceBeforePayday: overdraftAccount?.balance ?? -overdraftPlan.currentOverdraftUsed,
        paydayDate: nextPaydayDate,
      })
    : null;
  const debtFreedom = calculateDebtFreedomSummary({
    debts: buildDebtInputs(data.debts, data.manualFinanceItems),
    strategy: "avalanche",
    extraPaymentAvailable: Math.max(safeToSpend - data.profile.minimumBuffer, 0),
    startDate: asOfDate,
  });
  const firstSavingsGoal =
    data.savingsGoals
      .filter((goal) => goal.status === "active" && goal.monthlyContribution > 0)
      .sort((a, b) => a.priority.localeCompare(b.priority))[0] ?? null;
  const nextBestAction = determineNextBestAction({
    billsAccount,
    overdraft,
    debtPaymentsDueBeforePayday: debtPaymentsBeforePayday,
    nextDebtDue: nextDebtDue(data.debts, data.manualFinanceItems, asOfDate, nextPaydayDate),
    safeToSpend,
    lowSafeToSpendThreshold: data.profile.minimumBuffer,
    overdraftReductionOpportunity: Math.max(safeToSpend, 0),
    debtOverpaymentOpportunity: Math.max(safeToSpend - data.profile.minimumBuffer, 0),
    nextDebtToAttack: debtFreedom.nextDebtToAttack,
    emergencyBufferGap: Math.max(data.profile.minimumBuffer - safeToSpendEligibleCash, 0),
    savingsGoalContribution: firstSavingsGoal
      ? {
          goalId: firstSavingsGoal.id,
          name: firstSavingsGoal.name,
          amount: firstSavingsGoal.monthlyContribution,
        }
      : null,
  });
  const upcomingBills = getUpcomingBillItems(
    data.bills,
    data.subscriptions,
    data.manualFinanceItems,
    asOfDate,
    nextPaydayDate,
  ).map((item) => ({
    ...item,
    dueDateLabel: formatDateShort(item.dueDate),
  }));

  return {
    summary: {
      currentCash,
      safeToSpend,
      billsDueBeforePayday,
      monthlyIncome: calculateMonthlyIncome(data.transactions, data.manualFinanceItems, period),
      monthlySpending: calculateMonthlySpending(
        data.transactions,
        data.manualFinanceItems,
        period,
      ),
      projectedMonthEndBalance: calculateProjectedMonthEndBalance({
        currentCash,
        expectedIncome: projectionIncome,
        plannedOutflows: projectionOutflows,
      }),
      totalAssets: calculateTotalAssets(data.accounts, data.manualFinanceItems),
      totalLiabilities: calculateTotalLiabilities(
        data.accounts,
        data.debts,
        data.manualFinanceItems,
      ),
      netWorth: calculateNetWorth(data.accounts, data.debts, data.manualFinanceItems),
      debtSummary: calculateDebtSummary(data.debts, data.manualFinanceItems, data.accounts),
      safeToSpendEligibleCash,
      billsAccountBalance: calculateBillsAccountBalance(data.accounts),
      cashflowAccountBalance: calculateCashflowAccountBalance(data.accounts),
      nextPayday: formatDateShort(nextPaydayDate),
      nextPaydayDate,
      budgetStatus: budgetStatus(budgetHealth),
    },
    financeV2: {
      billsAccount,
      paydayAllocation,
      overdraft,
      debtFreedom,
      nextBestAction,
    },
    budgetHealth,
    upcomingBills,
    dataCounts: {
      accounts: data.accounts.length,
      bills: data.bills.length + data.subscriptions.length,
      debts: data.debts.length,
      savingsGoals: data.savingsGoals.length,
      transactions: data.transactions.length,
      manualFinanceItems: data.manualFinanceItems.length,
      paydayPlans: data.paydayPlans.length,
      overdraftPlans: data.overdraftPlans.length,
    },
  };
}

function mockData(): DashboardSummaryData {
  return {
    userId: mockUserProfile.id,
    profile: mockUserProfile,
    accounts: mockAccounts,
    bills: mockBills,
    subscriptions: mockSubscriptions,
    debts: mockDebts,
    savingsGoals: mockSavingsGoals,
    transactions: mockTransactionRecords,
    manualFinanceItems: mockManualFinanceItems,
    paydayPlans: mockPaydayPlans,
    overdraftPlans: mockOverdraftPlans,
    budgets: mockBudgets,
    budgetPeriods: mockBudgetPeriods,
    categories: mockCategories,
  };
}

function buildMockDashboardModel(source: "mock" | "firebase_fallback", reason: string | null) {
  const computed = buildDashboardSummaryFromData(mockData(), "2026-06-30");

  return {
    kind: "ready",
    source,
    summary: {
      ...computed.summary,
      ...mockDashboardSummary,
    },
    financeV2: computed.financeV2,
    budgetHealth: mockBudgetHealth,
    upcomingBills: mockUpcomingBills,
    dataCounts: computed.dataCounts,
    fallbackReason: reason,
  } satisfies DashboardReadyModel;
}

export async function readFirebaseDashboardDataForContext(
  context: FirebaseAuthenticatedContext,
): Promise<DashboardSummaryData> {
  const [
    accounts,
    bills,
    subscriptions,
    debts,
    savingsGoals,
    transactions,
    manualFinanceItems,
    paydayPlans,
    overdraftPlans,
    budgets,
    budgetPeriods,
    categories,
  ] = await Promise.all([
    getFirebaseCollectionForContext(context, "accounts"),
    getFirebaseCollectionForContext(context, "bills"),
    getFirebaseCollectionForContext(context, "subscriptions"),
    getFirebaseCollectionForContext(context, "debts"),
    getFirebaseCollectionForContext(context, "savingsGoals"),
    getFirebaseCollectionForContext(context, "transactions"),
    getFirebaseCollectionForContext(context, "manualFinanceItems"),
    getFirebaseCollectionForContext(context, "paydayPlans"),
    getFirebaseCollectionForContext(context, "overdraftPlans"),
    getFirebaseCollectionForContext(context, "budgets"),
    getFirebaseCollectionForContext(context, "budgetPeriods"),
    getFirebaseCollectionForContext(context, "categories"),
  ]);
  const userSnapshot = await context.db.doc(`users/${context.userId}`).get();
  const profile = userSnapshot.exists
    ? (userSnapshot.data() as UserProfile)
    : { ...mockUserProfile, id: context.userId };

  return {
    userId: context.userId,
    profile,
    accounts: accounts.filter((record) => isCurrentUserRecord(record, context.userId)),
    bills: bills.filter((record) => isCurrentUserRecord(record, context.userId)),
    subscriptions: subscriptions.filter((record) => isCurrentUserRecord(record, context.userId)),
    debts: debts.filter((record) => isCurrentUserRecord(record, context.userId)),
    savingsGoals: savingsGoals.filter((record) => isCurrentUserRecord(record, context.userId)),
    transactions,
    manualFinanceItems,
    paydayPlans: paydayPlans.filter((record) => isCurrentUserRecord(record, context.userId)),
    overdraftPlans: overdraftPlans.filter((record) => isCurrentUserRecord(record, context.userId)),
    budgets: budgets.filter((record) => isCurrentUserRecord(record, context.userId)),
    budgetPeriods: budgetPeriods.filter((record) => isCurrentUserRecord(record, context.userId)),
    categories: categories.filter((record) => isCurrentUserRecord(record, context.userId)),
  };
}

async function readFirebaseDashboardData(): Promise<DashboardSummaryData | null> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return null;
  }

  return readFirebaseDashboardDataForContext(context);
}

export function buildFirebaseDashboardModel(
  data: DashboardSummaryData,
  asOfDate = isoToday(),
): DashboardReadyModel | DashboardEmptyModel {
  if (!userDataPresent(data)) {
    return { kind: "empty", source: "firebase" };
  }

  return {
    kind: "ready",
    source: "firebase",
    fallbackReason: null,
    ...buildDashboardSummaryFromData(data, asOfDate),
  };
}

function explicitMockFallbackEnabled(env: NodeJS.ProcessEnv) {
  return env.MOCK_DATA_FALLBACK_ENABLED === "true";
}

export async function getDashboardViewModel(
  env: NodeJS.ProcessEnv = process.env,
  asOfDate = isoToday(),
): Promise<DashboardViewModel> {
  if (getBackendProvider(env) === "mock") {
    return buildMockDashboardModel("mock", null);
  }

  try {
    const data = await readFirebaseDashboardData();

    if (!data) {
      if (explicitMockFallbackEnabled(env)) {
        return buildMockDashboardModel(
          "firebase_fallback",
          "Firebase session or Firestore is unavailable, so explicit mock fallback is shown.",
        );
      }

      return {
        kind: "error",
        source: "firebase",
        message:
          "The dashboard could not read your Firebase session or Firestore data. Check sign-in and Firebase Admin configuration.",
      };
    }

    return buildFirebaseDashboardModel(data, asOfDate);
  } catch (error) {
    logServerEvent({
      level: "error",
      event: "auth_event",
      message: "Dashboard Firestore read failed.",
      metadata: {
        code: "dashboard_firestore_read_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    });

    if (explicitMockFallbackEnabled(env)) {
      return buildMockDashboardModel(
        "firebase_fallback",
        "Firestore read failed, so explicit mock fallback is shown.",
      );
    }

    return {
      kind: "error",
      source: "firebase",
      message:
        "The dashboard could not load your finance data. Try again, or check Firebase readiness in Settings.",
    };
  }
}
