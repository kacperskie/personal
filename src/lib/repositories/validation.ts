import type { Account, ManualFinanceItem } from "@/lib/domain";

export type AccountUpdatePayload = Pick<
  Account,
  | "id"
  | "purpose"
  | "includeInSafeToSpend"
  | "includeInCashflow"
  | "includeInNetWorth"
  | "linkedGoalIds"
  | "reservedFor"
  | "linkedLiabilityAccountId"
  | "overdraftLimit"
  | "overdraftRepaymentTarget"
>;

export function createAccountUpdatePayload(input: AccountUpdatePayload) {
  return {
    id: input.id,
    purpose: input.purpose,
    includeInSafeToSpend: input.includeInSafeToSpend,
    includeInCashflow: input.includeInCashflow,
    includeInNetWorth: input.includeInNetWorth,
    linkedGoalIds: input.linkedGoalIds,
    reservedFor: input.reservedFor ?? null,
    linkedLiabilityAccountId: input.linkedLiabilityAccountId ?? null,
    overdraftLimit:
      input.overdraftLimit === null || input.overdraftLimit === undefined
        ? null
        : Math.max(Number(input.overdraftLimit), 0),
    overdraftRepaymentTarget:
      input.overdraftRepaymentTarget === null || input.overdraftRepaymentTarget === undefined
        ? null
        : Math.max(Number(input.overdraftRepaymentTarget), 0),
  };
}

export type ManualFinanceItemInput = Omit<ManualFinanceItem, "createdAt" | "updatedAt">;

export function validateManualFinanceItemInput(input: ManualFinanceItemInput) {
  if (!input.name.trim()) {
    throw new Error("Manual finance item name is required.");
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Manual finance item amount must be a positive number.");
  }

  if (!input.currency) {
    throw new Error("Manual finance item currency is required.");
  }

  return input;
}
