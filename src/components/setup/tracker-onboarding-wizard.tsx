"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";

const steps = [
  {
    id: "accounts",
    title: "Accounts and pots",
    description: "List current accounts, credit cards, savings pots, cash, pensions, and offline balances.",
    prompts: ["Main current account", "Bills account", "Everyday spending", "Savings pots"],
  },
  {
    id: "commitments",
    title: "Bills and commitments",
    description: "Move standing orders, Direct Debits, subscriptions, debts, and manual future expenses into structured lists.",
    prompts: ["Rent or mortgage", "Council tax", "Utilities", "Subscriptions"],
  },
  {
    id: "planning",
    title: "Planning rules",
    description: "Set payday, minimum buffer, review dates, and which balances count towards cashflow or net worth.",
    prompts: ["Payday", "Minimum buffer", "Review dates", "Cashflow flags"],
  },
  {
    id: "review",
    title: "Review and connect later",
    description: "Keep live Open Banking disabled until the tracker setup is clean and TrueLayer sandbox testing is ready.",
    prompts: ["Mock data fallback", "TrueLayer sandbox", "No live banking", "No OpenAI by default"],
  },
] as const;

export function TrackerOnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const step = steps[stepIndex];
  const completedCount = useMemo(
    () => steps.filter((item) => completed[item.id]).length,
    [completed],
  );

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">Spreadsheet tracker setup</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
            Use this checklist to translate the old Google Sheets-style tracker into
            Personal Finance HQ structures before enabling any live integrations.
          </p>
        </div>
        <div className="rounded-full bg-paper px-3 py-1 text-sm font-semibold text-ink/70">
          {completedCount} of {steps.length} complete
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Setup steps" className="grid gap-2">
          {steps.map((item, index) => {
            const active = index === stepIndex;
            const done = completed[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                  active
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-paper text-ink/75 hover:border-teal"
                }`}
              >
                <span>{item.title}</span>
                {done ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="rounded-lg border border-line bg-paper p-4">
          <h3 className="text-base font-semibold text-ink">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-ink/70">{step.description}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {step.prompts.map((prompt) => (
              <label
                key={prompt}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink/75"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-line text-teal"
                  aria-label={prompt}
                />
                <span>{prompt}</span>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              disabled={stepIndex === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-45"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  setCompleted((current) => ({ ...current, [step.id]: !current[step.id] }))
                }
                className="inline-flex min-h-11 items-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
              >
                {completed[step.id] ? "Reopen step" : "Mark complete"}
              </button>
              <button
                type="button"
                onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                disabled={stepIndex === steps.length - 1}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
