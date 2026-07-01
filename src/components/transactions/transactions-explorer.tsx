"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { Account, Category, CategoryKind, Transaction } from "@/lib/domain";
import { isCreditCardAccount } from "@/lib/finance-interpretation";
import {
  filterTransactionRows,
  isPending,
  monthValue,
  sortTransactionRows,
  transactionDirectionDisplay,
  type ProviderStatusFilter,
  type ReviewStatusFilter,
  type SortColumn,
  type SortDirection,
  type TransactionRow,
} from "@/lib/transactions/table";
import { formatCurrency, formatDateShort } from "@/lib/format";

const LARGE_TRANSACTION_THRESHOLD = 100;
const PAGE_SIZE = 50;

function statusLabel(transaction: TransactionRow) {
  if (transaction.providerStatus === "deleted") return "Provider deleted";
  if (transaction.providerStatus === "restored") return "Restored";
  if (isPending(transaction)) return "Pending";
  if (transaction.flags.includes("own_account_transfer")) return "Transfer";
  if (transaction.status === "reviewed") return "Reviewed";
  if (transaction.status === "excluded") return "Excluded";
  return "Needs review";
}

function statusTone(transaction: TransactionRow): "good" | "neutral" | "warning" | "risk" {
  if (transaction.providerStatus === "deleted") return "neutral";
  if (transaction.providerStatus === "restored") return "warning";
  if (isPending(transaction)) return "neutral";
  if (transaction.flags.includes("own_account_transfer") || transaction.status === "excluded")
    return "neutral";
  if (transaction.status === "reviewed") return "good";
  return "warning";
}

