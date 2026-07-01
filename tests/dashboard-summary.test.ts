import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFirebaseDashboardModel,
  getDashboardViewModel,
  readFirebaseDashboardDataForContext,
  type DashboardSummaryData,
} from "../src/lib/dashboard/summary";
import type { FirebaseAuthenticatedContext } from "../src/lib/repositories/firebase-repository";
import {
  dashboardSummary as mockDashboardSummary,
  mockAccounts,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockDebts,
  mockOverdraftPlans,
  mockPaydayPlans,
  mockSavingsGoals,
  mockTransactionRecords,
  mockUserProfile,
} from "../src/lib/mock-data";

afterEach(() => {
  vi.unstubAllEnvs();
});

function liveData(userId = "user_live"): DashboardSummaryData {
  const currentAccount = {
    ...mockAccounts[0],
    id: "acct_live_current",
    userId,
    balance: 1200,
    availableBalance: 1200,
    type: "current_account" as const,
    subtype: "current" as const,
    includeInSafeToSpend: true,
    includeInCashflow: true,
    includeInNetWorth: true,
    isBillsAccount: false,
    isSavingsAccount: false,
    status: "active" as const,
  };
  const billsAccount = {
    ...mockAccounts[1],
    id: "acct_live_bills",
    userId,
    balance: 100,
    availableBalance: 100,
    type: "current_account" as const,
    subtype: "current" as const,
    includeInSafeToSpend: false,
    includeInCashflow: true,
    includeInNetWorth: true,
    isBillsAccount: true,
    isSavingsAccount: false,
    status: "active" as const,
  };
  const overdraftAccount = {
    ...mockAccounts[0],
    id: "acct_live_overdraft",
    userId,
    balance: -200,
    availableBalance: null,
    type: "current_account" as const,
    subtype: "current" as const,
    includeInSafeToSpend: false,
    includeInCashflow: true,
    includeInNetWorth: true,
    isBillsAccount: false,
    isSavingsAccount: false,
    status: "active" as const,
  };
  const bill = {
    ...mockBills[0],
    id: "bill_live_rent",
    userId,
    amount: 200,
    dueDate: "2026-07-10",
    accountId: billsAccount.id,
    status: "active" as const,
  };
  const debt = {
    ...mockDebts[0],
    id: "debt_live_card",
    userId,
    balance: 1000,
    minimumPayment: 50,
    apr: 10,
    dueDate: "2026-07-12",
    status: "active" as const,
  };
  const goal = {
    ...mockSavingsGoals[0],
    id: "goal_live_buffer",
    userId,
    currentAmount: 0,
    monthlyContribution: 100,
    status: "active" as const,
  };
  const paydayPlan = {
    ...mockPaydayPlans[0],
    id: "payday_live",
    userId,
    monthlyIncome: 2000,
    paydayDate: "2026-07-25",
    billsAccountTarget: 200,
    minimumDebtPaymentsTarget: 50,
    overdraftReductionTarget: 100,
    essentialSpendingTarget: 600,
    emergencyBufferTarget: 100,
    savingsTarget: 100,
    flexibleSpendingTarget: 300,
  };
  const overdraftPlan = {
    ...mockOverdraftPlans[0],
    id: "overdraft_live",
    userId,
    linkedAccountId: overdraftAccount.id,
    overdraftLimit: 1000,
    currentOverdraftUsed: 200,
    targetReductionPerPayday: 100,
    status: "active" as const,
  };

  return {
    userId,
    profile: {
      ...mockUserProfile,
      id: userId,
      minimumBuffer: 250,
      paydayDayOfMonth: 25,
    },
    accounts: [currentAccount, billsAccount, overdraftAccount],
    bills: [bill],
    subscriptions: [],
    debts: [debt],
    savingsGoals: [goal],
    transactions: mockTransactionRecords.slice(0, 2).map((transaction) => ({
      ...transaction,
      accountId: currentAccount.id,
      date: "2026-07-05",
    })),
    manualFinanceItems: [],
    paydayPlans: [paydayPlan],
    overdraftPlans: [overdraftPlan],
    budgets: mockBudgets.slice(0, 1).map((budget) => ({
      ...budget,
      userId,
      periodId: "period_live_july",
    })),
    budgetPeriods: [
      {
        ...mockBudgetPeriods[0],
        id: "period_live_july",
        userId,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        status: "open",
      },
    ],
    categories: mockCategories.map((category) => ({ ...category, userId })),
  };
}

function emptyData(userId = "user_empty"): DashboardSummaryData {
  return {
    userId,
    profile: { ...mockUserProfile, id: userId },
    accounts: [],
    bills: [],
    subscriptions: [],
    debts: [],
    savingsGoals: [],
    transactions: [],
    manualFinanceItems: [],
    paydayPlans: [],
    overdraftPlans: [],
    budgets: [],
    budgetPeriods: [],
    categories: [],
  };
}

