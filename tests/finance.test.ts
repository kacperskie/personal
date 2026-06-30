import { describe, expect, it } from "vitest";
import {
  calculateBillsDueBeforePayday,
  calculateBillsAccountBalance,
  calculateBudgetHealth,
  calculateBudgetPace,
  calculateBudgetRemaining,
  calculateBudgetUsagePercentage,
  calculateCashflowAccountBalance,
  calculateDebtPaymentsDueBeforePayday,
  calculateDebtSummary,
  calculateLinkedSavingsGoalBalance,
  calculateMonthlyIncome,
  calculateMonthlySpending,
  calculateNetWorth,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpend,
  calculateSafeToSpendAmount,
  calculateSafeToSpendEligibleCash,
  calculateSavingsGoalProgress,
  calculateSpendByCategory,
  calculateTotalAssets,
  calculateTotalCurrentCash,
  calculateTotalLiabilities,
  getConnectionLifecycleStatus,
  getUpcomingBillItems,
  getUpcomingManualCashflowItems,
} from "../src/lib/finance";
import { mockOpenBankingProvider } from "../src/lib/bank-providers";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockDebts,
  mockManualFinanceItems,
  mockSavingsGoals,
  mockSubscriptions,
  mockTransactionRecords,
  mockUserProfile,
} from "../src/lib/mock-data";

const currentPeriod = mockBudgetPeriods[0];
const projectionPeriod = mockBudgetPeriods[1];
const asOfDate = "2026-06-30";
const nextPaydayDate = "2026-07-25";

