"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Bot, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { AIMoneyCoachMode, AIMoneyCoachResponse } from "@/lib/domain";
import { moneyCoachModeLabels, moneyCoachModes } from "@/lib/ai/guardrails";

export const suggestedMoneyCoachPrompts = [
  "What changed this month?",
  "Can I afford this?",
  "What bills are coming up?",
  "Why is safe-to-spend low?",
  "Which subscriptions should I review?",
  "What is my biggest money risk before payday?",
  "Build my payday plan.",
  "Summarise my debts.",
  "Explain my unusual spending.",
];

function titleForMode(mode: AIMoneyCoachMode) {
  return moneyCoachModeLabels[mode];
}

function ConfidenceBadge({ confidence }: { confidence: AIMoneyCoachResponse["confidence"] }) {
  const className =
    confidence === "high"
      ? "bg-moss/10 text-moss"
      : confidence === "medium"
        ? "bg-saffron/15 text-ink"
        : "bg-berry/10 text-berry";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {confidence} confidence
    </span>
  );
}

export function SuggestedPromptList({
  onSelect,
}: {
  onSelect?: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestedMoneyCoachPrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect?.(prompt)}
          className="min-h-11 rounded-lg border border-line bg-paper px-3 py-2 text-left text-xs font-semibold text-ink/70 transition hover:border-teal hover:text-ink"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

export function MoneyCoachChat({
  fallback,
}: {
  fallback: AIMoneyCoachResponse;
}) {
  const [question, setQuestion] = useState(suggestedMoneyCoachPrompts[0]);
  const [mode, setMode] = useState<AIMoneyCoachMode>("monthly_review");
  const [response, setResponse] = useState<AIMoneyCoachResponse>(fallback);
  const [error, setError] = useState<string | null>(null);
  const [usedOpenAI, setUsedOpenAI] = useState(false);
  const [isPending, startTransition] = useTransition();

  function askCoach() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fetch("/api/ai/money-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, mode }),
        });
        const payload = (await result.json()) as {
          answer?: AIMoneyCoachResponse;
          usedOpenAI?: boolean;
          error?: { message?: string };
        };

        if (!result.ok || !payload.answer) {
          throw new Error(payload.error?.message ?? "The money coach could not answer.");
        }

        setResponse(payload.answer);
        setUsedOpenAI(Boolean(payload.usedOpenAI));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The money coach is unavailable.");
        setResponse(fallback);
        setUsedOpenAI(false);
      }
    });
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,0.66fr)_minmax(320px,0.34fr)]">
      <div className="space-y-4 rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">Money coach</h2>
            <p className="text-sm text-ink/60">
              {usedOpenAI
                ? "OpenAI response grounded in server-built finance context."
                : "Deterministic fallback shown until OpenAI is configured and you are signed in."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
          <label className="text-sm font-semibold text-ink">
            Mode
            <select
              className="mt-2 min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none"
              value={mode}
              onChange={(event) => setMode(event.target.value as AIMoneyCoachMode)}
            >
              {moneyCoachModes.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {titleForMode(candidate)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-ink">
            Question
            <textarea
              className="mt-2 min-h-24 w-full rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-teal"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={askCoach}
            disabled={isPending || question.trim().length < 3}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Ask
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink/60">
            <ShieldCheck className="h-4 w-4 text-moss" aria-hidden="true" />
            Server-side context, deterministic calculations
          </div>
        </div>

        {error ? (
          <div className="flex gap-3 rounded-lg border border-saffron/40 bg-saffron/10 p-4 text-sm text-ink/75">
            <AlertTriangle className="h-5 w-5 shrink-0 text-saffron" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="rounded-lg border border-teal/20 bg-teal/5 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                Response
              </p>
              <h3 className="mt-2 text-xl font-semibold text-ink">
                {response.answerSummary}
              </h3>
            </div>
            <ConfidenceBadge confidence={response.confidence} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {response.keyNumbers.map((number) => (
              <div key={`${number.label}-${number.value}`} className="rounded-lg bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  {number.label}
                </p>
                <p className="mt-2 text-lg font-semibold text-ink">{number.value}</p>
                <p className="mt-1 text-xs text-ink/55">{number.source}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ResponseList title="Explanation" items={response.explanation} />
            <ResponseList title="Assumptions" items={response.assumptions} />
            <ResponseList title="Risks or watchouts" items={response.risksOrWatchouts} />
            <ResponseList title="Suggested next actions" items={response.suggestedNextActions} />
          </div>

          <div className="mt-5 rounded-lg border border-line bg-white p-4">
            <p className="text-sm font-semibold text-ink">Data used</p>
            <p className="mt-2 text-sm text-ink/65">
              {response.dataUsed.accounts} accounts, {response.dataUsed.transactions} transactions,{" "}
              {response.dataUsed.budgets} budgets, {response.dataUsed.bills} bills,{" "}
              {response.dataUsed.subscriptions} subscriptions, {response.dataUsed.anomalies} anomalies.
            </p>
            <p className="mt-1 text-xs text-ink/55">{response.dataUsed.dateRange}</p>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Sparkles className="h-5 w-5 text-saffron" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-ink">Suggested prompts</h2>
          <div className="mt-4">
            <SuggestedPromptList onSelect={setQuestion} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ShieldCheck className="h-5 w-5 text-moss" aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-ink">Guardrails</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            The coach explains deterministic app calculations and does not move money,
            connect accounts, create rules, or provide regulated investment, pension,
            mortgage, tax filing, or formal debt-solution advice.
          </p>
        </div>
      </aside>
    </section>
  );
}

function ResponseList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/70">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
