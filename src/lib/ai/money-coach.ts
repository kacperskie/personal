import type {
  AIMoneyCoachMode,
  AIMoneyCoachResponse,
  AIInsight,
  AppNotification,
} from "@/lib/domain";
import { buildMoneyCoachContext } from "@/lib/ai/context-builder";
import { getOpenAIClientConfig, createStructuredMoneyCoachResponse } from "@/lib/ai/openai-client";
import { summariseRedactedContext } from "@/lib/ai/redaction";
import { checkMoneyCoachRateLimit } from "@/lib/ai/guardrails";
import { createAIInsight, recordAuditEvent } from "@/lib/repositories/finance-repository";
import { createNotification } from "@/lib/repositories/notification-repository";
import { formatCurrency, formatPercent } from "@/lib/format";

export type MoneyCoachRequest = {
  userId: string;
  question: string;
  mode: AIMoneyCoachMode;
  depth?: "summary" | "deep";
  asOfDate?: string;
};

export type MoneyCoachResult = {
  response: AIMoneyCoachResponse;
  model: string;
  usedOpenAI: boolean;
  insightId: string;
};

function nowIso() {
  return new Date().toISOString();
}

function notificationForMode({
  userId,
  mode,
  insightId,
  failed = false,
  notConfigured = false,
}: {
  userId: string;
  mode: AIMoneyCoachMode;
  insightId: string;
  failed?: boolean;
  notConfigured?: boolean;
}): AppNotification {
  const now = nowIso();
  const type = notConfigured
    ? "openai_not_configured"
    : failed
    ? "ai_review_failed"
    : mode === "monthly_review"
      ? "ai_monthly_review_ready"
      : mode === "payday_plan"
        ? "ai_payday_plan_ready"
        : "payday_planning";

  const title = notConfigured
    ? "OpenAI is not configured"
    : failed
      ? "AI review failed"
      : "Money coach summary ready";
  const body = notConfigured
    ? "The deterministic fallback summary was used because OpenAI is not configured."
    : failed
    ? "The AI money coach could not generate a response."
    : "A grounded money coach response is ready to review.";

  return {
    id: `notif_${type}_${insightId}`,
    userId,
    type,
    severity: failed ? "warning" : "info",
    channel: "in_app",
    title,
    body,
    privacySafeTitle: notConfigured
      ? "Money coach unavailable"
      : failed
        ? "Money coach needs attention"
        : "Money coach review ready",
    privacySafeBody: notConfigured
      ? "The AI coach is not configured yet."
      : failed
      ? "A finance review could not be generated."
      : "A finance review is ready inside the app.",
    actionHref: "/ai-coach",
    entityType: "ai_insight",
    entityId: insightId,
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDeterministicMoneyCoachFallback(
  context: Awaited<ReturnType<typeof buildMoneyCoachContext>>,
  mode: AIMoneyCoachMode,
): AIMoneyCoachResponse {
  const topBudget = [...context.budgetUsage].sort(
    (a, b) => b.usagePercentage - a.usagePercentage,
  )[0];
  const reviewCount =
    context.detectedItemsNeedingReview.bills +
    context.detectedItemsNeedingReview.subscriptions +
    context.detectedItemsNeedingReview.transactionEnrichments;

  return {
    answerSummary:
      mode === "can_i_afford_this"
        ? "Use the safe-to-spend figure as the hard boundary, then check upcoming commitments before deciding."
        : "The deterministic finance engine shows your short-term position from cash, bills, budgets, and review queues.",
    keyNumbers: [
      {
        label: "Safe-to-spend",
        value: formatCurrency(context.cashPosition.safeToSpend),
        source: "deterministic safe-to-spend calculation",
      },
      {
        label: "Bills before payday",
        value: formatCurrency(context.cashPosition.billsDueBeforePayday),
        source: "upcoming bills and subscriptions",
      },
      {
        label: "Review queue",
        value: String(reviewCount),
        source: "detected bills, subscriptions, and transaction enrichments",
      },
    ],
    explanation: [
      `Current cash is ${formatCurrency(context.cashPosition.currentCash)} and safe-to-spend eligible cash is ${formatCurrency(context.cashPosition.safeToSpendEligibleCash)}.`,
      `The app subtracts known bills before payday, planned savings, debt payments, and the minimum buffer of ${formatCurrency(context.userSettings.minimumBuffer)}.`,
      topBudget
        ? `${topBudget.category} is at ${formatPercent(topBudget.usagePercentage)} of its budget.`
        : "No budget usage was available for the current period.",
    ],
    assumptions: [
      "This fallback uses deterministic app calculations only because OpenAI is not configured or was unavailable.",
      ...context.uncertaintyNotes,
    ],
    risksOrWatchouts: [
      context.cashflowForecast.projectedBillsAccountBalance < 0
        ? "The projected bills account balance is below zero before payday."
        : "No bills-account shortfall is projected from the supplied context.",
      "This is coaching and explanation, not regulated financial advice.",
    ],
    suggestedNextActions: [
      "Review detected bills, subscriptions, and transactions that need confirmation.",
      "Check upcoming bills before using discretionary safe-to-spend.",
      "Avoid changing budgets or moving money until you confirm the action yourself.",
    ],
    confidence: context.sourceSummary.transactions > 0 ? "medium" : "low",
    dataUsed: context.sourceSummary,
  };
}

export async function answerMoneyCoachQuestion(
  request: MoneyCoachRequest,
): Promise<MoneyCoachResult> {
  const rateLimit = checkMoneyCoachRateLimit(request.userId);

  if (!rateLimit.allowed) {
    throw new Error(`AI request limit reached until ${rateLimit.resetAt}.`);
  }

  await recordAuditEvent({
    userId: request.userId,
    eventType: "ai_money_coach_requested",
    entity: "ai_insights",
    entityId: null,
    metadata: { mode: request.mode },
  });

  const context = await buildMoneyCoachContext({
    mode: request.mode,
    question: request.question,
    depth: request.depth ?? "summary",
    asOfDate: request.asOfDate,
  });
  const config = getOpenAIClientConfig();
  const fallback = buildDeterministicMoneyCoachFallback(context, request.mode);
  const insightId = `ai_${request.mode}_${Date.now()}`;

  if (!config.configured) {
    await createAIInsightRecord({
      userId: request.userId,
      insightId,
      mode: request.mode,
      question: request.question,
      context,
      response: fallback,
      model: config.model,
      errorStatus: "openai_not_configured",
    });

    await createNotification(
      notificationForMode({
        userId: request.userId,
        mode: request.mode,
        insightId,
        failed: true,
        notConfigured: true,
      }),
    );

    return {
      response: fallback,
      model: config.model,
      usedOpenAI: false,
      insightId,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await createStructuredMoneyCoachResponse({
      question: request.question,
      context,
      fallbackDataUsed: context.sourceSummary,
      signal: controller.signal,
    });

    await createAIInsightRecord({
      userId: request.userId,
      insightId,
      mode: request.mode,
      question: request.question,
      context,
      response,
      model: config.model,
      errorStatus: null,
    });
    await createNotification(
      notificationForMode({ userId: request.userId, mode: request.mode, insightId }),
    );

    return {
      response,
      model: config.model,
      usedOpenAI: true,
      insightId,
    };
  } catch (error) {
    await recordAuditEvent({
      userId: request.userId,
      eventType: "ai_money_coach_failed",
      entity: "ai_insights",
      entityId: insightId,
      metadata: { mode: request.mode, error: error instanceof Error ? error.message : "unknown" },
    });
    await createAIInsightRecord({
      userId: request.userId,
      insightId,
      mode: request.mode,
      question: request.question,
      context,
      response: fallback,
      model: config.model,
      errorStatus: "openai_request_failed",
    });
    await createNotification(
      notificationForMode({ userId: request.userId, mode: request.mode, insightId, failed: true }),
    );

    return {
      response: fallback,
      model: config.model,
      usedOpenAI: false,
      insightId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createAIInsightRecord({
  userId,
  insightId,
  mode,
  question,
  context,
  response,
  model,
  errorStatus,
}: {
  userId: string;
  insightId: string;
  mode: AIMoneyCoachMode;
  question: string;
  context: Awaited<ReturnType<typeof buildMoneyCoachContext>>;
  response: AIMoneyCoachResponse;
  model: string;
  errorStatus: string | null;
}) {
  const insight: AIInsight = {
    id: insightId,
    userId,
    type: mode,
    mode,
    title: response.answerSummary.slice(0, 120),
    summary: response.answerSummary,
    evidence: response.keyNumbers.map((number) => `${number.label}: ${number.value}`),
    assumptions: response.assumptions,
    nextAction: response.suggestedNextActions[0] ?? "",
    prompt: question.slice(0, 500),
    redactedContextSummary: summariseRedactedContext({
      cashPosition: context.cashPosition,
      sourceSummary: context.sourceSummary,
      uncertaintyNotes: context.uncertaintyNotes,
    }),
    responseSummary: response.answerSummary,
    dataUsed: response.dataUsed,
    model,
    errorStatus,
    status: "active",
    createdAt: nowIso(),
  };

  return createAIInsight(insight);
}
