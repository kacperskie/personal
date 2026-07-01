import type { Transaction } from "@/lib/domain";

/**
 * Pure, deterministic helpers for pending (card) transactions: settlement
 * matching against posted transactions (so pending + posted are never double
 * counted) and pending-preview totals. No secrets or raw payloads.
 */

export type PendingPreferences = {
  includePendingInSafeToSpendPreview: boolean;
  includePendingInBudgetActuals: boolean;
};

export const defaultPendingPreferences: PendingPreferences = {
  includePendingInSafeToSpendPreview: true,
  includePendingInBudgetActuals: false,
};

export function isPendingTransaction(
  transaction: Pick<Transaction, "pending" | "providerStatus">,
): boolean {
  return Boolean(transaction.pending) || transaction.providerStatus === "pending";
}

function normaliseMerchant(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dayDiff(a: string, b: string) {
  const ta = new Date(`${a.slice(0, 10)}T00:00:00.000Z`).getTime();
  const tb = new Date(`${b.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.abs(ta - tb) / (24 * 60 * 60 * 1000);
}

/**
 * Match each pending transaction to a posted transaction that likely settled it.
 * Matches on same account, provider id (if present on both), amount within £0.01,
 * merchant text, and date proximity (<= 5 days, since final amount/date can
 * shift). Returns a map of pendingId -> postedId.
 */
export function matchPendingToPosted(
  pending: Transaction[],
  posted: Transaction[],
): Map<string, string> {
  const matches = new Map<string, string>();
  const usedPosted = new Set<string>();

  for (const pendingTx of pending) {
    const match = posted.find((postedTx) => {
      if (usedPosted.has(postedTx.id)) return false;
      if (postedTx.accountId !== pendingTx.accountId) return false;

      // A shared provider transaction id is a definitive match.
      if (
        pendingTx.providerTransactionId &&
        postedTx.providerTransactionId &&
        pendingTx.providerTransactionId === postedTx.providerTransactionId
      ) {
        return true;
      }

      const amountClose = Math.abs(Math.abs(postedTx.amount) - Math.abs(pendingTx.amount)) <= 0.01;
      const merchantClose =
        normaliseMerchant(postedTx.merchant || postedTx.description) ===
        normaliseMerchant(pendingTx.merchant || pendingTx.description);
      const dateClose = dayDiff(postedTx.date, pendingTx.date) <= 5;
      return amountClose && merchantClose && dateClose;
    });

    if (match) {
      matches.set(pendingTx.id, match.id);
      usedPosted.add(match.id);
    }
  }

  return matches;
}

/**
 * Split a transaction set into posted, unsettled-pending (still pending and not
 * yet matched to a posted transaction), and settled-pending (matched, hidden to
 * avoid double counting).
 */
export function partitionPendingSettlement(transactions: Transaction[]): {
  posted: Transaction[];
  pendingUnsettled: Transaction[];
  pendingSettled: Transaction[];
  matchedPostedIdByPendingId: Map<string, string>;
} {
  const posted = transactions.filter((t) => !isPendingTransaction(t));
  const pending = transactions.filter(isPendingTransaction);
  const matches = matchPendingToPosted(pending, posted);

  const pendingUnsettled = pending.filter((t) => !matches.has(t.id));
  const pendingSettled = pending.filter((t) => matches.has(t.id));

  return { posted, pendingUnsettled, pendingSettled, matchedPostedIdByPendingId: matches };
}

/**
 * Pending preview total (absolute spend) for unsettled pending transactions on
 * the given accounts. Used to reduce the safe-to-spend preview without touching
 * confirmed budget actuals.
 */
export function pendingPreviewSpend(
  transactions: Transaction[],
  accountIds?: Set<string>,
): number {
  const { pendingUnsettled } = partitionPendingSettlement(transactions);
  return pendingUnsettled
    .filter((t) => !accountIds || accountIds.has(t.accountId))
    .filter((t) => t.amount !== 0)
    .reduce((total, t) => total + Math.abs(t.amount), 0);
}
