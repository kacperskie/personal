import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { savingsGoals } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Savings pots"
        title="Goals"
        description="Mock savings goals with target dates and contribution prompts."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {savingsGoals.map((goal) => {
          const progress = goal.progress.progressRatio;

          return (
            <article
              key={goal.id}
              className="rounded-lg border border-line bg-white p-5 shadow-panel"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">{goal.name}</h2>
                  <p className="mt-1 text-sm text-ink/60">
                    Target by {goal.targetDate} - {goal.priority} priority
                  </p>
                </div>
                <p className="text-right text-sm font-semibold text-ink">
                  {formatCurrency(goal.currentAmount)}
                  <span className="block text-xs font-normal text-ink/50">
                    of {formatCurrency(goal.targetAmount)}
                  </span>
                </p>
              </div>
              <div className="mt-5">
                <ProgressBar value={progress} label={goal.name} />
              </div>
              <p className="mt-5 text-sm text-ink/70">
                Remaining:{" "}
                <span className="font-semibold text-ink">
                  {formatCurrency(goal.progress.remainingAmount)}
                </span>
                .{" "}
                Suggested contribution:{" "}
                <span className="font-semibold text-ink">
                  {formatCurrency(goal.suggestedMonthlyContribution)}
                </span>{" "}
                per month.
              </p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
