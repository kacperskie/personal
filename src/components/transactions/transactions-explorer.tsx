"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/status-pill";
import type { Account, Category, CategoryKind, Transaction } from "@/lib/domain";
import { formatCurrency, formatDateShort } from "@/lib/format";

type TransactionKindFilter = "all" | "spending" | "income" | "transfers";

type TransactionView = Transaction & {
  accountName: string;
  institutionName: string;
  categoryName: string;
};

function monthValue(date: string) {
  return date.slice(0, 7);
}

function statusLabel(transaction: TransactionView) {
  if (transaction.providerStatus === "deleted") {
    return "Provider deleted";
  }

  if (transaction.providerStatus === "restored") {
    return "Restored";
  }

  if (transaction.pending) {
    return "Pending";
  }

  if (transaction.flags.includes("own_account_transfer")) {
    return "Transfer";
  }

  if (transaction.status === "reviewed") {
    return "Reviewed";
  }

  if (transaction.status === "excluded") {
    return "Excluded";
  }

  return "Needs review";
}

function statusTone(transaction: TransactionView): "good" | "neutral" | "warning" | "risk" {
  if (transaction.providerStatus === "deleted") {
    return "neutral";
  }

  if (transaction.providerStatus === "restored") {
    return "warning";
  }

  if (transaction.pending) {
    return "neutral";
  }

  if (transaction.flags.includes("own_account_transfer") || transaction.status === "excluded") {
    return "neutral";
  }

  if (transaction.status === "reviewed") {
    return "good";
  }

  return "warning";
}

function matchesKind(transaction: TransactionView, kind: TransactionKindFilter) {
  if (kind === "all") {
    return true;
  }

  if (kind === "spending") {
    return transaction.kind === "expense" && !transaction.flags.includes("own_account_transfer");
  }

  if (kind === "income") {
    return transaction.kind === "income";
  }

  return transaction.kind === "transfer" || transaction.flags.includes("own_account_transfer");
}

export function TransactionsExplorer({
  transactions,
  accounts,
  categories,
  emptyMessage = "No transactions match these filters.",
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  emptyMessage?: string;
}) {
  const [accountId, setAccountId] = useState("all");
  const [institution, setInstitution] = useState("all");
  const [month, setMonth] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const views = useMemo<TransactionView[]>(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    return transactions.map((transaction) => {
      const account = accountById.get(transaction.accountId);
      const category = categoryById.get(transaction.categoryId);

      return {
        ...transaction,
        accountName: account?.name ?? "Unknown account",
        institutionName: account?.institutionName ?? "Unknown institution",
        categoryName: category?.name ?? transaction.categoryId,
      };
    });
  }, [accounts, categories, transactions]);
  const months = Array.from(new Set(views.map((transaction) => monthValue(transaction.date)))).sort(
    (a, b) => b.localeCompare(a),
  );
  const institutions = Array.from(new Set(accounts.map((account) => account.institutionName))).sort();
  const filtered = views.filter((transaction) => {
    return (
      (accountId === "all" || transaction.accountId === accountId) &&
      (institution === "all" || transaction.institutionName === institution) &&
      (month === "all" || monthValue(transaction.date) === month) &&
      (categoryId === "all" || transaction.categoryId === categoryId) &&
      matchesKind(transaction, kind)
    );
  });
  const kindOptions: Array<{ value: TransactionKindFilter; label: string }> = [
    { value: "all", label: "All activity" },
    { value: "spending", label: "Spending" },
    { value: "income", label: "Income" },
    { value: "transfers", label: "Transfers" },
  ];
  const categoryKindOrder: CategoryKind[] = ["expense", "income", "transfer"];
  const sortedCategories = [...categories].sort((a, b) => {
    const kindDelta = categoryKindOrder.indexOf(a.kind) - categoryKindOrder.indexOf(b.kind);

    return kindDelta === 0 ? a.name.localeCompare(b.name) : kindDelta;
  });

  return (
    <section className="rounded-lg border border-line bg-white shadow-panel">
      <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2 xl:grid-cols-5">
        <select
          aria-label="Filter by account"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        >
          <option value="all">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by institution"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        >
          <option value="all">All institutions</option>
          {institutions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        >
          <option value="all">All months</option>
          {months.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        >
          <option value="all">All categories</option>
          {sortedCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by activity type"
          value={kind}
          onChange={(event) => setKind(event.target.value as TransactionKindFilter)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        >
          {kindOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 p-4 md:hidden">
        {filtered.map((transaction) => (
          <article key={transaction.id} className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-ink/50">{formatDateShort(transaction.date)}</p>
                <h3 className="mt-1 font-semibold text-ink">{transaction.merchant}</h3>
                <p className="mt-1 text-sm text-ink/60">{transaction.description}</p>
              </div>
              <p className="shrink-0 font-semibold text-ink">
                {formatCurrency(transaction.amount)}
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink/50">Account</dt>
                <dd className="font-semibold text-ink">{transaction.accountName}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Institution</dt>
                <dd className="font-semibold text-ink">{transaction.institutionName}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Category</dt>
                <dd className="font-semibold text-ink">{transaction.categoryName}</dd>
              </div>
              <div>
                <dt className="text-ink/50">Provider status</dt>
                <dd>
                  <StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} />
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Provider status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((transaction) => (
              <tr key={transaction.id} className="bg-white">
                <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                  {formatDateShort(transaction.date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                  {transaction.accountName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                  {transaction.institutionName}
                </td>
                <td className="min-w-56 px-4 py-3">
                  <p className="font-semibold text-ink">{transaction.merchant}</p>
                  <p className="text-xs text-ink/50">{transaction.description}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                  {transaction.categoryName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                  {formatCurrency(transaction.amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <div className="border-t border-line p-6 text-sm text-ink/60">
          {emptyMessage}
        </div>
      ) : null}
    </section>
  );
}