describe("finance calculations", () => {
  it("calculates total current cash from cash accounts and manual cash items", () => {
    expect(calculateTotalCurrentCash(mockAccounts, mockManualFinanceItems)).toBeCloseTo(
      5290.7,
      2,
    );
  });

  it("excludes bills, savings, and ringfenced accounts from safe-to-spend", () => {
    expect(calculateSafeToSpendEligibleCash(mockAccounts)).toBeCloseTo(3905.7, 2);
    expect(
      calculateSafeToSpendEligibleCash(
        mockAccounts.filter((account) => account.id === "acct_nationwide_bills"),
      ),
    ).toBe(0);
    expect(
      calculateSafeToSpendEligibleCash(
        mockAccounts.filter((account) => account.id === "acct_nationwide_emergency"),
      ),
    ).toBe(0);
  });

  it("counts Amex credit card balance as a liability", () => {
    const amexAccount = mockAccounts.filter((account) => account.institutionId === "amex");

    expect(calculateTotalLiabilities(amexAccount, [], [])).toBe(640);
  });

  it("includes Nationwide bills account in cashflow but not safe-to-spend", () => {
    const billsAccount = mockAccounts.filter(
      (account) => account.id === "acct_nationwide_bills",
    );

    expect(calculateCashflowAccountBalance(billsAccount)).toBe(900);
    expect(calculateBillsAccountBalance(billsAccount)).toBe(900);
    expect(calculateSafeToSpendEligibleCash(billsAccount)).toBe(0);
  });

  it("includes Revolut everyday account in safe-to-spend", () => {
    const revolutEveryday = mockAccounts.filter(
      (account) => account.id === "acct_revolut_everyday",
    );

    expect(calculateSafeToSpendEligibleCash(revolutEveryday)).toBe(485);
  });

  it("returns upcoming manual cashflow items", () => {
    const items = getUpcomingManualCashflowItems(
      mockManualFinanceItems,
      asOfDate,
      projectionPeriod.endDate,
    );

    expect(items).toHaveLength(7);
    expect(items.map((item) => item.id)).toContain("manual_salary_forecast");
    expect(items[0].id).toBe("manual_housemate_contribution");
  });

  it("returns upcoming bills including manual bills and future expenses", () => {
    const items = getUpcomingBillItems(
      mockBills,
      mockSubscriptions,
      mockManualFinanceItems,
      asOfDate,
      nextPaydayDate,
    );

    expect(items).toHaveLength(10);
    expect(items.map((item) => item.id)).toContain("manual_car_mot");
    expect(items.map((item) => item.id)).toContain("manual_window_cleaner");
  });

  it("calculates bills due before payday", () => {
    expect(
      calculateBillsDueBeforePayday(
        mockBills,
        mockSubscriptions,
        mockManualFinanceItems,
        asOfDate,
        nextPaydayDate,
      ),
    ).toBeCloseTo(1659.89, 2);
  });

  it("calculates debt payments due before payday", () => {
    expect(
      calculateDebtPaymentsDueBeforePayday(
        mockDebts,
        mockManualFinanceItems,
        asOfDate,
        nextPaydayDate,
      ),
    ).toBe(340);
  });

  it("calculates safe-to-spend after commitments and buffer", () => {
    const input = {
      currentCash: 3905.7,
      billsDueBeforePayday: 1659.89,
      plannedSavingsBeforePayday: 762,
      debtPaymentsBeforePayday: 340,
      minimumBuffer: mockUserProfile.minimumBuffer,
      reservedGoalContributions: 0,
    };

    expect(calculateSafeToSpendAmount(input)).toBeCloseTo(793.81, 2);
    expect(calculateSafeToSpend(input)).toBeCloseTo(793.81, 2);
  });

  it("calculates monthly income from transactions and manual income", () => {
    expect(
      calculateMonthlyIncome(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(3303.2, 2);

    expect(
      calculateMonthlyIncome(
        mockTransactionRecords,
        mockManualFinanceItems,
        projectionPeriod,
      ),
    ).toBe(3100);
  });

  it("calculates monthly spending from transactions and manual expenses", () => {
    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(1534, 2);

    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        projectionPeriod,
      ),
    ).toBe(234);
  });

  it("calculates spend by category", () => {
    const spend = calculateSpendByCategory(
      mockTransactionRecords,
      mockCategories,
      currentPeriod,
    );

    expect(spend.find((item) => item.category === "Home bills")?.spent).toBe(1236);
    expect(spend.find((item) => item.category === "Groceries")?.spent).toBeCloseTo(
      150.6,
      2,
    );
    expect(spend.find((item) => item.category === "Savings")).toBeUndefined();
  });

  it("excludes own-account transfers from spending", () => {
    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(1534, 2);
  });

  it("calculates budget remaining and usage percentage", () => {
    const homeBillsBudget = mockBudgets.find(
      (budget) => budget.categoryId === "cat_home_bills",
    );

    if (!homeBillsBudget) {
      throw new Error("Expected home bills budget in mock data");
    }

    expect(calculateBudgetRemaining(homeBillsBudget, 1236)).toBe(-16);
    expect(calculateBudgetUsagePercentage(homeBillsBudget, 1236)).toBeCloseTo(
      1.0131,
      4,
    );
  });

  it("classifies budget pace according to expected spend", () => {
    expect(calculateBudgetPace(130, 200, 0.5).status).toBe("high");
    expect(calculateBudgetPace(131, 200, 0.5).status).toBe("risk");
    expect(calculateBudgetPace(105, 200, 0.5).status).toBe("on pace");
    expect(calculateBudgetPace(80, 200, 0.5).status).toBe("under pace");
  });

  it("calculates budget health rows", () => {
    const health = calculateBudgetHealth(
      mockBudgets,
      mockTransactionRecords,
      mockCategories,
      currentPeriod,
      1,
    );
    const homeBills = health.find((item) => item.category === "Home bills");

    expect(health).toHaveLength(5);
    expect(homeBills?.remaining).toBe(-16);
    expect(homeBills?.status).toBe("on pace");
  });

  it("projects month-end balance from cash, income, and outflows", () => {
    expect(
      calculateProjectedMonthEndBalance({
        currentCash: 1200,
        expectedIncome: 1800,
        plannedOutflows: 2100,
      }),
    ).toBe(900);
  });

  it("calculates savings goal progress", () => {
    const linkedBalance = calculateLinkedSavingsGoalBalance(
      mockAccounts,
      mockSavingsGoals[0].id,
    );
    const progress = calculateSavingsGoalProgress(mockSavingsGoals[0], linkedBalance);

    expect(progress.progressRatio).toBeCloseTo(0.428, 3);
    expect(progress.progressPercentage).toBeCloseTo(42.8, 1);
    expect(progress.remainingAmount).toBe(2860);
  });

  it("calculates linked savings goal balances from account links", () => {
    expect(calculateLinkedSavingsGoalBalance(mockAccounts, "goal_emergency_fund")).toBe(
      2140,
    );
    expect(calculateLinkedSavingsGoalBalance(mockAccounts, "goal_holiday")).toBe(520);
  });

  it("calculates total assets, liabilities, and net worth", () => {
    expect(calculateTotalAssets(mockAccounts, mockManualFinanceItems)).toBeCloseTo(
      25780.7,
      2,
    );
    expect(
      calculateTotalLiabilities(mockAccounts, mockDebts, mockManualFinanceItems),
    ).toBe(4440);
    expect(calculateNetWorth(mockAccounts, mockDebts, mockManualFinanceItems)).toBeCloseTo(
      21340.7,
      2,
    );
  });

  it("calculates debt summary from debts and payable manual items", () => {
    const summary = calculateDebtSummary(mockDebts, mockManualFinanceItems, mockAccounts);

    expect(summary.items).toHaveLength(4);
    expect(summary.totalDebt).toBe(4440);
    expect(summary.totalMinimumPayment).toBe(340);
    expect(summary.averageApr).toBeCloseTo(5.3333, 4);
  });

  it("marks expired consent as needs re-consent", () => {
    const revolutConnection = mockBankConnections.find(
      (connection) => connection.id === "conn_revolut",
    );

    if (!revolutConnection) {
      throw new Error("Expected Revolut connection in mock data");
    }

    expect(getConnectionLifecycleStatus(revolutConnection, asOfDate)).toBe(
      "needs_reconsent",
    );
  });

  it("mock provider adapter returns accounts and transactions", async () => {
    const accounts = await mockOpenBankingProvider.getAccounts("conn_nationwide");
    const transactions = await mockOpenBankingProvider.getTransactions("conn_nationwide");

    expect(accounts).toHaveLength(3);
    expect(accounts.map((account) => account.institutionName)).toContain("Nationwide");
    expect(transactions.some((transaction) => transaction.isOwnAccountTransfer)).toBe(true);
  });
});
