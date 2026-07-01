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
import {
  budgetOverrideChangesForAction,
  createTransactionBudgetOverride,
  type TransactionBudgetOverrideChanges,
  type TransactionQuickAction,
} from "@/lib/finance-interpretation";
import { planCreditCardRecategorisation } from "@/lib/transactions/recategorise";
import { upsertTransaction } from "@/lib/repositories/finance-repository";
import { updateTransactionEnrichmentReview } from "@/lib/transaction-intelligence";

/**
 * Shared writer: applies a deterministic change-set to a transaction's budget
 * override for the signed-in user. The repository scopes writes to users/{uid},
 * so a user can never touch another user's overrides.
 */
async function applyBudgetOverrideChanges(
  transactionId: string,
  changes: TransactionBudgetOverrideChanges,
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

  await upsertTransactionBudgetOverride(
    createTransactionBudgetOverride({
      userId: profile.id,
      transaction,
      account,
      existing,
      changes,
    }),
  );
  revalidatePath("/transactions");
  revalidatePath("/");
}

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
  action: TransactionQuickAction,
) {
  await applyBudgetOverrideChanges(transactionId, budgetOverrideChangesForAction(action));
}

/** Inline row quick action (FormData variant for use inside the table). */
export async function applyTransactionQuickActionForm(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const action = String(formData.get("action") ?? "") as TransactionQuickAction;
  if (!transactionId || !action) {
    return;
  }
  await applyBudgetOverrideChanges(transactionId, budgetOverrideChangesForAction(action));
}

/** Inline toggle of a single budget-inclusion flag from the table row. */
export async function setTransactionBudgetInclusionAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = formData.get("value") === "true";
  const allowed: Record<string, keyof TransactionBudgetOverrideChanges> = {
    weekly: "includeInWeeklyBudget",
    monthly: "includeInMonthlyBudget",
    summaries: "includeInSpendingSummaries",
    safe_to_spend: "includeInSafeToSpendImpact",
  };
  const key = allowed[field];
  if (!transactionId || !key) {
    return;
  }
  await applyBudgetOverrideChanges(transactionId, { [key]: value, reviewed: true });
}

/** Inline mark-reviewed from the table row (persists on the override, not the raw txn). */
export async function markTransactionReviewedAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    return;
  }
  await applyBudgetOverrideChanges(transactionId, { reviewed: true });
}

/** Inline category change from the table row. */
export async function setTransactionCategoryAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const budgetCategory = optionalString(formData.get("budgetCategory"));
  if (!transactionId || !budgetCategory) {
    return;
  }
  await applyBudgetOverrideChanges(transactionId, { budgetCategory, reviewed: true });
}

/**
 * Fix already-stored credit-card transactions that were saved as cat_income
 * before card sign/category awareness existed. Re-sync will not fix them because
 * mergeSyncedTransaction preserves the existing category. Deterministic + safe:
 * only touches credit-card cat_income rows.
 */
export async function recategoriseCreditCardTransactionsAction() {
  const [transactions, accounts] = await Promise.all([getTransactions(), getAccounts()]);
  const corrected = planCreditCardRecategorisation(transactions, accounts);

  for (const transaction of corrected) {
    await upsertTransaction(transaction);
  }

  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function bulkTransactionBudgetOverrideAction(formData: FormData) {
  const ids = formData.getAll("transactionIds").map(String).filter(Boolean);
  const bulkAction = String(formData.get("bulkAction") ?? "") as TransactionQuickAction;

  if (ids.length === 0 || bulkAction.length === 0) {
    return;
  }

  const changes = budgetOverrideChangesForAction(bulkAction);
  // Sequential to keep read-modify-write of the shared override set consistent.
  for (const id of ids) {
    await applyBudgetOverrideChanges(id, changes);
  }
  revalidatePath("/transactions");
  revalidatePath("/");
}
