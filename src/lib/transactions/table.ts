import type { Transaction } from "@/lib/domain";

/**
 * Pure, deterministic helpers for the Transactions table: sorting, filtering, and
 * direction/spend display. No secrets, no account numbers, no raw payloads — only
 * fields already present on the derived Transaction plus resolved display names.
 */

export type TransactionRow = Transaction & {
  accountName: string;
  institutionName: string;
  categoryName: string;
  isCreditCard: boolean;
};

export type SortColumn =
  | "date"
  | "account"
  | "institution"
  | "merchant"
  | "category"
  | "amount"
  | "providerStatus"
  | "reviewStatus";

export type SortDirection = "asc" | "desc";

export type ProviderStatusFilter = "all" | "posted" | "pending";
export type ReviewStatusFilter = "all" | "needs_review" | "reviewed";

export type TransactionFilters = {
  search: string;
  accountId: string;
  institution: string;
  month: string;
  categoryId: string;
  providerStatus: ProviderStatusFilter;
  reviewStatus: ReviewStatusFilter;
};

export function isPending(transaction: Pick<Transaction, "pending" | "providerStatus">) {
  return Boolean(transaction.pending) || transaction.providerStatus === "pending";
}

export function monthValue(date: string) {
  return date.slice(0, 7);
}

/**
 * Direction/spend display. Credit-card purchases (positive amount on a card) are
 * shown as spend/outflow — never as income — matching how they hit budgets.
 */
export function transactionDirectionDisplay(
  transaction: Pick<Transaction, "amount" | "kind" | "flags"> & { isCreditCard: boolean },
): { direction: "inflow" | "outflow" | "neutral"; label: string; tone: "good" | "risk" | "neutral" } {
  const isTransfer =
    transaction.kind === "transfer" || transaction.flags.includes("own_account_transfer");

  if (isTransfer) {
    return { direction: "neutral", label: "transfer", tone: "neutral" };
  }

  if (transaction.isCreditCard) {
    // On a card, a positive amount is a purchase (spend); non-positive is a
    // refund/credit or repayment that reduces the liability.
    return transaction.amount > 0
      ? { direction: "outflow", label: "spend", tone: "risk" }
      : { direction: "inflow", label: "refund/credit", tone: "good" };
  }

  if (transaction.kind === "income" || transaction.amount > 0) {
    return { direction: "inflow", label: "in", tone: "good" };
  }

  return { direction: "outflow", label: "spend", tone: "risk" };
}

export function filterTransactionRows(rows: TransactionRow[], filters: TransactionFilters) {
  const search = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (search) {
      const haystack = `${row.merchant} ${row.description}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (filters.accountId !== "all" && row.accountId !== filters.accountId) return false;
    if (filters.institution !== "all" && row.institutionName !== filters.institution) return false;
    if (filters.month !== "all" && monthValue(row.date) !== filters.month) return false;
    if (filters.categoryId !== "all" && row.categoryId !== filters.categoryId) return false;
    if (filters.providerStatus === "posted" && isPending(row)) return false;
    if (filters.providerStatus === "pending" && !isPending(row)) return false;
    if (filters.reviewStatus === "needs_review" && row.status !== "needs_review") return false;
    if (
      filters.reviewStatus === "reviewed" &&
      row.status !== "reviewed" &&
      row.status !== "excluded"
    ) {
      return false;
    }
    return true;
  });
}

function compareByColumn(a: TransactionRow, b: TransactionRow, column: SortColumn): number {
  switch (column) {
    case "date":
      return a.date.localeCompare(b.date);
    case "account":
      return a.accountName.localeCompare(b.accountName);
    case "institution":
      return a.institutionName.localeCompare(b.institutionName);
    case "merchant":
      return (a.merchant || a.description).localeCompare(b.merchant || b.description);
    case "category":
      return a.categoryName.localeCompare(b.categoryName);
    case "amount":
      // Numeric amount, never the formatted string.
      return a.amount - b.amount;
    case "providerStatus":
      return String(a.providerStatus ?? "").localeCompare(String(b.providerStatus ?? ""));
    case "reviewStatus":
      return a.status.localeCompare(b.status);
    default:
      return 0;
  }
}

/**
 * Stable sort by a column + direction. Ties break by id so ordering is
 * deterministic and stable across renders.
 */
export function sortTransactionRows(
  rows: TransactionRow[],
  column: SortColumn,
  direction: SortDirection,
): TransactionRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = compareByColumn(a, b, column);
    if (primary !== 0) {
      return primary * factor;
    }
    return a.id.localeCompare(b.id) * factor;
  });
}