const columns: Array<{ key: SortColumn; label: string; align?: "right" }> = [
  { key: "date", label: "Date" },
  { key: "account", label: "Account" },
  { key: "institution", label: "Institution" },
  { key: "merchant", label: "Merchant" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "providerStatus", label: "Provider status" },
  { key: "reviewStatus", label: "Review status" },
];

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
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [institution, setInstitution] = useState("all");
  const [month, setMonth] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [providerStatus, setProviderStatus] = useState<ProviderStatusFilter>("all");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatusFilter>("all");
  const [largeOnly, setLargeOnly] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const rows = useMemo<TransactionRow[]>(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    return transactions.map((transaction) => {
      const account = accountById.get(transaction.accountId);
      return {
        ...transaction,
        accountName: account?.name ?? "Unknown account",
        institutionName: account?.institutionName ?? "Unknown institution",
        categoryName: categoryById.get(transaction.categoryId)?.name ?? transaction.categoryId,
        isCreditCard: isCreditCardAccount(account),
      };
    });
  }, [accounts, categories, transactions]);

  const months = Array.from(new Set(rows.map((row) => monthValue(row.date)))).sort((a, b) =>
    b.localeCompare(a),
  );
  const institutions = Array.from(
    new Set(accounts.map((account) => account.institutionName)),
  ).sort();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const filtered = useMemo(() => {
    let result = filterTransactionRows(rows, {
      search,
      accountId,
      institution,
      month,
      categoryId,
      providerStatus,
      reviewStatus,
    });
    if (largeOnly) {
      result = result.filter((row) => Math.abs(row.amount) >= LARGE_TRANSACTION_THRESHOLD);
    }
    return sortTransactionRows(result, sortColumn, sortDirection);
  }, [
    rows,
    search,
    accountId,
    institution,
    month,
    categoryId,
    providerStatus,
    reviewStatus,
    largeOnly,
    sortColumn,
    sortDirection,
  ]);

  const visible = filtered.slice(0, visibleCount);
  const anyFilterActive =
    Boolean(search) ||
    accountId !== "all" ||
    institution !== "all" ||
    month !== "all" ||
    categoryId !== "all" ||
    providerStatus !== "all" ||
    reviewStatus !== "all" ||
    largeOnly;

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "date" || column === "amount" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setAccountId("all");
    setInstitution("all");
    setMonth("all");
    setCategoryId("all");
    setProviderStatus("all");
    setReviewStatus("all");
    setLargeOnly(false);
  }

  const categoryKindOrder: CategoryKind[] = ["expense", "income", "transfer"];
  const sortedCategories = [...categories].sort((a, b) => {
    const kindDelta = categoryKindOrder.indexOf(a.kind) - categoryKindOrder.indexOf(b.kind);
    return kindDelta === 0 ? a.name.localeCompare(b.name) : kindDelta;
  });

  const chipClass = (active: boolean) =>
    `min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${
      active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/70"
    }`;

  return (
    <section className="rounded-lg border border-line bg-white shadow-panel">
      <div className="border-b border-line p-4">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search merchant or description"
          aria-label="Search transactions"
          className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select aria-label="Filter by account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          <select aria-label="Filter by institution" value={institution} onChange={(e) => setInstitution(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All institutions</option>
            {institutions.map((item) => (<option key={item} value={item}>{item}</option>))}
          </select>
          <select aria-label="Filter by month" value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All months</option>
            {months.map((item) => (<option key={item} value={item}>{item}</option>))}
          </select>
          <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All categories</option>
            {sortedCategories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
          </select>
          <select aria-label="Filter by provider status" value={providerStatus} onChange={(e) => setProviderStatus(e.target.value as ProviderStatusFilter)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">Posted &amp; pending</option>
            <option value="posted">Posted only</option>
            <option value="pending">Pending only</option>
          </select>
          <select aria-label="Filter by review status" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as ReviewStatusFilter)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">Any review status</option>
            <option value="needs_review">Needs review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={chipClass(reviewStatus === "needs_review")} onClick={() => setReviewStatus((c) => (c === "needs_review" ? "all" : "needs_review"))}>Needs review</button>
          <button type="button" className={chipClass(month === currentMonth)} onClick={() => setMonth((c) => (c === currentMonth ? "all" : currentMonth))}>This month</button>
          <button type="button" className={chipClass(providerStatus === "pending")} onClick={() => setProviderStatus((c) => (c === "pending" ? "all" : "pending"))}>Pending</button>
          <button type="button" className={chipClass(largeOnly)} onClick={() => setLargeOnly((c) => !c)}>Large</button>
          {["American Express", "Revolut", "Nationwide"]
            .filter((name) => institutions.includes(name))
            .map((name) => (
              <button key={name} type="button" className={chipClass(institution === name)} onClick={() => setInstitution((c) => (c === name ? "all" : name))}>{name}</button>
            ))}
          {anyFilterActive ? (
            <button type="button" className="min-h-9 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-berry" onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-ink/55">
          Showing {Math.min(visible.length, filtered.length)} of {filtered.length} filtered ({rows.length} total).
        </p>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 p-4 md:hidden">
        {visible.map((transaction) => {
          const dir = transactionDirectionDisplay(transaction);
          return (
            <article key={transaction.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink/50">{formatDateShort(transaction.date)}</p>
                  <h3 className="mt-1 font-semibold text-ink">{transaction.merchant}</h3>
                  <p className="mt-1 text-sm text-ink/60">{transaction.description}</p>
                </div>
                <p className={`shrink-0 font-semibold ${dir.tone === "risk" ? "text-berry" : dir.tone === "good" ? "text-moss" : "text-ink"}`}>
                  {formatCurrency(Math.abs(transaction.amount))} {dir.label}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-ink/50">Account</dt><dd className="font-semibold text-ink">{transaction.accountName}</dd></div>
                <div><dt className="text-ink/50">Category</dt><dd className="font-semibold text-ink">{transaction.categoryName}</dd></div>
                <div><dt className="text-ink/50">Provider status</dt><dd><StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} /></dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              {columns.map((column) => {
                const active = sortColumn === column.key;
                const Icon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={column.key} className={`px-4 py-3 ${column.align === "right" ? "text-right" : ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      aria-label={`Sort by ${column.label}`}
                      className={`inline-flex items-center gap-1 ${column.align === "right" ? "flex-row-reverse" : ""} ${active ? "text-ink" : ""}`}
                    >
                      {column.label}
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((transaction) => {
              const dir = transactionDirectionDisplay(transaction);
              return (
                <tr key={transaction.id} className="bg-white">
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{formatDateShort(transaction.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{transaction.accountName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{transaction.institutionName}</td>
                  <td className="min-w-56 px-4 py-3">
                    <p className="font-semibold text-ink">{transaction.merchant}</p>
                    <p className="text-xs text-ink/50">{transaction.description}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{transaction.categoryName}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${dir.tone === "risk" ? "text-berry" : dir.tone === "good" ? "text-moss" : "text-ink"}`}>
                    {formatCurrency(Math.abs(transaction.amount))}
                    <span className="ml-1 text-xs font-normal text-ink/50">{dir.label}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{transaction.status.replaceAll("_", " ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <div className="border-t border-line p-6 text-sm text-ink/60">{emptyMessage}</div>
      ) : null}

      {visible.length < filtered.length ? (
        <div className="border-t border-line p-4 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
          >
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      ) : null}
    </section>
  );
}
