import type {
  Account,
  Bill,
  BillsAccountSummary,
  Debt,
  DebtFreedomSummary,
  DebtStrategy,
  ManualFinanceItem,
  NextBestAction,
  NextBestActionType,
  OrderedDebt,
  OverdraftRiskLevel,
  PaydayAllocation,
  PaydayPlan,
  SavingsPhase,
  SavingsPhaseSummary,
  Subscription,
} from "@/lib/domain";
import {
  calculateBillsAccountBalance,
  calculateBillsDueBeforePayday,
} from "@/lib/finance";

/**
 * v2 deterministic finance engine.
 *
 * Every function here is pure, GBP-only and fully reproducible: given the same
 * inputs it always returns the same result, with no clock, network or storage
 * access. Money maths lives here (never in an LLM) so it can be unit-tested and
 * explained. All amounts are plain numbers in GBP.
 */

const PHASE_ORDER: SavingsPhase[] = [
  "starter_emergency_buffer",
  "overdraft_free",
  "emergency_fund",
  "debt_free",
  "one_month_essential_expenses",
];

function clampToZero(value: number) {
  return value > 0 ? value : 0;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatGbp(value: number) {
  return `£${round2(clampToZero(value)).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Add a whole number of calendar months to an ISO date, returning a YYYY-MM-DD
 * string. Deterministic and timezone-stable (operates on the date parts only).
 */
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const base = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(base.getTime())) {
    return isoDate.slice(0, 10);
  }

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const target = new Date(Date.UTC(year, month + months, 1));
  // Clamp day to the last day of the target month (e.g. 31 Jan + 1 month).
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  return target.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// A. Payday allocation waterfall
// ---------------------------------------------------------------------------

export type PaydayAllocationInput = {
  income: number;
  billsAccountTarget: number;
  minimumDebtPaymentsTarget: number;
  overdraftReductionTarget: number;
  essentialSpendingTarget: number;
  emergencyBufferTarget: number;
  savingsTarget: number;
  flexibleSpendingTarget: number;
};

export function paydayAllocationInputFromPlan(
  plan: PaydayPlan,
): PaydayAllocationInput {
  return {
    income: plan.monthlyIncome,
    billsAccountTarget: plan.billsAccountTarget,
    minimumDebtPaymentsTarget: plan.minimumDebtPaymentsTarget,
    overdraftReductionTarget: plan.overdraftReductionTarget,
    essentialSpendingTarget: plan.essentialSpendingTarget,
    emergencyBufferTarget: plan.emergencyBufferTarget,
    savingsTarget: plan.savingsTarget,
    flexibleSpendingTarget: plan.flexibleSpendingTarget,
  };
}

/**
 * Allocate income across the seven v2 priority tiers, in order:
 * 1. bills account, 2. minimum debt payments, 3. overdraft reduction,
 * 4. essential spending, 5. emergency buffer, 6. savings, 7. flexible spending.
 *
 * Each tier is filled up to its target before the next is funded. `leftover` is
 * money beyond every target; `shortfall` is unmet target demand when income runs
 * out.
 */
export function calculatePaydayAllocation(
  input: PaydayAllocationInput,
): PaydayAllocation {
  const income = clampToZero(input.income);
  const targets: { key: keyof PaydayAllocationInput; label: string }[] = [
    { key: "billsAccountTarget", label: "bills account" },
    { key: "minimumDebtPaymentsTarget", label: "minimum debt payments" },
    { key: "overdraftReductionTarget", label: "overdraft reduction" },
    { key: "essentialSpendingTarget", label: "essential spending" },
    { key: "emergencyBufferTarget", label: "emergency buffer" },
    { key: "savingsTarget", label: "savings" },
    { key: "flexibleSpendingTarget", label: "flexible spending" },
  ];

  let remaining = income;
  const allocations: Record<string, number> = {};
  const warnings: string[] = [];
  let totalTargets = 0;

  for (const { key, label } of targets) {
    const target = clampToZero(input[key]);
    totalTargets += target;
    const allocated = Math.min(remaining, target);
    allocations[key] = round2(allocated);
    remaining = round2(remaining - allocated);

    if (allocated + 0.005 < target && label !== "flexible spending") {
      warnings.push(
        `${label[0].toUpperCase()}${label.slice(1)} underfunded by ${formatGbp(
          target - allocated,
        )} this payday.`,
      );
    }
  }

  const shortfall = round2(clampToZero(totalTargets - income));
  const leftover = round2(remaining);

  if (income <= 0) {
    warnings.unshift("No income recorded to allocate this payday.");
  }

  if (shortfall > 0) {
    warnings.unshift(
      `Income does not cover all planned allocations. Shortfall of ${formatGbp(
        shortfall,
      )}.`,
    );
  }

  return {
    income: round2(income),
    billsAccountAllocation: allocations.billsAccountTarget,
    minimumDebtPaymentsAllocation: allocations.minimumDebtPaymentsTarget,
    overdraftReductionAllocation: allocations.overdraftReductionTarget,
    essentialSpendingAllocation: allocations.essentialSpendingTarget,
    emergencyBufferAllocation: allocations.emergencyBufferTarget,
    savingsAllocation: allocations.savingsTarget,
    flexibleSpendingAllocation: allocations.flexibleSpendingTarget,
    leftover,
    shortfall,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// B. Overdraft projection
// ---------------------------------------------------------------------------

export type OverdraftProjection = {
  linkedAccountId: string | null;
  overdraftLimit: number;
  currentOverdraftUsed: number;
  percentageOfLimitUsed: number;
  isOverdraftFree: boolean;
  targetReductionPerPayday: number;
  paydaysRemaining: number | null;
  projectedOverdraftFreeDate: string | null;
  riskBeforePayday: OverdraftRiskLevel;
  recommendedPaydayAction: string;
  warnings: string[];
};

export type OverdraftProjectionInput = {
  linkedAccountId?: string | null;
  overdraftLimit: number;
  currentOverdraftUsed: number;
  targetReductionPerPayday: number;
  /**
   * Expected lowest account balance before the next payday (may be negative if
   * the account is projected to be in overdraft). When omitted, the current
   * overdraft position is used to assess risk.
   */
  projectedBalanceBeforePayday?: number | null;
  /** Date the projection starts from (defaults to the next payday). */
  paydayDate?: string | null;
};

function assessOverdraftRisk(
  projectedBalance: number,
  overdraftLimit: number,
): OverdraftRiskLevel {
  if (projectedBalance >= 0) {
    return "none";
  }

  const used = -projectedBalance;
  const headroom = overdraftLimit - used;

  if (headroom <= 0) {
    return "high";
  }

  const ratio = overdraftLimit > 0 ? headroom / overdraftLimit : 0;

  if (ratio <= 0.2) {
    return "high";
  }

  if (ratio <= 0.5) {
    return "medium";
  }

  return "low";
}

/**
 * Project an overdraft escape: how much of the limit is used, how many paydays
 * of the target reduction are left, the projected overdraft-free date, and the
 * risk of breaching the limit before the next payday.
 */
export function calculateOverdraftProjection(
  input: OverdraftProjectionInput,
): OverdraftProjection {
  const overdraftLimit = clampToZero(input.overdraftLimit);
  const currentOverdraftUsed = clampToZero(input.currentOverdraftUsed);
  const targetReductionPerPayday = clampToZero(input.targetReductionPerPayday);
  const isOverdraftFree = currentOverdraftUsed <= 0;
  const warnings: string[] = [];

  const percentageOfLimitUsed =
    overdraftLimit > 0
      ? round2((currentOverdraftUsed / overdraftLimit) * 100)
      : currentOverdraftUsed > 0
        ? 100
        : 0;

  let paydaysRemaining: number | null;
  let projectedOverdraftFreeDate: string | null;

  if (isOverdraftFree) {
    paydaysRemaining = 0;
    projectedOverdraftFreeDate = null;
  } else if (targetReductionPerPayday > 0) {
    paydaysRemaining = Math.ceil(currentOverdraftUsed / targetReductionPerPayday);
    const startDate = input.paydayDate ?? new Date().toISOString();
    projectedOverdraftFreeDate = addMonthsToIsoDate(startDate, paydaysRemaining);
  } else {
    paydaysRemaining = null;
    projectedOverdraftFreeDate = null;
    warnings.push(
      "No overdraft reduction target set; the overdraft will not reduce.",
    );
  }

  if (currentOverdraftUsed > overdraftLimit) {
    warnings.push("Overdraft usage exceeds the agreed limit.");
  }

  const projectedBalance =
    input.projectedBalanceBeforePayday ?? -currentOverdraftUsed;
  const riskBeforePayday = assessOverdraftRisk(projectedBalance, overdraftLimit);

  let recommendedPaydayAction: string;

  if (isOverdraftFree) {
    recommendedPaydayAction =
      "You're overdraft-free. Keep a buffer and redirect reductions to savings.";
  } else if (riskBeforePayday === "high") {
    recommendedPaydayAction = `Urgent: top up this account before payday and reduce the overdraft by at least ${formatGbp(
      targetReductionPerPayday,
    )} (currently ${formatGbp(currentOverdraftUsed)} of ${formatGbp(
      overdraftLimit,
    )} used).`;
  } else {
    recommendedPaydayAction = `Reduce the overdraft by at least ${formatGbp(
      targetReductionPerPayday,
    )} this payday (currently ${formatGbp(currentOverdraftUsed)} of ${formatGbp(
      overdraftLimit,
    )} used).`;
  }

  return {
    linkedAccountId: input.linkedAccountId ?? null,
    overdraftLimit: round2(overdraftLimit),
    currentOverdraftUsed: round2(currentOverdraftUsed),
    percentageOfLimitUsed,
    isOverdraftFree,
    targetReductionPerPayday: round2(targetReductionPerPayday),
    paydaysRemaining,
    projectedOverdraftFreeDate,
    riskBeforePayday,
    recommendedPaydayAction,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// C. Debt strategy ordering
// ---------------------------------------------------------------------------

export type DebtInput = {
  id: string;
  name: string;
  balance: number;
  minimumPayment: number;
  apr: number | null;
  priority?: number | null;
  source?: "debt" | "manual" | "account";
};

function isActiveDebtStatus(status: string) {
  return status === "active" || status === "confirmed" || status === "pending_review";
}

/**
 * Build deterministic {@link DebtInput}s from stored debts and manual liability
 * items. Only active, positive-balance debts are included.
 */
export function buildDebtInputs(
  debts: Debt[],
  manualFinanceItems: ManualFinanceItem[] = [],
  accounts: Account[] = [],
): DebtInput[] {
  const debtInputs: DebtInput[] = debts
    .filter((debt) => isActiveDebtStatus(debt.status) && debt.balance > 0)
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: debt.balance,
      minimumPayment: debt.minimumPayment,
      apr: debt.apr,
      priority: debt.priority ?? null,
      source: "debt",
    }));

  const manualInputs: DebtInput[] = manualFinanceItems
    .filter(
      (item) =>
        isActiveDebtStatus(item.status) &&
        (item.direction === "liability" || item.direction === "payable") &&
        item.amount > 0,
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      balance: item.amount,
      minimumPayment: item.minimumPayment ?? 0,
      apr: item.apr,
      priority: null,
      source: "manual",
    }));

  const accountInputs: DebtInput[] = accounts
    .filter(
      (account) =>
        account.status === "active" &&
        account.balance < 0 &&
        (account.type === "credit_card" ||
          account.type === "loan" ||
          account.purpose === "overdraft_account"),
    )
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: Math.abs(account.balance),
      minimumPayment:
        account.purpose === "overdraft_account"
          ? account.overdraftRepaymentTarget ?? 0
          : 0,
      apr: null,
      priority: null,
      source: "account" as const,
    }));

  return [...debtInputs, ...manualInputs, ...accountInputs];
}

/**
 * Order debts by strategy:
 * - snowball: smallest balance first (tiebreak highest APR, then name)
 * - avalanche: highest APR/cost first (tiebreak smallest balance, then name)
 * - custom: explicit priority first (nulls last), then smallest balance, then name
 */
export function orderDebts(
  debts: DebtInput[],
  strategy: DebtStrategy,
): OrderedDebt[] {
  const active = debts.filter((debt) => debt.balance > 0);

  const compare = (a: DebtInput, b: DebtInput): number => {
    if (strategy === "snowball") {
      if (a.balance !== b.balance) return a.balance - b.balance;
      if ((b.apr ?? 0) !== (a.apr ?? 0)) return (b.apr ?? 0) - (a.apr ?? 0);
      return a.name.localeCompare(b.name);
    }

    if (strategy === "avalanche") {
      if ((b.apr ?? 0) !== (a.apr ?? 0)) return (b.apr ?? 0) - (a.apr ?? 0);
      if (a.balance !== b.balance) return a.balance - b.balance;
      return a.name.localeCompare(b.name);
    }

    // custom
    const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
    const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.balance !== b.balance) return a.balance - b.balance;
    return a.name.localeCompare(b.name);
  };

  return active
    .slice()
    .sort(compare)
    .map((debt, index) => ({
      id: debt.id,
      name: debt.name,
      balance: round2(debt.balance),
      minimumPayment: round2(debt.minimumPayment),
      apr: debt.apr,
      priority: debt.priority ?? null,
      payoffOrder: index + 1,
      source: debt.source ?? "debt",
    }));
}

// ---------------------------------------------------------------------------
// D. Debt-free forecast
// ---------------------------------------------------------------------------

export type DebtFreedomInput = {
  debts: DebtInput[];
  strategy: DebtStrategy;
  extraPaymentAvailable: number;
  /** Date the repayment plan starts from (defaults to now). */
  startDate?: string;
};

const MAX_FORECAST_MONTHS = 600;

/**
 * Forecast a debt-free date by deterministically simulating monthly repayments.
 * Each month: interest accrues (APR/12), minimum payments are made, then any
 * extra payment is funnelled to the highest-priority debt for the strategy
 * (a snowball/avalanche roll-down). Returns null + a warning if the payment
 * pool can never clear the balances.
 */
export function calculateDebtFreedomSummary(
  input: DebtFreedomInput,
): DebtFreedomSummary {
  const orderedDebts = orderDebts(input.debts, input.strategy);
  const totalDebt = round2(
    orderedDebts.reduce((total, debt) => total + debt.balance, 0),
  );
  const totalMinimumPayments = round2(
    orderedDebts.reduce((total, debt) => total + debt.minimumPayment, 0),
  );
  const extraPaymentAvailable = round2(clampToZero(input.extraPaymentAvailable));
  const warnings: string[] = [];

  let projectedDebtFreeDate: string | null = null;

  if (orderedDebts.length === 0) {
    projectedDebtFreeDate = null;
  } else {
    const monthlyPool = totalMinimumPayments + extraPaymentAvailable;

    if (monthlyPool <= 0) {
      warnings.push("No monthly payment available, so debts will not reduce.");
    } else {
      // Mutable simulation state, in strategy order.
      const balances = orderedDebts.map((debt) => ({
        balance: debt.balance,
        minimumPayment: debt.minimumPayment,
        monthlyRate: (debt.apr ?? 0) / 100 / 12,
      }));

      let months = 0;
      let cleared = false;

      while (months < MAX_FORECAST_MONTHS) {
        months += 1;

        // 1. Accrue interest on open balances.
        for (const debt of balances) {
          if (debt.balance > 0) {
            debt.balance = debt.balance + debt.balance * debt.monthlyRate;
          }
        }

        // 2. Pay minimums on every open debt.
        let available = monthlyPool;
        for (const debt of balances) {
          if (debt.balance <= 0 || available <= 0) continue;
          const pay = Math.min(debt.minimumPayment, debt.balance, available);
          debt.balance -= pay;
          available -= pay;
        }

        // 3. Funnel anything left into debts in strategy order (roll-down).
        for (const debt of balances) {
          if (available <= 0) break;
          if (debt.balance <= 0) continue;
          const pay = Math.min(debt.balance, available);
          debt.balance -= pay;
          available -= pay;
        }

        if (balances.every((debt) => debt.balance <= 0.01)) {
          cleared = true;
          break;
        }
      }

      if (cleared) {
        const startDate = input.startDate ?? new Date().toISOString();
        projectedDebtFreeDate = addMonthsToIsoDate(startDate, months);
      } else {
        warnings.push(
          "Debts will not be repaid within the forecast window at the current payment level. Increase payments or reduce interest.",
        );
      }
    }
  }

  return {
    totalDebt,
    totalMinimumPayments,
    extraPaymentAvailable,
    selectedStrategy: input.strategy,
    nextDebtToAttack: orderedDebts[0] ?? null,
    projectedDebtFreeDate,
    orderedDebts,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// E. Bills-account funding
// ---------------------------------------------------------------------------

export type BillsAccountFundingInput = {
  billsAccountId: string | null;
  billsAccountBalance: number;
  billsDueBeforePayday: number;
};

export function calculateBillsAccountFunding(
  input: BillsAccountFundingInput,
): BillsAccountSummary {
  const billsAccountBalance = round2(input.billsAccountBalance);
  const billsDueBeforePayday = round2(clampToZero(input.billsDueBeforePayday));
  const expectedShortfall = round2(
    clampToZero(billsDueBeforePayday - billsAccountBalance),
  );
  const expectedSurplus = round2(
    clampToZero(billsAccountBalance - billsDueBeforePayday),
  );
  const isFullyFunded = expectedShortfall <= 0;
  const warnings: string[] = [];

  if (!input.billsAccountId) {
    warnings.push("No bills account configured; bills funding can't be tracked.");
  }

  if (expectedShortfall > 0) {
    warnings.push(
      `Bills account is underfunded by ${formatGbp(
        expectedShortfall,
      )} before payday.`,
    );
  }

  return {
    billsAccountId: input.billsAccountId,
    billsAccountBalance,
    billsDueBeforePayday,
    expectedShortfall,
    expectedSurplus,
    paydayTransferRequired: expectedShortfall,
    isFullyFunded,
    warnings,
  };
}

/**
 * Convenience wrapper that derives the bills-account summary from live domain
 * data using the existing finance helpers. Keeps real and mock data on one path.
 */
export function summariseBillsAccount(
  accounts: Account[],
  bills: Bill[],
  subscriptions: Subscription[],
  manualFinanceItems: ManualFinanceItem[],
  startDate: string,
  paydayDate: string,
): BillsAccountSummary {
  const billsAccount = accounts.find(
    (account) => account.isBillsAccount && account.status === "active",
  );

  return calculateBillsAccountFunding({
    billsAccountId: billsAccount?.id ?? null,
    billsAccountBalance: calculateBillsAccountBalance(accounts),
    billsDueBeforePayday: calculateBillsDueBeforePayday(
      bills,
      subscriptions,
      manualFinanceItems,
      startDate,
      paydayDate,
    ),
  });
}

// ---------------------------------------------------------------------------
// F. Savings phase detection
// ---------------------------------------------------------------------------

export type SavingsPhaseInput = {
  totalSavings: number;
  starterBufferTarget: number;
  isOverdraftFree: boolean;
  emergencyFundTarget: number;
  isDebtFree: boolean;
  oneMonthExpensesTarget: number;
};

const PHASE_LABELS: Record<SavingsPhase, string> = {
  starter_emergency_buffer: "starter emergency buffer",
  overdraft_free: "overdraft-free",
  emergency_fund: "emergency fund",
  debt_free: "debt-free",
  one_month_essential_expenses: "one month of essential expenses",
};

/**
 * Determine which of the five savings phases is active. Phases are completed in
 * order; the current phase is the first incomplete one. Monetary phases report
 * progress toward their target; the overdraft-free and debt-free gates report
 * 0% or 100%.
 */
export function determineSavingsPhase(
  input: SavingsPhaseInput,
): SavingsPhaseSummary {
  const totalSavings = clampToZero(input.totalSavings);

  const completion: Record<SavingsPhase, boolean> = {
    starter_emergency_buffer: totalSavings >= input.starterBufferTarget,
    overdraft_free: input.isOverdraftFree,
    emergency_fund: totalSavings >= input.emergencyFundTarget,
    debt_free: input.isDebtFree,
    one_month_essential_expenses: totalSavings >= input.oneMonthExpensesTarget,
  };

  const targetByPhase: Record<SavingsPhase, number> = {
    starter_emergency_buffer: input.starterBufferTarget,
    overdraft_free: 0,
    emergency_fund: input.emergencyFundTarget,
    debt_free: 0,
    one_month_essential_expenses: input.oneMonthExpensesTarget,
  };

  const currentIndex = PHASE_ORDER.findIndex((phase) => !completion[phase]);
  const resolvedIndex =
    currentIndex === -1 ? PHASE_ORDER.length - 1 : currentIndex;
  const currentPhase = PHASE_ORDER[resolvedIndex];
  const allComplete = currentIndex === -1;
  const nextPhase =
    !allComplete && resolvedIndex + 1 < PHASE_ORDER.length
      ? PHASE_ORDER[resolvedIndex + 1]
      : null;

  const target = targetByPhase[currentPhase];
  let progressPercentage: number;

  if (currentPhase === "overdraft_free") {
    progressPercentage = input.isOverdraftFree ? 100 : 0;
  } else if (currentPhase === "debt_free") {
    progressPercentage = input.isDebtFree ? 100 : 0;
  } else if (target <= 0) {
    progressPercentage = 100;
  } else {
    progressPercentage = round2(Math.min((totalSavings / target) * 100, 100));
  }

  let recommendedAction: string;

  if (allComplete) {
    recommendedAction =
      "All core savings phases complete. Build longer-term savings and investments.";
  } else if (currentPhase === "overdraft_free") {
    recommendedAction =
      "Focus spare money on clearing your overdraft before growing savings.";
  } else if (currentPhase === "debt_free") {
    recommendedAction =
      "Focus spare money on clearing remaining debts before growing savings further.";
  } else {
    recommendedAction = `Build your ${PHASE_LABELS[currentPhase]} toward ${formatGbp(
      target,
    )}.`;
  }

  return {
    currentPhase,
    nextPhase,
    currentSavings: round2(totalSavings),
    targetAmount: round2(target),
    progressPercentage,
    recommendedAction,
  };
}

// ---------------------------------------------------------------------------
// G. Next best action
// ---------------------------------------------------------------------------

export type NextBestActionInput = {
  billsAccount: BillsAccountSummary;
  overdraft: OverdraftProjection | null;
  /** Minimum debt payments falling due before the next payday. */
  debtPaymentsDueBeforePayday: number;
  nextDebtDue?: {
    id: string;
    name: string;
    amount: number;
  } | null;
  safeToSpend: number;
  lowSafeToSpendThreshold: number;
  /** Spare cash that could go toward reducing the overdraft. */
  overdraftReductionOpportunity?: number;
  /** Spare cash that could overpay debt. */
  debtOverpaymentOpportunity?: number;
  nextDebtToAttack?: { id: string; name: string } | null;
  /** Gap remaining to the starter/emergency buffer. */
  emergencyBufferGap?: number;
  savingsGoalContribution?: {
    goalId: string;
    name: string;
    amount: number;
  } | null;
};

function action(
  type: NextBestActionType,
  priority: number,
  title: string,
  description: string,
  reason: string,
  amount: number | null,
  relatedEntityId: string | null,
): NextBestAction {
  return {
    type,
    title,
    description,
    amount: amount === null ? null : round2(amount),
    priority,
    reason,
    relatedEntityId,
  };
}

/**
 * Pick the single most important action right now, by fixed priority:
 * 1. bills shortfall, 2. immediate overdraft risk, 3. debt payment due,
 * 4. low safe-to-spend, 5. overdraft reduction, 6. debt overpayment,
 * 7. emergency buffer, 8. savings goal. Falls back to "all clear".
 */
export function determineNextBestAction(
  input: NextBestActionInput,
): NextBestAction {
  const bills = input.billsAccount;

  if (bills.expectedShortfall > 0) {
    return action(
      "fund_bills_account",
      1,
      "Top up your bills account",
      `Transfer ${formatGbp(
        bills.paydayTransferRequired,
      )} to your bills account so upcoming bills clear.`,
      "Bills due before payday exceed the bills-account balance.",
      bills.paydayTransferRequired,
      bills.billsAccountId,
    );
  }

  if (input.overdraft && input.overdraft.riskBeforePayday === "high") {
    return action(
      "address_overdraft_risk",
      2,
      "Act on overdraft risk",
      input.overdraft.recommendedPaydayAction,
      "The account is projected to approach or breach the overdraft limit before payday.",
      input.overdraft.targetReductionPerPayday,
      input.overdraft.linkedAccountId,
    );
  }

  if (
    input.debtPaymentsDueBeforePayday > 0 &&
    (input.nextDebtDue ?? null) !== null
  ) {
    const due = input.nextDebtDue as { id: string; name: string; amount: number };
    return action(
      "pay_debt_due",
      3,
      "Make a debt payment due soon",
      `Pay ${formatGbp(due.amount)} to ${due.name} to stay on track and avoid fees.`,
      "A minimum debt payment falls due before the next payday.",
      due.amount,
      due.id,
    );
  }

  if (input.safeToSpend < input.lowSafeToSpendThreshold) {
    return action(
      "raise_safe_to_spend",
      4,
      "Protect your safe-to-spend",
      "Safe-to-spend is low. Pause non-essential spending until after payday.",
      "Safe-to-spend is below your comfort threshold before payday.",
      input.safeToSpend,
      null,
    );
  }

  const reductionOpportunity = clampToZero(input.overdraftReductionOpportunity ?? 0);
  if (
    input.overdraft &&
    !input.overdraft.isOverdraftFree &&
    reductionOpportunity > 0
  ) {
    return action(
      "reduce_overdraft",
      5,
      "Reduce your overdraft",
      `Put ${formatGbp(reductionOpportunity)} toward reducing your overdraft.`,
      "You have spare cash and an active overdraft to clear.",
      reductionOpportunity,
      input.overdraft.linkedAccountId,
    );
  }

  const overpaymentOpportunity = clampToZero(input.debtOverpaymentOpportunity ?? 0);
  if (overpaymentOpportunity > 0 && (input.nextDebtToAttack ?? null) !== null) {
    const target = input.nextDebtToAttack as { id: string; name: string };
    return action(
      "overpay_debt",
      6,
      "Overpay your priority debt",
      `Overpay ${formatGbp(overpaymentOpportunity)} toward ${target.name}.`,
      "Bills and overdraft are under control, so extra cash clears debt faster.",
      overpaymentOpportunity,
      target.id,
    );
  }

  const emergencyBufferGap = clampToZero(input.emergencyBufferGap ?? 0);
  if (emergencyBufferGap > 0) {
    return action(
      "contribute_emergency_buffer",
      7,
      "Build your emergency buffer",
      `Add ${formatGbp(emergencyBufferGap)} to your emergency buffer.`,
      "Your starter emergency buffer is not yet fully funded.",
      emergencyBufferGap,
      null,
    );
  }

  if ((input.savingsGoalContribution ?? null) !== null) {
    const goal = input.savingsGoalContribution as {
      goalId: string;
      name: string;
      amount: number;
    };
    return action(
      "contribute_savings_goal",
      8,
      "Fund your savings goal",
      `Contribute ${formatGbp(goal.amount)} toward ${goal.name}.`,
      "Bills, overdraft and debts are under control, so you can grow savings.",
      goal.amount,
      goal.goalId,
    );
  }

  return action(
    "all_clear",
    9,
    "You're on track",
    "Bills are funded, the overdraft is under control and savings are progressing.",
    "No urgent action is needed right now.",
    null,
    null,
  );
}
