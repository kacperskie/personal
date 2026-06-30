import { describe, expect, it } from "vitest";
import {
  calculateBudgetPace,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpend,
} from "../src/lib/finance";

describe("finance calculations", () => {
  it("calculates safe-to-spend after commitments and buffer", () => {
    expect(
      calculateSafeToSpend({
        availableCash: 2000,
        upcomingBillsBeforePayday: 650,
        plannedSavingsBeforePayday: 200,
        debtPaymentsBeforePayday: 100,
        minimumBuffer: 250,
        reservedGoalContributions: 150,
      }),
    ).toBe(650);
  });

  it("classifies budget pace according to expected spend", () => {
    expect(calculateBudgetPace(130, 200, 0.5).status).toBe("high");
    expect(calculateBudgetPace(131, 200, 0.5).status).toBe("risk");
    expect(calculateBudgetPace(105, 200, 0.5).status).toBe("on pace");
    expect(calculateBudgetPace(80, 200, 0.5).status).toBe("under pace");
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
});
