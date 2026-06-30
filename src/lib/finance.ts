export type BudgetPaceStatus = "under pace" | "on pace" | "high" | "risk";

export type SafeToSpendInput = {
  availableCash: number;
  upcomingBillsBeforePayday: number;
  plannedSavingsBeforePayday: number;
  debtPaymentsBeforePayday: number;
  minimumBuffer: number;
  reservedGoalContributions: number;
  confirmedAdjustments?: number;
};

export function calculateSafeToSpend(input: SafeToSpendInput) {
  return (
    input.availableCash -
    input.upcomingBillsBeforePayday -
    input.plannedSavingsBeforePayday -
    input.debtPaymentsBeforePayday -
    input.minimumBuffer -
    input.reservedGoalContributions +
    (input.confirmedAdjustments ?? 0)
  );
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
