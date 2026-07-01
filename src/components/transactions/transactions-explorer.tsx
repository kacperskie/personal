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

export type RowBudgetState = {
  weekly: boolean;
  monthly: boolean;
  summaries: boolean;
  reviewed: boolean;
  exclusionReason: string | null;
  source: "user" | "deterministic";
};

type ServerAction = (formData: FormData) => void | Promise<void>;

export type TransactionInlineActions = {
  setInclusion: ServerAction;
  quick: ServerAction;
  markReviewed: ServerAction;
  setCategory: ServerAction;
  bulk: ServerAction;
};

const QUICK_ACTIONS: Array<[string, string]> = [
  ["include", "Include in budgets"],
  ["exclude_weekly", "Exclude weekly"],
  ["exclude_monthly", "Exclude monthly"],
  ["exclude_both", "Exclude both"],
  ["internal_transfer", "Mark internal transfer"],
  ["amex_payment", "Mark Amex payment"],
  ["amex_pocket_transfer", "Mark Amex pocket transfer"],
  ["bill", "Mark bill/subscription"],
  ["savings_transfer", "Mark savings transfer"],
  ["ignored", "Mark ignored"],
];

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
  { key: "merchant", label: "Merchant" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "providerStatus", label: "Status" },
];

function budgetStateFor(
  states: Record<string, RowBudgetState>,
  transaction: TransactionRow,
): RowBudgetState {
  return (
    states[transaction.id] ?? {
      weekly: false,
      monthly: false,
      summaries: false,
      reviewed: transaction.status === "reviewed",
      exclusionReason: null,
      source: "deterministic",
    }
  );
}

/** A tiny form-button that flips one inclusion flag for a row. */
function ToggleButton({
  action,
  transactionId,
  field,
  active,
  label,
}: {
  action?: ServerAction;
  transactionId: string;
  field: string;
  active: boolean;
  label: string;
}) {
  if (!action) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-moss/10 text-moss" : "bg-ink/5 text-ink/50"}`}>
        {label}
      </span>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={active ? "false" : "true"} />
      <button
        type="submit"
        aria-pressed={active}
        className={`min-h-8 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-moss/15 text-moss" : "bg-ink/5 text-ink/50 line-through"}`}
        title={`${label}: ${active ? "included (click to exclude)" : "excluded (click to include)"}`}
      >
        {label}
      </button>
    </form>
  );
}

