import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ClipboardList,
  Landmark,
  PiggyBank,
  Repeat,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { BudgetHealthChart } from "@/components/budget-health-chart";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getDashboardViewModel } from "@/lib/dashboard/summary";
import { formatCurrency } from "@/lib/format";

function dashboardCopy(source: "firebase" | "mock" | "firebase_fallback") {
  if (source === "mock") {
    return {
      eyebrow: "Mock dashboard",
      description: "A demo view of cash, commitments, and budget health using seeded mock figures.",
    };
  }

  if (source === "firebase_fallback") {
    return {
      eyebrow: "Mock fallback",
      description:
        "Firebase data could not be loaded, so the dashboard is showing explicit mock fallback figures.",
    };
  }

  return {
    eyebrow: "Live dashboard",
    description:
      "Your safe-to-spend view calculated from signed-in, user-owned Firebase finance records.",
  };
}

export default async function DashboardPage() {
  const dashboard = await getDashboardViewModel();

  if (dashboard.kind === "empty") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Empty dashboard"
          title="Dashboard"
          description="No finance data is available for your signed-in Firebase account yet. Add accounts, bills, debts, savings goals, or manual entries to calculate a real safe-to-spend number."
        />
        <section className="rounded-lg border border-line bg-white p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-ink">Set up your first real numbers</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
            The dashboard is intentionally not showing seeded mock totals in Firebase mode. Add
            user-owned records first, then the deterministic finance engine will calculate safe to
            spend, bills funding, overdraft position, and debt progress from your data.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/accounts"
              className="inline-flex min-h-10 items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              Add accounts
            </a>
            <a
              href="/manual-entries"
              className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70"
            >
              Add manual entry
            </a>
            <a
              href="/settings/system-readiness"
              className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70"
            >
              Check readiness
            </a>
          </div>
        </section>
      </div>
    );
  }

  if (dashboard.kind === "error") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Dashboard unavailable"
          title="Dashboard"
          description="The app could not calculate your live dashboard from Firebase."
        />
        <section className="rounded-lg border border-berry/30 bg-berry/5 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-berry" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-ink">Finance data could not load</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">{dashboard.message}</p>
              <a
                href="/settings/system-readiness"
                className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Check readiness
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const { eyebrow, description } = dashboardCopy(dashboard.source);
  const summary = dashboard.summary;
  const financeV2 = dashboard.financeV2;
  const subscriptionAndBillCount = dashboard.dataCounts.bills;
  const debtTotal = financeV2.debtFreedom.totalDebt;
  const overdraftUsed = financeV2.overdraft?.currentOverdraftUsed ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title="Dashboard" description={description} />

      {dashboard.source === "firebase_fallback" ? (
        <section className="rounded-lg border border-saffron/30 bg-saffron/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-saffron" aria-hidden="true" />
            <p className="text-sm leading-6 text-ink/75">
              {dashboard.fallbackReason} These numbers are not from your signed-in Firebase data.
            </p>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Key finance metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="Current cash"
          value={formatCurrency(summary.currentCash)}
          detail="Accounts and manual cash items included in cashflow"
          icon={Banknote}
          tone="teal"
        />
        <StatCard
          label="Safe to spend"
          value={formatCurrency(summary.safeToSpend)}
          detail="After bills, savings, debt payments, and buffer"
          icon={PiggyBank}
          tone={summary.safeToSpend < 0 ? "berry" : "moss"}
        />
        <StatCard
          label="Bills due before payday"
          value={formatCurrency(summary.billsDueBeforePayday)}
          detail={`Next payday: ${summary.nextPayday}`}
          icon={CalendarClock}
          tone="saffron"
        />
        <StatCard
          label="Bills account balance"
          value={formatCurrency(summary.billsAccountBalance)}
          detail={
            financeV2.billsAccount.isFullyFunded
              ? "Bills account is funded for known commitments"
              : `${formatCurrency(financeV2.billsAccount.expectedShortfall)} short before payday`
          }
          icon={WalletCards}
          tone={financeV2.billsAccount.isFullyFunded ? "moss" : "berry"}
        />
        <StatCard
          label="Monthly income"
          value={formatCurrency(summary.monthlyIncome)}
          detail="Transactions and manual income in the active period"
          icon={TrendingUp}
          tone="teal"
        />
        <StatCard
          label="Monthly spending"
          value={formatCurrency(summary.monthlySpending)}
          detail="Reviewed spending and manual expenses in the active period"
          icon={TrendingDown}
          tone="berry"
        />
        <StatCard
          label="Projected month-end balance"
          value={formatCurrency(summary.projectedMonthEndBalance)}
          detail="Current cash plus known income less known outflows"
          icon={Landmark}
          tone={summary.projectedMonthEndBalance < 0 ? "berry" : "moss"}
        />
        <StatCard
          label="Debt balance"
          value={formatCurrency(debtTotal)}
          detail={
            financeV2.debtFreedom.projectedDebtFreeDate
              ? `Projected debt-free: ${financeV2.debtFreedom.projectedDebtFreeDate}`
              : "No debt-free date projected yet"
          }
          icon={TrendingDown}
          tone={debtTotal > 0 ? "saffron" : "moss"}
        />
        <StatCard
          label="Overdraft used"
          value={formatCurrency(overdraftUsed)}
          detail={
            financeV2.overdraft
              ? `Risk before payday: ${financeV2.overdraft.riskBeforePayday}`
              : "No active overdraft plan recorded"
          }
          icon={ShieldCheck}
          tone={
            financeV2.overdraft?.riskBeforePayday === "high"
              ? "berry"
              : overdraftUsed > 0
                ? "saffron"
                : "moss"
          }
        />
        <StatCard
          label="Known bills and subscriptions"
          value={String(subscriptionAndBillCount)}
          detail="Persisted bill and subscription records in this dashboard"
          icon={Repeat}
          tone="teal"
        />
        <StatCard
          label="Payday allocation"
          value={
            financeV2.paydayAllocation
              ? formatCurrency(financeV2.paydayAllocation.flexibleSpendingAllocation)
              : "Not set"
          }
          detail={
            financeV2.paydayAllocation
              ? "Flexible spending after priority payday targets"
              : "Add a payday plan to calculate allocation"
          }
          icon={ClipboardList}
          tone="moss"
        />
        <StatCard
          label="Net worth"
          value={formatCurrency(summary.netWorth)}
          detail={`${formatCurrency(summary.totalAssets)} assets less ${formatCurrency(
            summary.totalLiabilities,
          )} liabilities`}
          icon={WalletCards}
          tone={summary.netWorth < 0 ? "berry" : "moss"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Budget health</h2>
              <p className="text-sm text-ink/60">Spend against the active budget period.</p>
            </div>
            <span className="w-fit rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
              {summary.budgetStatus}
            </span>
          </div>
          {dashboard.budgetHealth.length > 0 ? (
            <BudgetHealthChart data={dashboard.budgetHealth} />
          ) : (
            <p className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/65">
              No active budgets are recorded yet.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-ink">Upcoming bills</h2>
            <p className="text-sm text-ink/60">Known commitments before payday.</p>
          </div>
          {dashboard.upcomingBills.length > 0 ? (
            <div className="space-y-3">
              {dashboard.upcomingBills.map((bill) => (
                <div
                  key={`${bill.id}-${bill.dueDate}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-line/80 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{bill.name}</p>
                    <p className="text-xs text-ink/55">
                      {bill.dueDateLabel} - {bill.type}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ink">
                    {formatCurrency(bill.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/65">
              No bills or subscriptions are due before the next payday.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-teal/20 bg-teal/5 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(280px,0.25fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">
              Deterministic next action
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {financeV2.nextBestAction.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
              {financeV2.nextBestAction.description}
            </p>
          </div>
          <div className="rounded-lg border border-teal/20 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Why this comes first</p>
            <p className="mt-2 text-sm text-ink/70">{financeV2.nextBestAction.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/accounts"
                className="inline-flex min-h-10 items-center rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white"
              >
                Review accounts
              </a>
              <a
                href="/manual-entries"
                className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink/70"
              >
                Manual entries
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
