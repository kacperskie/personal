import { describe, expect, it } from "vitest";
import {
  calculateBillsDueBeforePayday,
  calculateBudgetHealth,
  calculateBudgetPace,
  calculateBudgetRemaining,
  calculateBudgetUsagePercentage,
  calculateDebtPaymentsDueBeforePayday,
  calculateDebtSummary,
  calculateMonthlyIncome,
  calculateMonthlySpending,
  calculateNetWorth,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpend,
  calculateSafeToSpendAmount,
  calculateSavingsGoalProgress,
  calculateSpendByCategory,
  calculateTotalAssets,
  calculateTotalCurrentCash,
  calculateTotalLiabilities,
  getUpcomingBillItems,
  getUpcomingManualCashflowItems,
} from "../src/lib/finance";
import {
  mockAccounts,
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
      3905.7,
      2,
    );
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
    ).toBe(430);
  });

  it("calculates safe-to-spend after commitments and buffer", () => {
    const input = {
      currentCash: 3905.7,
      billsDueBeforePayday: 1659.89,
      plannedSavingsBeforePayday: 762,
      debtPaymentsBeforePayday: 430,
      minimumBuffer: mockUserProfile.minimumBuffer,
      reservedGoalContributions: 0,
    };

    expect(calculateSafeToSpendAmount(input)).toBeCloseTo(703.81, 2);
    expect(calculateSafeToSpend(input)).toBeCloseTo(703.81, 2);
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
    const progress = calculateSavingsGoalProgress(mockSavingsGoals[0]);

    expect(progress.progressRatio).toBeCloseTo(0.428, 3);
    expect(progress.progressPercentage).toBeCloseTo(42.8, 1);
    expect(progress.remainingAmount).toBe(2860);
  });

  it("calculates total assets, liabilities, and net worth", () => {
    expect(calculateTotalAssets(mockAccounts, mockManualFinanceItems)).toBeCloseTo(
      21735.7,
      2,
    );
    expect(
      calculateTotalLiabilities(mockAccounts, mockDebts, mockManualFinanceItems),
    ).toBe(4440);
    expect(calculateNetWorth(mockAccounts, mockDebts, mockManualFinanceItems)).toBeCloseTo(
      17295.7,
      2,
    );
  });

  it("calculates debt summary from debts and payable manual items", () => {
    const summary = calculateDebtSummary(mockDebts, mockManualFinanceItems);

    expect(summary.items).toHaveLength(4);
    expect(summary.totalDebt).toBe(4440);
    expect(summary.totalMinimumPayment).toBe(430);
    expect(summary.averageApr).toBeCloseTo(8.6342, 4);
  });
});
