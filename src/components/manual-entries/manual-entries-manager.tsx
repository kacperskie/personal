"use client";

import { useMemo, useState, useTransition } from "react";
import { BookOpenText, CalendarClock, Plus, Save, Scale, Trash2 } from "lucide-react";
import {
  createManualFinanceItemAction,
  deleteManualFinanceItemAction,
  updateManualFinanceItemAction,
} from "@/app/manual-entries/actions";
import { StatusPill } from "@/components/status-pill";
import type {
  EntityStatus,
  ManualFinanceDirection,
  ManualFinanceItem,
  ManualFinanceItemType,
} from "@/lib/domain";
import type { ManualFinanceItemInput } from "@/lib/repositories/validation";

const itemTypes: ManualFinanceItemType[] = [
  "debt",
  "money_owed_to_user",
  "money_user_owes",
  "offline_account",
  "cash",
  "pension_estimate",
  "isa_investment_balance",
  "future_expense",
  "manual_bill",
  "manual_income",
];

const directions: ManualFinanceDirection[] = [
  "asset",
  "liability",
  "receivable",
  "payable",
  "income",
  "expense",
];

const statuses: EntityStatus[] = [
  "active",
  "inactive",
  "archived",
  "pending_review",
  "confirmed",
];

const directionTone = {
  asset: "good",
  receivable: "good",
  income: "good",
  liability: "risk",
  payable: "warning",
  expense: "warning",
} as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

function emptyDraft(): ManualFinanceItemInput {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "manual_bill",
    direction: "expense",
    amount: 0,
    currency: "GBP",
    dueDate: null,
    recurrence: null,
    apr: null,
    minimumPayment: null,
    counterparty: null,
    includeInCashflow: true,
    includeInNetWorth: false,
    notes: null,
    status: "active",
    reviewDate: null,
  };
}

