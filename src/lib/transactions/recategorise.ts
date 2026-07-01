import type { Account, Transaction } from "@/lib/domain";
import { deterministicProviderCategory } from "@/lib/bank-providers/provider-mappers";
import { isCreditCardAccount } from "@/lib/finance-interpretation";

/**
 * One-off correction for transactions stored before credit-card sign/category
 * awareness existed: credit-card purchases were saved as `cat_income` because a
 * positive amount was read as income. `mergeSyncedTransaction` preserves the
 * existing (wrong) category on re-sync, so those rows never self-heal.
 *
 * Conservative by design: only acts on credit-card-account transactions whose
 * stored category is exactly `cat_income`, recomputes the category with card
 * context, and corrects the kind. Returns the corrected transaction, or null when
 * nothing should change (never mutates the input).
 */
export function recategoriseCreditCardIncome(
  transaction: Transaction,
  account: Account | null | undefined,
): Transaction | null {
  if (!isCreditCardAccount(account) || transaction.categoryId !== "cat_income") {
    return null;
  }

  const recomputedCategory = deterministicProviderCategory(
    {
      id: transaction.id,
      providerConnectionId: transaction.providerConnectionId ?? "",
      providerAccountId: transaction.accountId,
      providerTransactionId: transaction.providerTransactionId ?? transaction.id,
      date: transaction.date,
      providerUpdatedAt: transaction.providerUpdatedAt ?? null,
      merchant: transaction.merchant,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      pending: Boolean(transaction.pending),
      category: null,
      isOwnAccountTransfer: transaction.flags.includes("own_account_transfer"),
    },
    { isCreditCard: true },
  );

  const correctedKind: Transaction["kind"] = transaction.flags.includes("own_account_transfer")
    ? "transfer"
    : transaction.amount > 0
      ? "expense"
      : "transfer";

  if (recomputedCategory === transaction.categoryId && correctedKind === transaction.kind) {
    return null;
  }

  return {
    ...transaction,
    categoryId: recomputedCategory,
    kind: correctedKind,
    updatedAt: new Date().toISOString(),
  };
}

export function planCreditCardRecategorisation(
  transactions: Transaction[],
  accounts: Account[],
): Transaction[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const corrected: Transaction[] = [];
  for (const transaction of transactions) {
    const fixed = recategoriseCreditCardIncome(transaction, accountById.get(transaction.accountId));
    if (fixed) {
      corrected.push(fixed);
    }
  }
  return corrected;
}
