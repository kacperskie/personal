"use client";

import { useMemo, useState, useTransition } from "react";
import { Landmark, Save, ShieldCheck, WalletCards } from "lucide-react";
import { saveAccountAssignmentAction } from "@/app/accounts/actions";
import { StatusPill } from "@/components/status-pill";
import type {
  Account,
  AccountPurpose,
  Bill,
  ConnectionLifecycleStatus,
  SavingsGoal,
} from "@/lib/domain";
import {
  calculateBillsAccountBalance,
  calculateCashflowAccountBalance,
  calculateSafeToSpendEligibleCash,
} from "@/lib/finance";
import { formatCurrency, formatDateShort } from "@/lib/format";

const statusTone: Record<ConnectionLifecycleStatus, "good" | "neutral" | "warning" | "risk"> = {
  not_connected: "neutral",
  connecting: "neutral",
  connected: "good",
  needs_reconsent: "warning",
  syncing: "neutral",
  sync_failed: "risk",
  disconnected: "neutral",
};

const purposeLabels: Record<AccountPurpose, string> = {
  main_current_account: "Main current account",
  bills_account: "Bills account",
  everyday_spending: "Everyday spending",
  emergency_fund: "Emergency fund",
  short_term_savings: "Short-term savings",
  pocket: "Pocket (money set aside for spending)",
  holiday_fund: "Holiday fund",
  pet_fund: "Pet fund",
  house_deposit: "House deposit",
  credit_card: "Credit card",
  loan_account: "Loan account",
  pension: "Pension",
  investment: "Investment",
  cash: "Cash",
  offline_account: "Offline account",
  other: "Other",
};

const purposeOptions = Object.entries(purposeLabels) as [AccountPurpose, string][];

function labelStatus(status: string) {
  return status.replaceAll("_", " ");
}

function accountLifecycleStatus(account: Account): ConnectionLifecycleStatus {
  const today = new Date().toISOString().slice(0, 10);

  if (account.consentExpiresAt && account.consentExpiresAt < today) {
    return "needs_reconsent";
  }

  return account.syncStatus;
}

export function AccountsManager({
  accounts,
  bills,
  savingsGoals,
  persistenceConfigured,
}: {
  accounts: Account[];
  bills: Bill[];
  savingsGoals: SavingsGoal[];
  persistenceConfigured: boolean;
}) {
  const [accountDrafts, setAccountDrafts] = useState(accounts);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(
    () => ({
      safeToSpendEligibleCash: calculateSafeToSpendEligibleCash(accountDrafts),
      billsAccountBalance: calculateBillsAccountBalance(accountDrafts),
      cashflowAccountBalance: calculateCashflowAccountBalance(accountDrafts),
    }),
    [accountDrafts],
  );

  function updateAccount(id: string, changes: Partial<Account>) {
    setAccountDrafts((current) =>
      current.map((account) =>
        account.id === id ? { ...account, ...changes, updatedAt: new Date().toISOString() } : account,
      ),
    );
  }

  function saveAccount(account: Account) {
    setSavingId(account.id);
    setMessage(null);
    startTransition(() => {
      void saveAccountAssignmentAction({
        id: account.id,
        purpose: account.purpose,
        includeInSafeToSpend: account.includeInSafeToSpend,
        includeInCashflow: account.includeInCashflow,
        includeInNetWorth: account.includeInNetWorth,
        linkedGoalIds: account.linkedGoalIds,
      })
        .then(() => {
          setMessage(
            persistenceConfigured
              ? "Account settings saved."
              : "Account settings updated in local mock state.",
          );
        })
        .catch((error: Error) => {
          setMessage(error.message);
        })
        .finally(() => {
          setSavingId(null);
        });
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <WalletCards className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Safe-to-spend eligible cash</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(summary.safeToSpendEligibleCash)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Landmark className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Bills account balance</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(summary.billsAccountBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ShieldCheck className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Cashflow account balance</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(summary.cashflowAccountBalance)}
          </p>
        </div>
      </section>

      {message ? (
        <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink/70">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4">
        {accountDrafts.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-ink/60 shadow-panel">
            No accounts are available yet. Connect a provider later or keep using manual entries.
          </div>
        ) : null}

        {accountDrafts.map((account) => {
          const displaySyncStatus = accountLifecycleStatus(account);
          const accountBills = bills.filter((bill) => bill.accountId === account.id);

          return (
            <article
              key={account.id}
              className="rounded-lg border border-line bg-white p-5 shadow-panel"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-ink">{account.name}</h2>
                    <StatusPill
                      label={labelStatus(displaySyncStatus)}
                      tone={statusTone[displaySyncStatus]}
                    />
                  </div>
                  <p className="mt-1 text-sm text-ink/60">
                    {account.institutionName} - {account.officialName}
                    {account.mask ? ` - ${account.mask}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    Balance:{" "}
                    <span className="font-semibold text-ink">
                      {formatCurrency(account.balance)}
                    </span>
                    {account.availableBalance !== null
                      ? ` - Available: ${formatCurrency(account.availableBalance)}`
                      : ""}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
                  <label className="text-sm text-ink/70">
                    Purpose
                    <select
                      className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      value={account.purpose}
                      aria-label={`${account.name} purpose`}
                      onChange={(event) =>
                        updateAccount(account.id, {
                          purpose: event.target.value as AccountPurpose,
                        })
                      }
                    >
                      {purposeOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-ink/70">
                    Linked goal
                    <select
                      className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
                      value={account.linkedGoalIds[0] ?? ""}
                      aria-label={`${account.name} linked goal`}
                      onChange={(event) =>
                        updateAccount(account.id, {
                          linkedGoalIds: event.target.value ? [event.target.value] : [],
                        })
                      }
                    >
                      <option value="">No linked goal</option>
                      {savingsGoals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink/70">
                  Include in safe-to-spend
                  <input
                    type="checkbox"
                    checked={account.includeInSafeToSpend}
                    onChange={(event) =>
                      updateAccount(account.id, {
                        includeInSafeToSpend: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink/70">
                  Include in cashflow
                  <input
                    type="checkbox"
                    checked={account.includeInCashflow}
                    onChange={(event) =>
                      updateAccount(account.id, {
                        includeInCashflow: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink/70">
                  Include in net worth
                  <input
                    type="checkbox"
                    checked={account.includeInNetWorth}
                    onChange={(event) =>
                      updateAccount(account.id, {
                        includeInNetWorth: event.target.checked,
                      })
                    }
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] lg:items-end">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      Bills paid from this account
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {accountBills.length > 0 ? (
                        accountBills.map((bill) => (
                          <span
                            key={bill.id}
                            className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink/70"
                          >
                            {bill.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-ink/50">None assigned</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                      Sync details
                    </p>
                    <p className="mt-2 text-sm text-ink/70">
                      Last synced:{" "}
                      {account.lastSyncedAt
                        ? formatDateShort(account.lastSyncedAt.slice(0, 10))
                        : "Never"}
                      {account.consentExpiresAt
                        ? ` - Consent expires: ${formatDateShort(account.consentExpiresAt.slice(0, 10))}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveAccount(account)}
                  disabled={isPending || savingId === account.id}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {savingId === account.id ? "Saving" : "Save"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