export function ManualEntriesManager({
  items,
  supabaseConfigured,
}: {
  items: ManualFinanceItem[];
  supabaseConfigured: boolean;
}) {
  const [draftItems, setDraftItems] = useState(items);
  const [newItem, setNewItem] = useState<ManualFinanceItemInput>(() => emptyDraft());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(
    () => ({
      total: draftItems.length,
      includedInCashflow: draftItems.filter((item) => item.includeInCashflow).length,
      includedInNetWorth: draftItems.filter((item) => item.includeInNetWorth).length,
    }),
    [draftItems],
  );

  function updateExisting(id: string, changes: Partial<ManualFinanceItem>) {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function createItem() {
    setSavingId(newItem.id);
    setMessage(null);
    startTransition(() => {
      void createManualFinanceItemAction(newItem)
        .then((created) => {
          setDraftItems((current) => [created, ...current]);
          setNewItem(emptyDraft());
          setMessage(
            supabaseConfigured
              ? "Manual finance item created."
              : "Manual finance item added in local mock state.",
          );
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setSavingId(null));
    });
  }

  function saveItem(item: ManualFinanceItem) {
    setSavingId(item.id);
    setMessage(null);
    startTransition(() => {
      void updateManualFinanceItemAction(item)
        .then((updated) => {
          setDraftItems((current) =>
            current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
          );
          setMessage(
            supabaseConfigured
              ? "Manual finance item saved."
              : "Manual finance item updated in local mock state.",
          );
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setSavingId(null));
    });
  }

  function deleteItem(id: string) {
    setSavingId(id);
    setMessage(null);
    startTransition(() => {
      void deleteManualFinanceItemAction(id)
        .then(() => {
          setDraftItems((current) => current.filter((item) => item.id !== id));
          setMessage(
            supabaseConfigured
              ? "Manual finance item deleted."
              : "Manual finance item removed from local mock state.",
          );
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setSavingId(null));
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <BookOpenText className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Manual entries</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CalendarClock className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Included in cashflow</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {summary.includedInCashflow}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Scale className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Included in net worth</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {summary.includedInNetWorth}
          </p>
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink/70">
          {message}
        </p>
      ) : null}

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Add manual entry</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="text-sm text-ink/70">
            Name
            <input
              value={newItem.name}
              onChange={(event) => setNewItem((item) => ({ ...item, name: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink/70">
            Type
            <select
              value={newItem.type}
              onChange={(event) =>
                setNewItem((item) => ({
                  ...item,
                  type: event.target.value as ManualFinanceItemType,
                }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            >
              {itemTypes.map((type) => (
                <option key={type} value={type}>
                  {label(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink/70">
            Direction
            <select
              value={newItem.direction}
              onChange={(event) =>
                setNewItem((item) => ({
                  ...item,
                  direction: event.target.value as ManualFinanceDirection,
                }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            >
              {directions.map((direction) => (
                <option key={direction} value={direction}>
                  {label(direction)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink/70">
            Amount
            <input
              value={newItem.amount}
              type="number"
              min="0"
              step="0.01"
              onChange={(event) =>
                setNewItem((item) => ({ ...item, amount: Number(event.target.value) }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink/70">
            Due date
            <input
              value={newItem.dueDate ?? ""}
              type="date"
              onChange={(event) =>
                setNewItem((item) => ({ ...item, dueDate: event.target.value || null }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink/70">
            Review date
            <input
              value={newItem.reviewDate ?? ""}
              type="date"
              onChange={(event) =>
                setNewItem((item) => ({ ...item, reviewDate: event.target.value || null }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink/70">
            Notes
            <input
              value={newItem.notes ?? ""}
              onChange={(event) =>
                setNewItem((item) => ({ ...item, notes: event.target.value || null }))
              }
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={newItem.includeInCashflow}
                onChange={(event) =>
                  setNewItem((item) => ({
                    ...item,
                    includeInCashflow: event.target.checked,
                  }))
                }
              />
              Cashflow
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={newItem.includeInNetWorth}
                onChange={(event) =>
                  setNewItem((item) => ({
                    ...item,
                    includeInNetWorth: event.target.checked,
                  }))
                }
              />
              Net worth
            </label>
            <button
              type="button"
              onClick={createItem}
              disabled={isPending || savingId === newItem.id}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Due / review</th>
                <th className="px-4 py-3">Included</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {draftItems.map((item) => (
                <tr key={item.id}>
                  <td className="min-w-64 px-4 py-3">
                    <input
                      value={item.name}
                      onChange={(event) => updateExisting(item.id, { name: event.target.value })}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-semibold text-ink"
                    />
                    <input
                      value={item.notes ?? ""}
                      onChange={(event) =>
                        updateExisting(item.id, { notes: event.target.value || null })
                      }
                      className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink/60"
                      aria-label={`${item.name} notes`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {label(item.type)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill label={label(item.direction)} tone={directionTone[item.direction]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                    <input
                      value={item.amount}
                      type="number"
                      min="0"
                      step="0.01"
                      onChange={(event) =>
                        updateExisting(item.id, { amount: Number(event.target.value) })
                      }
                      className="w-28 rounded-lg border border-line bg-paper px-3 py-2 text-right text-sm font-semibold text-ink"
                      aria-label={`${item.name} amount`}
                    />
                  </td>
                  <td className="min-w-52 px-4 py-3 text-ink/70">
                    <label className="block text-xs text-ink/55">
                      Due
                      <input
                        value={item.dueDate ?? ""}
                        type="date"
                        onChange={(event) =>
                          updateExisting(item.id, { dueDate: event.target.value || null })
                        }
                        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      />
                    </label>
                    <label className="mt-2 block text-xs text-ink/55">
                      Review
                      <input
                        value={item.reviewDate ?? ""}
                        type="date"
                        onChange={(event) =>
                          updateExisting(item.id, { reviewDate: event.target.value || null })
                        }
                        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      />
                    </label>
                  </td>
                  <td className="min-w-44 px-4 py-3 text-ink/70">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.includeInCashflow}
                        onChange={(event) =>
                          updateExisting(item.id, {
                            includeInCashflow: event.target.checked,
                          })
                        }
                      />
                      Cashflow
                    </label>
                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.includeInNetWorth}
                        onChange={(event) =>
                          updateExisting(item.id, {
                            includeInNetWorth: event.target.checked,
                          })
                        }
                      />
                      Net worth
                    </label>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <select
                      value={item.status}
                      onChange={(event) =>
                        updateExisting(item.id, { status: event.target.value as EntityStatus })
                      }
                      className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveItem(item)}
                        disabled={isPending || savingId === item.id}
                        className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(item.id)}
                        disabled={isPending || savingId === item.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-berry disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {draftItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-ink/60" colSpan={8}>
                    No manual entries yet. Add one above for debts, offline balances, future expenses, or manual income.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
