import {
  Banknote,
  CalendarClock,
  Landmark,
  PiggyBank,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { BudgetHealthChart } from "@/components/budget-health-chart";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { budgetHealth, dashboardSummary, upcomingBills } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mock dashboard"
        title="Dashboard"
        description="A calm first view of cash, commitments, and budget health using seeded demo figures only."
      />

      <section
        aria-label="Key finance metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="Current cash"
          value={formatCurrency(dashboardSummary.currentCash)}
          detail="Across mock current and savings accounts"
          icon={Banknote}
          tone="teal"
        />
        <StatCard
          label="Safe to spend"
          value={formatCurrency(dashboardSummary.safeToSpend)}
          detail="After bills, savings, debt, goals, and buffer"
          icon={PiggyBank}
          tone="moss"
        />
        <StatCard
          label="Bills due before payday"
          value={formatCurrency(dashboardSummary.billsDueBeforePayday)}
          detail={`Next payday: ${dashboardSummary.nextPayday}`}
          icon={CalendarClock}
          tone="saffron"
        />
        <StatCard
          label="Monthly income"
          value={formatCurrency(dashboardSummary.monthlyIncome)}
          detail="Mock salary and regular income"
          icon={TrendingUp}
          tone="teal"
        />
        <StatCard
          label="Monthly spending"
          value={formatCurrency(dashboardSummary.monthlySpending)}
          detail="Reviewed card and current account spending"
          icon={TrendingDown}
          tone="berry"
        />
        <StatCard
          label="Projected month-end balance"
          value={formatCurrency(dashboardSummary.projectedMonthEndBalance)}
          detail="Forecast from known mock commitments"
          icon={Landmark}
          tone="moss"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Budget health</h2>
              <p className="text-sm text-ink/60">
                Spend against the current mock monthly budget.
              </p>
            </div>
            <span className="w-fit rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
              {dashboardSummary.budgetStatus}
            </span>
          </div>
          <BudgetHealthChart data={budgetHealth} />
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-ink">Upcoming bills</h2>
            <p className="text-sm text-ink/60">
              Confirmed mock commitments before payday.
            </p>
          </div>
          <div className="space-y-3">
            {upcomingBills.map((bill) => (
              <div
                key={`${bill.name}-${bill.dueDate}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-line/80 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{bill.name}</p>
                  <p className="text-xs text-ink/55">
                    {bill.dueDate} · {bill.type}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink">
                  {formatCurrency(bill.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-teal/20 bg-teal/5 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(280px,0.25fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal">
              AI money coach summary
            </p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Spending is on track, but two flexible categories need review.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
              Based on the mock data, safe-to-spend remains positive after bills,
              planned savings, debt payments, and the minimum buffer. Eating out and
              personal spending are running ahead of pace, so the practical next step
              is to cap discretionary spend until payday.
            </p>
          </div>
          <div className="rounded-lg border border-teal/20 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Next action</p>
            <p className="mt-2 text-sm text-ink/70">
              Review the last 7 days of flexible spending before changing any budget.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
