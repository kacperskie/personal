import type {
  OverdraftPlan,
  OverdraftPlanStatus,
  OverdraftRiskLevel,
  PaydayPlan,
} from "@/lib/domain";

/**
 * Firestore mappers for the v2 finance-engine documents (payday plans and
 * overdraft plans). Firestore stores the domain shape directly, so these
 * normalise loosely-typed `DocumentData` reads into well-formed domain objects
 * with safe defaults, and clamp values on write. No real financial data lives
 * here — these only enforce shape and sane bounds.
 */

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" ? (value as RawRecord) : {};
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback = 0): number {
  const parsed = num(value, fallback);
  return parsed > 0 ? parsed : 0;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const OVERDRAFT_RISK_LEVELS: OverdraftRiskLevel[] = ["none", "low", "medium", "high"];
const OVERDRAFT_STATUSES: OverdraftPlanStatus[] = [
  "active",
  "overdraft_free",
  "paused",
  "archived",
];

// --- Payday plan -----------------------------------------------------------

export function normalisePaydayPlan(
  raw: unknown,
  defaults: { id: string; userId: string; paydayDate: string; now: string },
): PaydayPlan {
  const record = asRecord(raw);

  return {
    id: str(record.id, defaults.id),
    userId: str(record.userId, defaults.userId),
    monthlyIncome: nonNegative(record.monthlyIncome),
    paydayDate: str(record.paydayDate, defaults.paydayDate),
    preferredBuffer: nonNegative(record.preferredBuffer),
    billsAccountTarget: nonNegative(record.billsAccountTarget),
    minimumDebtPaymentsTarget: nonNegative(record.minimumDebtPaymentsTarget),
    overdraftReductionTarget: nonNegative(record.overdraftReductionTarget),
    essentialSpendingTarget: nonNegative(record.essentialSpendingTarget),
    emergencyBufferTarget: nonNegative(record.emergencyBufferTarget),
    savingsTarget: nonNegative(record.savingsTarget),
    flexibleSpendingTarget: nonNegative(record.flexibleSpendingTarget),
    createdAt: str(record.createdAt, defaults.now),
    updatedAt: str(record.updatedAt, defaults.now),
  };
}

export function paydayPlanToFirestore(plan: PaydayPlan): PaydayPlan {
  return {
    ...plan,
    monthlyIncome: nonNegative(plan.monthlyIncome),
    preferredBuffer: nonNegative(plan.preferredBuffer),
    billsAccountTarget: nonNegative(plan.billsAccountTarget),
    minimumDebtPaymentsTarget: nonNegative(plan.minimumDebtPaymentsTarget),
    overdraftReductionTarget: nonNegative(plan.overdraftReductionTarget),
    essentialSpendingTarget: nonNegative(plan.essentialSpendingTarget),
    emergencyBufferTarget: nonNegative(plan.emergencyBufferTarget),
    savingsTarget: nonNegative(plan.savingsTarget),
    flexibleSpendingTarget: nonNegative(plan.flexibleSpendingTarget),
  };
}

// --- Overdraft plan --------------------------------------------------------

function overdraftRisk(value: unknown): OverdraftRiskLevel {
  return OVERDRAFT_RISK_LEVELS.includes(value as OverdraftRiskLevel)
    ? (value as OverdraftRiskLevel)
    : "none";
}

function overdraftStatus(value: unknown): OverdraftPlanStatus {
  return OVERDRAFT_STATUSES.includes(value as OverdraftPlanStatus)
    ? (value as OverdraftPlanStatus)
    : "active";
}

export function normaliseOverdraftPlan(
  raw: unknown,
  defaults: { id: string; userId: string; linkedAccountId: string; now: string },
): OverdraftPlan {
  const record = asRecord(raw);

  return {
    id: str(record.id, defaults.id),
    userId: str(record.userId, defaults.userId),
    linkedAccountId: str(record.linkedAccountId, defaults.linkedAccountId),
    overdraftLimit: nonNegative(record.overdraftLimit),
    currentOverdraftUsed: nonNegative(record.currentOverdraftUsed),
    targetReductionPerPayday: nonNegative(record.targetReductionPerPayday),
    feesOrInterest: nullableNumber(record.feesOrInterest),
    targetOverdraftFreeDate: nullableString(record.targetOverdraftFreeDate),
    projectedOverdraftFreeDate: nullableString(record.projectedOverdraftFreeDate),
    riskBeforePayday: overdraftRisk(record.riskBeforePayday),
    recommendedPaydayAction: str(record.recommendedPaydayAction),
    status: overdraftStatus(record.status),
    createdAt: str(record.createdAt, defaults.now),
    updatedAt: str(record.updatedAt, defaults.now),
  };
}

export function overdraftPlanToFirestore(plan: OverdraftPlan): OverdraftPlan {
  return {
    ...plan,
    overdraftLimit: nonNegative(plan.overdraftLimit),
    currentOverdraftUsed: nonNegative(plan.currentOverdraftUsed),
    targetReductionPerPayday: nonNegative(plan.targetReductionPerPayday),
    feesOrInterest: nullableNumber(plan.feesOrInterest),
    riskBeforePayday: overdraftRisk(plan.riskBeforePayday),
    status: overdraftStatus(plan.status),
  };
}
