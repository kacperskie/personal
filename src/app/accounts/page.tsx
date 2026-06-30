import { Landmark, ShieldCheck, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import {
  connectedAccounts,
  dashboardSummary,
  mockSavingsGoals,
} from "@/lib/mock-data";
import { formatCurrency, formatDateShort } from "@/lib/format";
import type { ConnectionLifecycleStatus } from "@/lib/domain";

const statusTone: Record<ConnectionLifecycleStatus, "good" | "neutral" | "warning" | "risk"> = {
  not_connected: "neutral",
  connecting: "neutral",
  connected: "good",
  needs_reconsent: "warning",
  syncing: "neutral",
  sync_failed: "risk",
  disconnected: "neutral",
};

const purposeLabels: Record<string, string> = {
  main_current_account: "Main current account",
  bills_account: "Bills account",
  everyday_spending: "Everyday spending",
  emergency_fund: "Emergency fund",
  short_term_savings: "Short-term savings",
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

const purposeOptions = Object.entries(purposeLabels);

function labelStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connected accounts"
        title="Accounts"
        description="Assign account purpose, inclusion rules, goal links, and bill payment sources from mock provider data."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <WalletCards className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Safe-to-spend eligible cash</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(dashboardSummary.safeToSpendEligibleCash)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Landmark className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Bills account balance</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(dashboardSummary.billsAccountBalance)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ShieldCheck className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Cashflow account balance</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatCurrency(dashboardSummary.cashflowAccountBalance)}
          </p>
        </div>
      </section>

      <section className="grid gap-4">
        {connectedAccounts.map((account) => (
          <article
            key={account.id}
            className="rounded-lg border border-line bg-white p-5 shadow-panel"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-ink">{account.name}</h2>
                  <StatusPill
                    label={labelStatus(account.displaySyncStatus)}
                    tone={statusTone[account.displaySyncStatus]}
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
                    defaultValue={account.purpose}
                    aria-label={`${account.name} purpose`}
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
                    defaultValue={account.linkedGoalIds[0] ?? ""}
                    aria-label={`${account.name} linked goal`}
                  >
                    <option value="">No linked goal</option>
                    {mockSavingsGoals.map((goal) => (
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
                <input type="checkbox" defaultChecked={account.includeInSafeToSpend} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink/70">
                Include in cashflow
                <input type="checkbox" defaultChecked={account.includeInCashflow} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink/70">
                Include in net worth
                <input type="checkbox" defaultChecked={account.includeInNetWorth} />
              </label>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Bills paid from this account
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {account.billsPaid.length > 0 ? (
                    account.billsPaid.map((bill) => (
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
                  {account.lastSyncedAt ? formatDateShort(account.lastSyncedAt.slice(0, 10)) : "Never"}
                  {account.consentExpiresAt
                    ? ` - Consent expires: ${formatDateShort(account.consentExpiresAt.slice(0, 10))}`
                    : ""}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
