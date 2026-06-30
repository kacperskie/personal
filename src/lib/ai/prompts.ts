import type { AIMoneyCoachMode, AIMoneyCoachResponse } from "@/lib/domain";
import type { MoneyCoachFinanceContext } from "@/lib/ai/context-builder";
import { moneyCoachGuardrails, moneyCoachModeLabels } from "@/lib/ai/guardrails";

export const moneyCoachResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answerSummary",
    "keyNumbers",
    "explanation",
    "assumptions",
    "risksOrWatchouts",
    "suggestedNextActions",
    "confidence",
    "dataUsed",
  ],
  properties: {
    answerSummary: { type: "string" },
    keyNumbers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value", "source"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          source: { type: "string" },
        },
      },
    },
    explanation: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    risksOrWatchouts: { type: "array", items: { type: "string" } },
    suggestedNextActions: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    dataUsed: {
      type: "object",
      additionalProperties: false,
      required: [
        "accounts",
        "transactions",
        "budgets",
        "bills",
        "subscriptions",
        "savingsGoals",
        "debts",
        "manualItems",
        "anomalies",
        "dateRange",
      ],
      properties: {
        accounts: { type: "number" },
        transactions: { type: "number" },
        budgets: { type: "number" },
        bills: { type: "number" },
        subscriptions: { type: "number" },
        savingsGoals: { type: "number" },
        debts: { type: "number" },
        manualItems: { type: "number" },
        anomalies: { type: "number" },
        dateRange: { type: "string" },
      },
    },
  },
} as const;

export function buildMoneyCoachSystemPrompt() {
  return `${moneyCoachGuardrails}

Return only JSON matching the supplied schema. Do not include markdown.`;
}

export function buildMoneyCoachUserPrompt({
  question,
  mode,
  context,
}: {
  question: string;
  mode: AIMoneyCoachMode;
  context: MoneyCoachFinanceContext;
}) {
  return JSON.stringify({
    mode,
    modeLabel: moneyCoachModeLabels[mode],
    question,
    financeContext: context,
    responseInstructions: {
      answerSummary: "One concise answer first.",
      keyNumbers: "Use only numbers present in financeContext.",
      explanation: "Explain calculations as deterministic app outputs.",
      assumptions: "List missing or uncertain data.",
      risksOrWatchouts: "Mention regulated advice boundaries when relevant.",
      suggestedNextActions: "Suggest practical actions only; do not perform actions.",
      confidence: "Use low, medium, or high based on data completeness.",
      dataUsed: "Echo financeContext.sourceSummary exactly unless there is a clear reason not to.",
    },
  });
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseMoneyCoachResponse(
  value: unknown,
  fallbackDataUsed: AIMoneyCoachResponse["dataUsed"],
): AIMoneyCoachResponse {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response was not an object.");
  }

  const candidate = parsed as Partial<AIMoneyCoachResponse>;

  if (
    typeof candidate.answerSummary !== "string" ||
    !Array.isArray(candidate.keyNumbers) ||
    !isStringArray(candidate.explanation) ||
    !isStringArray(candidate.assumptions) ||
    !isStringArray(candidate.risksOrWatchouts) ||
    !isStringArray(candidate.suggestedNextActions) ||
    !["low", "medium", "high"].includes(String(candidate.confidence))
  ) {
    throw new Error("AI response did not match the required structure.");
  }

  return {
    answerSummary: candidate.answerSummary,
    keyNumbers: candidate.keyNumbers.map((item) => ({
      label: String(item.label),
      value: String(item.value),
      source: String(item.source),
    })),
    explanation: candidate.explanation,
    assumptions: candidate.assumptions,
    risksOrWatchouts: candidate.risksOrWatchouts,
    suggestedNextActions: candidate.suggestedNextActions,
    confidence: candidate.confidence as AIMoneyCoachResponse["confidence"],
    dataUsed: candidate.dataUsed ?? fallbackDataUsed,
  };
}

export function parseMoneyCoachResponseWithFallback(
  value: unknown,
  fallback: AIMoneyCoachResponse,
): AIMoneyCoachResponse {
  try {
    return parseMoneyCoachResponse(value, fallback.dataUsed);
  } catch {
    return fallback;
  }
}