describe("dashboard summary", () => {
  it("builds signed-in Firebase dashboard values from user repository data", () => {
    const model = buildFirebaseDashboardModel(liveData(), "2026-07-01");

    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") return;

    expect(model.source).toBe("firebase");
    expect(model.summary.currentCash).toBe(1300);
    expect(model.summary.safeToSpend).toBe(600);
    expect(model.summary.safeToSpend).not.toBe(mockDashboardSummary.safeToSpend);
    expect(model.summary.billsDueBeforePayday).toBe(200);
    expect(model.summary.billsAccountBalance).toBe(100);
  });

  it("shows an empty state for signed-in Firebase users with no finance data", () => {
    const model = buildFirebaseDashboardModel(emptyData(), "2026-07-01");

    expect(model).toEqual({ kind: "empty", source: "firebase" });
  });

  it("keeps BACKEND_PROVIDER=mock on the seeded mock dashboard", async () => {
    const model = await getDashboardViewModel({
      BACKEND_PROVIDER: "mock",
    } as unknown as NodeJS.ProcessEnv);

    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") return;

    expect(model.source).toBe("mock");
    expect(model.summary.safeToSpend).toBe(mockDashboardSummary.safeToSpend);
  });

  it("uses finance-v2 sections for bills funding, payday, overdraft, debt freedom and next action", () => {
    const model = buildFirebaseDashboardModel(liveData(), "2026-07-01");

    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") return;

    expect(model.financeV2.billsAccount.expectedShortfall).toBe(100);
    expect(model.financeV2.paydayAllocation?.overdraftReductionAllocation).toBe(100);
    expect(model.financeV2.overdraft?.currentOverdraftUsed).toBe(200);
    expect(model.financeV2.debtFreedom.totalDebt).toBe(1000);
    expect(model.financeV2.nextBestAction.type).toBe("fund_bills_account");
  });

  it("does not silently show mock values in Firebase mode", () => {
    const empty = buildFirebaseDashboardModel(emptyData(), "2026-07-01");
    const live = buildFirebaseDashboardModel(liveData(), "2026-07-01");

    expect(empty.kind).toBe("empty");
    expect(live.kind).toBe("ready");
    if (live.kind !== "ready") return;
    expect(live.source).toBe("firebase");
    expect(live.summary.safeToSpend).not.toBe(mockDashboardSummary.safeToSpend);
  });

  it("scopes Firestore reads to the signed-in user path and filters mismatched records", async () => {
    const paths: string[] = [];
    const profile = { ...mockUserProfile, id: "user_a" };
    const otherAccount = { ...mockAccounts[0], id: "acct_other", userId: "user_b" };
    const ownAccount = { ...mockAccounts[0], id: "acct_own", userId: "user_a" };
    const dataByCollection: Record<string, unknown[]> = {
      accounts: [ownAccount, otherAccount],
      bills: [],
      subscriptions: [],
      debts: [],
      savingsGoals: [],
      transactions: [],
      manualFinanceItems: [],
      paydayPlans: [],
      overdraftPlans: [],
      budgets: [],
      budgetPeriods: [],
      categories: [],
    };
    const db = {
      collection(path: string) {
        paths.push(path);
        const collectionName = path.split("/").at(-1) ?? "";
        return {
          async get() {
            return {
              docs: (dataByCollection[collectionName] ?? []).map((record) => ({
                data: () => record,
              })),
            };
          },
        };
      },
      doc(path: string) {
        paths.push(path);
        return {
          async get() {
            return {
              exists: true,
              data: () => profile,
            };
          },
        };
      },
    } as unknown as FirebaseAuthenticatedContext["db"];

    const result = await readFirebaseDashboardDataForContext({ db, userId: "user_a" });

    expect(paths.every((path) => path.startsWith("users/user_a"))).toBe(true);
    expect(paths.some((path) => path.includes("user_b"))).toBe(false);
    expect(result.accounts).toEqual([ownAccount]);
  });

  it("shows explicit mock fallback only when Firebase mode fallback is enabled", async () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "");

    const disabled = await getDashboardViewModel({
      BACKEND_PROVIDER: "firebase",
      MOCK_DATA_FALLBACK_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    const enabled = await getDashboardViewModel({
      BACKEND_PROVIDER: "firebase",
      MOCK_DATA_FALLBACK_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);

    expect(disabled.kind).toBe("error");
    expect(enabled.kind).toBe("ready");
    if (enabled.kind !== "ready") return;
    expect(enabled.source).toBe("firebase_fallback");
    expect(enabled.fallbackReason).toContain("explicit mock fallback");
  });
});
