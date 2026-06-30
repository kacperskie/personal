import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusPill } from "@/components/status-pill";
import { budgetHealth } from "@/lib/mock-data";
import { formatCurrency, formatPercent } from "@/lib/format";

export default function BudgetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monthly plan"
        title="Budgets"
        description="Mock category budgets with pace, remaining spend, and forecast notes."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {budgetHealth.map((budget) => {
          const spendRatio = budget.budget === 0 ? 0 : budget.spent / budget.budget;

          return (
            <article
              key={budget.category}
              className="rounded-lg border border-line bg-white p-5 shadow-panel"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">{budget.category}</h2>
                  <p className="mt-1 text-sm text-ink/60">
                    {formatCurrency(budget.spent)} spent of {formatCurrency(budget.budget)}
                  </p>
                </div>
                <StatusPill label={budget.status} tone={budget.tone} />
              </div>
              <div className="mt-5">
                <ProgressBar value={Math.min(spendRatio, 1)} label={budget.category} />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-ink/50">Remaining</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatCurrency(budget.remaining)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Pace</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatPercent(budget.paceRatio)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Forecast</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatCurrency(budget.forecast)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>
    </div>
  );
}
