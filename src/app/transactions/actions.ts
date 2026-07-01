"use server";

import { revalidatePath } from "next/cache";
import {
  getAccounts,
  getTransactionBudgetOverrides,
  getTransactionEnrichments,
  getTransactions,
  getUserProfile,
  upsertTransactionBudgetOverride,
  upsertTransactionEnrichment,
} from "@/lib/repositories/finance-repository";
import type { FinanceCategory, TransactionBudgetExclusionReason } from "@/lib/domain";
import { createTransactionBudgetOverride } from "@/lib/finance-interpretation";
import { updateTransactionEnrichmentReview } from "@/lib/transaction-intelligence";

async function findEnrichment(id: string) {
  return (await getTransactionEnrichments()).find((enrichment) => enrichment.id === id) ?? null;
}

export async function updateTransactionEnrichmentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const category = String(formData.get("category") ?? "other") as FinanceCategory;
  const normalisedMerchantName = String(formData.get("merchant") ?? "").trim();
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      category,
      normalisedMerchantName: normalisedMerchantName || enrichment.normalisedMerchantName,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function markTransactionTransferAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      internalTransfer: true,
      excludedFromSpending: true,
      category: "transfers",
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function markTransactionNotTransferAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      internalTransfer: false,
      excludedFromSpending: false,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function excludeTransactionFromSpendingAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      excludedFromSpending: true,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

function checkboxValue(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function updateTransactionBudgetOverrideAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const [profile, transactions, accounts, overrides] = await Promise.all([
    getUserProfile(),
    getTransactions(),
    getAccounts(),
    getTransactionBudgetOverrides(),
  ]);
  const transaction = transactions.find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    return;
  }

  const account = accounts.find((candidate) => candidate.id === transaction.accountId) ?? null;
  const existing = overrides.find((candidate) => candidate.transactionId === transaction.id) ?? null;
  const override = createTransactionBudgetOverride({
    userId: profile.id,
    transaction,
    account,
    existing,
    changes: {
      includeInWeeklyBudget: checkboxValue(formData.get("includeInWeeklyBudget")),
      includeInMonthlyBudget: checkboxValue(formData.get("includeInMonthlyBudget")),
      includeInSpendingSummaries: checkboxValue(formData.get("includeInSpendingSummaries")),
      includeInSafeToSpendImpact: checkboxValue(formData.get("includeInSafeToSpendImpact")),
      includeInCreditCardBalanceEstimate: checkboxValue(
        formData.get("includeInCreditCardBalanceEstimate"),
      ),
      budgetCategory: optionalString(formData.get("budgetCategory")),
      exclusionReason: optionalString(
        formData.get("exclusionReason"),
      ) as TransactionBudgetExclusionReason | null,
      userNote: optionalString(formData.get("userNote")),
    },
  });

  await upsertTransactionBudgetOverride(override);
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function quickTransactionBudgetOverrideAction(
  transactionId: string,
  action:
    | "include"
    | "exclude_weekly"
    | "exclude_monthly"
    | "exclude_both"
    | "internal_transfer"
    | "amex_payment"
    | "amex_pocket_transfer"
    | "bill"
    | "savings_transfer"
    | "ignored",
) {
  const [profile, transactions, accounts, overrides] = await Promise.all([
    getUserProfile(),
    getTransactions(),
    getAccounts(),
    getTransactionBudgetOverrides(),
  ]);
  const transaction = transactions.find((candidate) => candidate.id === transactionId);

  if (!transaction) {
    return;
  }

  const account = accounts.find((candidate) => candidate.id === transaction.accountId) ?? null;
  const existing = overrides.find((candidate) => candidate.transactionId === transaction.id) ?? null;
  const changesByAction = {
    include: {
      includeInWeeklyBudget: true,
      includeInMonthlyBudget: true,
      includeInSpendingSummaries: true,
      includeInSafeToSpendImpact: true,
      includeInCreditCardBalanceEstimate: true,
      exclusionReason: null,
    },
    exclude_weekly: { includeInWeeklyBudget: false },
    exclude_monthly: { includeInMonthlyBudget: false },
    exclude_both: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "ignored" as const,
    },
    internal_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "internal_transfer" as const,
    },
    amex_payment: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      includeInCreditCardBalanceEstimate: true,
      exclusionReason: "credit_card_payment" as const,
    },
    amex_pocket_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "amex_pocket_transfer" as const,
    },
    bill: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: true,
      includeInSpendingSummaries: true,
      includeInSafeToSpendImpact: true,
      exclusionReason: "bill" as const,
    },
    savings_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "savings_transfer" as const,
    },
    ignored: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "ignored" as const,
    },
  }[action];

  await upsertTransactionBudgetOverride(
    createTransactionBudgetOverride({
      userId: profile.id,
      transaction,
      account,
      existing,
      changes: changesByAction,
    }),
  );
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function bulkTransactionBudgetOverrideAction(formData: FormData) {
  const ids = formData.getAll("transactionIds").map(String).filter(Boolean);
  const bulkAction = String(formData.get("bulkAction") ?? "");

  if (ids.length === 0 || bulkAction.length === 0) {
    return;
  }

  await Promise.all(
    ids.map((id) =>
      quickTransactionBudgetOverrideAction(
        id,
        bulkAction as Parameters<typeof quickTransactionBudgetOverrideAction>[1],
      ),
    ),
  );
  revalidatePath("/transactions");
  revalidatePath("/");
}