export function TransactionsExplorer({
  transactions,
  accounts,
  categories,
  budgetStates = {},
  actions,
  emptyMessage = "No transactions match these filters.",
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  budgetStates?: Record<string, RowBudgetState>;
  actions?: TransactionInlineActions;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("exclude_weekly");

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
  }, [rows, search, accountId, institution, month, categoryId, providerStatus, reviewStatus, largeOnly, sortColumn, sortDirection]);

  const visible = filtered.slice(0, visibleCount);
  const visibleIds = visible.map((row) => row.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const anyFilterActive =
    Boolean(search) || accountId !== "all" || institution !== "all" || month !== "all" ||
    categoryId !== "all" || providerStatus !== "all" || reviewStatus !== "all" || largeOnly;

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((c) => (c === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "date" || column === "amount" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setSearch(""); setAccountId("all"); setInstitution("all"); setMonth("all");
    setCategoryId("all"); setProviderStatus("all"); setReviewStatus("all"); setLargeOnly(false);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => new Set([...current, ...visibleIds]));
  }

  const categoryKindOrder: CategoryKind[] = ["expense", "income", "transfer"];
  const sortedCategories = [...categories].sort((a, b) => {
    const kindDelta = categoryKindOrder.indexOf(a.kind) - categoryKindOrder.indexOf(b.kind);
    return kindDelta === 0 ? a.name.localeCompare(b.name) : kindDelta;
  });

  const chipClass = (active: boolean) =>
    `min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/70"}`;

  return (
    <section className="rounded-lg border border-line bg-white shadow-panel">
      <div className="border-b border-line p-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchant or description"
          aria-label="Search transactions"
          className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select aria-label="Filter by account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All accounts</option>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <select aria-label="Filter by institution" value={institution} onChange={(e) => setInstitution(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All institutions</option>
            {institutions.map((i) => (<option key={i} value={i}>{i}</option>))}
          </select>
          <select aria-label="Filter by month" value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All months</option>
            {months.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <option value="all">All categories</option>
            {sortedCategories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
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
          {["American Express", "Revolut", "Nationwide"].filter((n) => institutions.includes(n)).map((n) => (
            <button key={n} type="button" className={chipClass(institution === n)} onClick={() => setInstitution((c) => (c === n ? "all" : n))}>{n}</button>
          ))}
          {anyFilterActive ? (
            <button type="button" className="min-h-9 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-berry" onClick={clearFilters}>Clear filters</button>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-ink/55">
          Showing {Math.min(visible.length, filtered.length)} of {filtered.length} filtered ({rows.length} total).
        </p>
      </div>

      {/* Bulk toolbar operating on selected rows from the current filtered/sorted table */}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 p-3 text-sm">
          <button type="button" onClick={selectAllVisible} className="min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink">Select all visible</button>
          <button type="button" onClick={() => setSelected(new Set())} className="min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink">Clear selection</button>
          <span className="text-xs font-semibold text-ink/60">{selected.size} selected</span>
          <form action={actions.bulk} className="ml-auto flex items-center gap-2">
            {Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="transactionIds" value={id} />
            ))}
            <select name="bulkAction" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} aria-label="Bulk action" className="min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-xs">
              {QUICK_ACTIONS.map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
            </select>
            <button type="submit" disabled={selected.size === 0} className="min-h-9 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Apply to selected</button>
          </form>
        </div>
      ) : null}

      {/* Mobile cards */}
      <div className="grid gap-3 p-4 md:hidden">
        {visible.map((transaction) => {
          const dir = transactionDirectionDisplay(transaction);
          const b = budgetStateFor(budgetStates, transaction);
          return (
            <article key={transaction.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  {actions ? (
                    <input type="checkbox" checked={selected.has(transaction.id)} onChange={() => toggleSelected(transaction.id)} aria-label={`Select ${transaction.merchant}`} className="mt-1" />
                  ) : null}
                  <div>
                    <p className="text-xs text-ink/50">{formatDateShort(transaction.date)}</p>
                    <h3 className="mt-1 font-semibold text-ink">{transaction.merchant}</h3>
                    <p className="mt-1 text-sm text-ink/60">{transaction.categoryName}</p>
                  </div>
                </div>
                <p className={`shrink-0 font-semibold ${dir.tone === "risk" ? "text-berry" : dir.tone === "good" ? "text-moss" : "text-ink"}`}>
                  {formatCurrency(Math.abs(transaction.amount))} {dir.label}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ToggleButton action={actions?.setInclusion} transactionId={transaction.id} field="weekly" active={b.weekly} label="Weekly" />
                <ToggleButton action={actions?.setInclusion} transactionId={transaction.id} field="monthly" active={b.monthly} label="Monthly" />
                <StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} />
                {b.reviewed ? <span className="rounded-full bg-moss/10 px-2 py-0.5 text-xs font-semibold text-moss">reviewed</span> : null}
              </div>
            </article>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              {actions ? (
                <th className="px-3 py-3">
                  <input type="checkbox" checked={allVisibleSelected} onChange={() => (allVisibleSelected ? setSelected(new Set()) : selectAllVisible())} aria-label="Select all visible" />
                </th>
              ) : null}
              {columns.map((column) => {
                const active = sortColumn === column.key;
                const Icon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={column.key} className={`px-4 py-3 ${column.align === "right" ? "text-right" : ""}`}>
                    <button type="button" onClick={() => toggleSort(column.key)} aria-label={`Sort by ${column.label}`} className={`inline-flex items-center gap-1 ${column.align === "right" ? "flex-row-reverse" : ""} ${active ? "text-ink" : ""}`}>
                      {column.label}
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Review &amp; actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((transaction) => {
              const dir = transactionDirectionDisplay(transaction);
              const b = budgetStateFor(budgetStates, transaction);
              return (
                <tr key={transaction.id} className="bg-white align-top">
                  {actions ? (
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(transaction.id)} onChange={() => toggleSelected(transaction.id)} aria-label={`Select ${transaction.merchant}`} />
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">{formatDateShort(transaction.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {transaction.accountName}
                    <span className="block text-xs text-ink/45">{transaction.institutionName}</span>
                  </td>
                  <td className="min-w-52 px-4 py-3">
                    <p className="font-semibold text-ink">{transaction.merchant}</p>
                    <p className="text-xs text-ink/50">{transaction.description}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {actions ? (
                      <form action={actions.setCategory} className="flex items-center gap-1">
                        <input type="hidden" name="transactionId" value={transaction.id} />
                        <select name="budgetCategory" defaultValue={transaction.categoryId} aria-label="Category" className="min-h-8 max-w-40 rounded-lg border border-line bg-white px-2 py-1 text-xs">
                          {sortedCategories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                        <button type="submit" className="min-h-8 rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink">Set</button>
                      </form>
                    ) : (
                      transaction.categoryName
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${dir.tone === "risk" ? "text-berry" : dir.tone === "good" ? "text-moss" : "text-ink"}`}>
                    {formatCurrency(Math.abs(transaction.amount))}
                    <span className="ml-1 text-xs font-normal text-ink/50">{dir.label}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusPill label={statusLabel(transaction)} tone={statusTone(transaction)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ToggleButton action={actions?.setInclusion} transactionId={transaction.id} field="weekly" active={b.weekly} label="W" />
                      <ToggleButton action={actions?.setInclusion} transactionId={transaction.id} field="monthly" active={b.monthly} label="M" />
                      <ToggleButton action={actions?.setInclusion} transactionId={transaction.id} field="summaries" active={b.summaries} label="Σ" />
                    </div>
                    {b.exclusionReason ? (
                      <span className="mt-1 block text-xs text-ink/50">{b.exclusionReason.replaceAll("_", " ")}</span>
                    ) : null}
                    {b.source === "user" ? <span className="text-[10px] uppercase tracking-wide text-teal">manual</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {b.reviewed ? (
                        <span className="rounded-full bg-moss/10 px-2 py-0.5 text-xs font-semibold text-moss">reviewed</span>
                      ) : actions ? (
                        <form action={actions.markReviewed}>
                          <input type="hidden" name="transactionId" value={transaction.id} />
                          <button type="submit" className="min-h-8 rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink">Mark reviewed</button>
                        </form>
                      ) : null}
                      {actions ? (
                        <form action={actions.quick} className="flex items-center gap-1">
                          <input type="hidden" name="transactionId" value={transaction.id} />
                          <select name="action" aria-label="Quick action" defaultValue="include" className="min-h-8 rounded-lg border border-line bg-white px-2 py-1 text-xs">
                            {QUICK_ACTIONS.map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
                          </select>
                          <button type="submit" className="min-h-8 rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-white">Go</button>
                        </form>
                      ) : null}
                    </div>
                  </td>
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
          <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      ) : null}
    </section>
  );
}
