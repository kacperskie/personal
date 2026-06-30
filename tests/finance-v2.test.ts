import { describe, expect, it } from "vitest";
import {
  addMonthsToIsoDate,
  buildDebtInputs,
  calculateBillsAccountFunding,
  calculateDebtFreedomSummary,
  calculateOverdraftProjection,
  calculatePaydayAllocation,
  determineNextBestAction,
  determineSavingsPhase,
  orderDebts,
  type PaydayAllocationInput,
} from "../src/lib/finance-v2";
import { mockStrategyDebts } from "../src/lib/mock-data";

const baseTargets: PaydayAllocationInput = {
  income: 0,
  billsAccountTarget: 1000,
  minimumDebtPaymentsTarget: 300,
  overdraftReductionTarget: 150,
  essentialSpendingTarget: 500,
  emergencyBufferTarget: 100,
  savingsTarget: 200,
  flexibleSpendingTarget: 200,
};

describe("addMonthsToIsoDate", () => {
  it("adds whole months and clamps to month end", () => {
    expect(addMonthsToIsoDate("2026-07-25", 4)).toBe("2026-11-25");
    expect(addMonthsToIsoDate("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("payday allocation waterfall", () => {
  it("fully funds every tier and reports leftover when income exceeds all targets", () => {
    const result = calculatePaydayAllocation({ ...baseTargets, income: 2600 });

    expect(result.billsAccountAllocation).toBe(1000);
    expect(result.minimumDebtPaymentsAllocation).toBe(300);
    expect(result.overdraftReductionAllocation).toBe(150);
    expect(result.essentialSpendingAllocation).toBe(500);
    expect(result.emergencyBufferAllocation).toBe(100);
    expect(result.savingsAllocation).toBe(200);
    expect(result.flexibleSpendingAllocation).toBe(200);
    expect(result.leftover).toBe(150);
    expect(result.shortfall).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("reports a shortfall and stops filling tiers when income runs out", () => {
    const result = calculatePaydayAllocation({ ...baseTargets, income: 1200 });

    expect(result.billsAccountAllocation).toBe(1000);
    expect(result.minimumDebtPaymentsAllocation).toBe(200);
    expect(result.overdraftReductionAllocation).toBe(0);
    expect(result.savingsAllocation).toBe(0);
    expect(result.leftover).toBe(0);
    expect(result.shortfall).toBe(1250);
    expect(result.warnings[0]).toContain("Shortfall");
  });

  it("funds flexible spending and leaves a leftover surplus", () => {
    const result = calculatePaydayAllocation({
      income: 2200,
      billsAccountTarget: 800,
      minimumDebtPaymentsTarget: 200,
      overdraftReductionTarget: 100,
      essentialSpendingTarget: 400,
      emergencyBufferTarget: 100,
      savingsTarget: 100,
      flexibleSpendingTarget: 300,
    });

    expect(result.flexibleSpendingAllocation).toBe(300);
    expect(result.leftover).toBe(200);
    expect(result.shortfall).toBe(0);
  });
});

describe("overdraft projection", () => {
  it("projects paydays remaining and overdraft-free date for an active overdraft", () => {
    const result = calculateOverdraftProjection({
      linkedAccountId: "acct_current",
      overdraftLimit: 1000,
      currentOverdraftUsed: 600,
      targetReductionPerPayday: 150,
      paydayDate: "2026-07-25",
    });

    expect(result.isOverdraftFree).toBe(false);
    expect(result.percentageOfLimitUsed).toBe(60);
    expect(result.paydaysRemaining).toBe(4);
    expect(result.projectedOverdraftFreeDate).toBe("2026-11-25");
    expect(result.riskBeforePayday).toBe("medium");
  });

  it("reports overdraft-free when nothing is drawn", () => {
    const result = calculateOverdraftProjection({
      overdraftLimit: 1000,
      currentOverdraftUsed: 0,
      targetReductionPerPayday: 150,
      paydayDate: "2026-07-25",
    });

    expect(result.isOverdraftFree).toBe(true);
    expect(result.paydaysRemaining).toBe(0);
    expect(result.projectedOverdraftFreeDate).toBeNull();
    expect(result.riskBeforePayday).toBe("none");
    expect(result.recommendedPaydayAction).toContain("overdraft-free");
  });

  it("flags high risk when the balance approaches the limit before payday", () => {
    const result = calculateOverdraftProjection({
      overdraftLimit: 1000,
      currentOverdraftUsed: 600,
      targetReductionPerPayday: 150,
      projectedBalanceBeforePayday: -950,
      paydayDate: "2026-07-25",
    });

    expect(result.riskBeforePayday).toBe("high");
    expect(result.recommendedPaydayAction).toContain("Urgent");
  });
});

describe("debt strategy ordering", () => {
  const inputs = buildDebtInputs(mockStrategyDebts);

  it("orders by smallest balance first for snowball", () => {
    const ordered = orderDebts(inputs, "snowball");
    expect(ordered.map((debt) => debt.name)).toEqual([
      "Store card",
      "Credit card",
      "Car finance",
    ]);
    expect(ordered[0].payoffOrder).toBe(1);
  });

  it("orders by highest APR first for avalanche", () => {
    const ordered = orderDebts(inputs, "avalanche");
    expect(ordered.map((debt) => debt.name)).toEqual([
      "Credit card",
      "Store card",
      "Car finance",
    ]);
  });

  it("orders by explicit priority first for custom", () => {
    const ordered = orderDebts(inputs, "custom");
    expect(ordered.map((debt) => debt.name)).toEqual([
      "Car finance",
      "Store card",
      "Credit card",
    ]);
  });
});

describe("debt-free forecast", () => {
  it("computes totals, ordering and a projected debt-free date", () => {
    const summary = calculateDebtFreedomSummary({
      debts: buildDebtInputs(mockStrategyDebts),
      strategy: "avalanche",
      extraPaymentAvailable: 200,
      startDate: "2026-07-25",
    });

    expect(summary.totalDebt).toBe(7750);
    expect(summary.totalMinimumPayments).toBe(310);
    expect(summary.extraPaymentAvailable).toBe(200);
    expect(summary.nextDebtToAttack?.name).toBe("Credit card");
    expect(summary.projectedDebtFreeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.projectedDebtFreeDate! > "2026-07-25").toBe(true);
    expect(summary.warnings).toHaveLength(0);
  });

  it("warns when the payment pool can never clear the debt", () => {
    const summary = calculateDebtFreedomSummary({
      debts: [
        {
          id: "debt_stuck",
          name: "High interest loan",
          balance: 5000,
          minimumPayment: 5,
          apr: 39.9,
        },
      ],
      strategy: "avalanche",
      extraPaymentAvailable: 0,
      startDate: "2026-07-25",
    });

    expect(summary.projectedDebtFreeDate).toBeNull();
    expect(summary.warnings.length).toBeGreaterThan(0);
  });
});

describe("bills-account funding", () => {
  it("reports a surplus when fully funded", () => {
    const summary = calculateBillsAccountFunding({
      billsAccountId: "acct_bills",
      billsAccountBalance: 1200,
      billsDueBeforePayday: 800,
    });

    expect(summary.isFullyFunded).toBe(true);
    expect(summary.expectedSurplus).toBe(400);
    expect(summary.expectedShortfall).toBe(0);
    expect(summary.paydayTransferRequired).toBe(0);
    expect(summary.warnings).toHaveLength(0);
  });

  it("reports the transfer required when underfunded", () => {
    const summary = calculateBillsAccountFunding({
      billsAccountId: "acct_bills",
      billsAccountBalance: 300,
      billsDueBeforePayday: 800,
    });

    expect(summary.isFullyFunded).toBe(false);
    expect(summary.expectedShortfall).toBe(500);
    expect(summary.paydayTransferRequired).toBe(500);
    expect(summary.warnings[0]).toContain("underfunded");
  });
});

describe("savings phase detection", () => {
  const targets = {
    starterBufferTarget: 500,
    emergencyFundTarget: 3000,
    oneMonthExpensesTarget: 1500,
  };

  it("starts in the starter emergency buffer phase", () => {
    const summary = determineSavingsPhase({
      totalSavings: 200,
      isOverdraftFree: false,
      isDebtFree: false,
      ...targets,
    });

    expect(summary.currentPhase).toBe("starter_emergency_buffer");
    expect(summary.progressPercentage).toBe(40);
    expect(summary.nextPhase).toBe("overdraft_free");
  });

  it("moves to the overdraft-free phase once the buffer is funded", () => {
    const summary = determineSavingsPhase({
      totalSavings: 600,
      isOverdraftFree: false,
      isDebtFree: false,
      ...targets,
    });

    expect(summary.currentPhase).toBe("overdraft_free");
    expect(summary.progressPercentage).toBe(0);
  });

  it("reaches the debt-free phase when buffer, overdraft and emergency fund are clear", () => {
    const summary = determineSavingsPhase({
      totalSavings: 3500,
      isOverdraftFree: true,
      isDebtFree: false,
      ...targets,
    });

    expect(summary.currentPhase).toBe("debt_free");
    expect(summary.nextPhase).toBe("one_month_essential_expenses");
  });
});

describe("next best action", () => {
  const fundedBills = calculateBillsAccountFunding({
    billsAccountId: "acct_bills",
    billsAccountBalance: 1200,
    billsDueBeforePayday: 800,
  });
  const highRiskOverdraft = calculateOverdraftProjection({
    linkedAccountId: "acct_current",
    overdraftLimit: 1000,
    currentOverdraftUsed: 600,
    targetReductionPerPayday: 150,
    projectedBalanceBeforePayday: -950,
    paydayDate: "2026-07-25",
  });

  it("chooses bills shortfall before everything else", () => {
    const action = determineNextBestAction({
      billsAccount: calculateBillsAccountFunding({
        billsAccountId: "acct_bills",
        billsAccountBalance: 100,
        billsDueBeforePayday: 600,
      }),
      overdraft: highRiskOverdraft,
      debtPaymentsDueBeforePayday: 75,
      nextDebtDue: { id: "debt_credit_card", name: "Credit card", amount: 75 },
      safeToSpend: 50,
      lowSafeToSpendThreshold: 100,
    });

    expect(action.type).toBe("fund_bills_account");
    expect(action.priority).toBe(1);
    expect(action.amount).toBe(500);
  });

  it("chooses overdraft risk before a debt overpayment opportunity", () => {
    const action = determineNextBestAction({
      billsAccount: fundedBills,
      overdraft: highRiskOverdraft,
      debtPaymentsDueBeforePayday: 0,
      nextDebtDue: null,
      safeToSpend: 400,
      lowSafeToSpendThreshold: 100,
      debtOverpaymentOpportunity: 300,
      nextDebtToAttack: { id: "debt_credit_card", name: "Credit card" },
    });

    expect(action.type).toBe("address_overdraft_risk");
    expect(action.priority).toBe(2);
  });

  it("chooses a savings goal when bills, overdraft and debts are clear", () => {
    const action = determineNextBestAction({
      billsAccount: fundedBills,
      overdraft: null,
      debtPaymentsDueBeforePayday: 0,
      nextDebtDue: null,
      safeToSpend: 400,
      lowSafeToSpendThreshold: 100,
      overdraftReductionOpportunity: 0,
      debtOverpaymentOpportunity: 0,
      emergencyBufferGap: 0,
      savingsGoalContribution: {
        goalId: "goal_emergency_fund",
        name: "Emergency fund",
        amount: 200,
      },
    });

    expect(action.type).toBe("contribute_savings_goal");
    expect(action.priority).toBe(8);
    expect(action.relatedEntityId).toBe("goal_emergency_fund");
  });
});
