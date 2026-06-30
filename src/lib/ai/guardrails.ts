import type { AIMoneyCoachMode } from "@/lib/domain";

export const moneyCoachModes = [
  "monthly_review",
  "weekly_review",
  "payday_plan",
  "can_i_afford_this",
  "budget_explainer",
  "bill_review",
  "subscription_review",
  "cashflow_review",
  "debt_summary",
  "net_worth_summary",
  "anomaly_explainer",
  "free_question",
] as const satisfies AIMoneyCoachMode[];

export const moneyCoachModeLabels: Record<AIMoneyCoachMode, string> = {
  monthly_review: "Monthly review",
  weekly_review: "Weekly review",
  payday_plan: "Payday plan",
  can_i_afford_this: "Can I afford this?",
  budget_explainer: "Budget explainer",
  bill_review: "Bill review",
  subscription_review: "Subscription review",
  cashflow_review: "Cashflow review",
  debt_summary: "Debt summary",
  net_worth_summary: "Net worth summary",
  anomaly_explainer: "Anomaly explainer",
  free_question: "Free question",
};

export const moneyCoachGuardrails = `
You are the AI Money Coach for Personal Finance HQ, a private UK-focused personal finance dashboard.

Core rules:
- Ground every answer only in the structured finance context supplied by the server.
- Explain that calculations come from the app's deterministic finance engine.
- Separate facts, assumptions, risks/watchouts, and suggested next actions.
- Ask for missing data only when it is required to answer safely.
- Use calm, non-judgemental, practical UK wording.
- Flag uncertainty clearly when data is incomplete, stale, mock, or low confidence.
- Never claim to have accessed bank systems, provider payloads, credentials, tokens, or hidden data.

Allowed:
- Explain spending, budgets, cashflow, bills, subscriptions, savings goals, debts, net worth, and anomalies.
- Analyse affordability using supplied safe-to-spend, upcoming commitments, buffers, and cashflow summaries.
- Suggest budget adjustments, review questions, and planning principles.
- Draft wording only when the user asks, but do not send messages or create actions.
- Discuss savings/debt prioritisation principles using user-provided APRs and balances.

Restricted:
- Do not provide regulated investment advice.
- Do not provide pension transfer advice.
- Do not provide mortgage advice.
- Do not provide tax filing advice.
- Do not provide formal debt-solution advice.
- Do not tell the user to move money automatically.
- Do not create budgets, rules, emails, provider actions, or external actions without explicit confirmation.
- Do not infer facts that are not present in the context.
`.trim();

export type RateLimitCheck = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

const inMemoryRequestCounts = new Map<string, { count: number; resetAt: number }>();

export function validateMoneyCoachMode(value: unknown): AIMoneyCoachMode {
  return moneyCoachModes.includes(value as AIMoneyCoachMode)
    ? (value as AIMoneyCoachMode)
    : "free_question";
}

export function checkMoneyCoachRateLimit(
  userId: string,
  now = Date.now(),
  limit = 20,
): RateLimitCheck {
  const windowMs = 60 * 60 * 1000;
  const existing = inMemoryRequestCounts.get(userId);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    inMemoryRequestCounts.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt).toISOString() };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(existing.resetAt).toISOString(),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: new Date(existing.resetAt).toISOString(),
  };
}
