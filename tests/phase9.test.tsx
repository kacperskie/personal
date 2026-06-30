import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMoneyCoachContext } from "../src/lib/ai/context-builder";
import { checkMoneyCoachRateLimit, moneyCoachGuardrails } from "../src/lib/ai/guardrails";
import {
  parseMoneyCoachResponse,
  parseMoneyCoachResponseWithFallback,
} from "../src/lib/ai/prompts";
import { redactFinanceContext, redactSensitiveValue } from "../src/lib/ai/redaction";
import { buildDeterministicMoneyCoachFallback } from "../src/lib/ai/money-coach";
import { createAIInsight } from "../src/lib/repositories/finance-repository";
import { SuggestedPromptList } from "../src/components/ai/money-coach-chat";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("phase 9 AI money coach", () => {
  it("builds required deterministic finance summaries for the AI context", async () => {
    const context = await buildMoneyCoachContext({
      mode: "monthly_review",
      question: "What changed this month?",
    });

    expect(context.cashPosition.safeToSpend).toEqual(expect.any(Number));
    expect(context.cashPosition.billsDueBeforePayday).toBeGreaterThan(0);
    expect(context.accountBalancesByPurpose.length).toBeGreaterThan(0);
    expect(context.budgetUsage.length).toBeGreaterThan(0);
    expect(context.cashflowForecast.projectedSafeToSpend).toEqual(expect.any(Number));
    expect(context.sourceSummary.accounts).toBeGreaterThan(0);
    expect(context.sourceSummary.transactions).toBeGreaterThan(0);
    expect(context.uncertaintyNotes.join(" ")).toContain("deterministic finance engine");
  });

  it("keeps provider tokens and raw provider identifiers out of the context", async () => {
    const context = await buildMoneyCoachContext({
      mode: "cashflow_review",
      question: "Why is safe-to-spend low?",
    });
    const serialised = JSON.stringify(context).toLowerCase();

    expect(serialised).not.toContain("access_token");
    expect(serialised).not.toContain("refresh_token");
    expect(serialised).not.toContain("provideraccountid");
    expect(serialised).not.toContain("provider_account_id");
    expect(serialised).not.toContain("raw_payload");
  });

  it("redacts sensitive fields and long identifiers", () => {
    const redacted = redactSensitiveValue({
      accessToken: "tok_test_123",
      refresh_token: "refresh_secret",
      accountNumber: "123456789012",
      email: "user@example.com",
      nested: { providerConnectionId: "conn_sensitive_123" },
    });
    const serialised = JSON.stringify(redacted);

    expect(serialised).not.toContain("tok_test_123");
    expect(serialised).not.toContain("refresh_secret");
    expect(serialised).not.toContain("123456789012");
    expect(serialised).not.toContain("user@example.com");
    expect(serialised).not.toContain("conn_sensitive_123");
    expect(redactFinanceContext({ provider_token: "abc" })).toEqual({
      provider_token: "[redacted]",
    });
  });

  it("contains explicit financial safety guardrails", () => {
    expect(moneyCoachGuardrails).toContain("deterministic finance engine");
    expect(moneyCoachGuardrails).toContain("Do not provide regulated investment advice");
    expect(moneyCoachGuardrails).toContain("Do not provide pension transfer advice");
    expect(moneyCoachGuardrails).toContain("Do not tell the user to move money automatically");
  });

  it("parses valid structured responses", () => {
    const response = parseMoneyCoachResponse(
      {
        answerSummary: "Safe-to-spend is positive.",
        keyNumbers: [{ label: "Safe-to-spend", value: "GBP 100", source: "engine" }],
        explanation: ["The app calculated this deterministically."],
        assumptions: ["Mock data."],
        risksOrWatchouts: ["No regulated advice."],
        suggestedNextActions: ["Review bills."],
        confidence: "medium",
        dataUsed: {
          accounts: 1,
          transactions: 2,
          budgets: 3,
          bills: 4,
          subscriptions: 5,
          savingsGoals: 6,
          debts: 7,
          manualItems: 8,
          anomalies: 9,
          dateRange: "2026-06-01 to 2026-06-30",
        },
      },
      {
        accounts: 0,
        transactions: 0,
        budgets: 0,
        bills: 0,
        subscriptions: 0,
        savingsGoals: 0,
        debts: 0,
        manualItems: 0,
        anomalies: 0,
        dateRange: "none",
      },
    );

    expect(response.answerSummary).toBe("Safe-to-spend is positive.");
    expect(response.confidence).toBe("medium");
  });

  it("falls back when structured response parsing fails", () => {
    const contextData = {
      accounts: 1,
      transactions: 1,
      budgets: 1,
      bills: 1,
      subscriptions: 1,
      savingsGoals: 1,
      debts: 1,
      manualItems: 1,
      anomalies: 1,
      dateRange: "fallback",
    };
    const fallback = {
      answerSummary: "Fallback",
      keyNumbers: [],
      explanation: [],
      assumptions: [],
      risksOrWatchouts: [],
      suggestedNextActions: [],
      confidence: "low" as const,
      dataUsed: contextData,
    };

    expect(parseMoneyCoachResponseWithFallback({ invalid: true }, fallback)).toBe(fallback);
  });

  it("rejects unauthenticated AI route requests", async () => {
    const { POST } = await import("../src/app/api/ai/money-coach/route");
    const response = await POST(
      new Request("http://localhost/api/ai/money-coach", {
        method: "POST",
        body: JSON.stringify({ question: "What changed?", mode: "monthly_review" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("handles OpenAI not configured with deterministic fallback in the route", async () => {
    vi.doMock("../src/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({
        user: { id: "user_test" },
        supabase: null,
      }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));

    const { POST } = await import("../src/app/api/ai/money-coach/route");
    const response = await POST(
      new Request("http://localhost/api/ai/money-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Build my payday plan.", mode: "payday_plan" }),
      }),
    );
    const payload = (await response.json()) as {
      usedOpenAI: boolean;
      answer: { answerSummary: string };
    };

    expect(response.status).toBe(200);
    expect(payload.usedOpenAI).toBe(false);
    expect(payload.answer.answerSummary).toContain("deterministic");
  });

  it("creates AI insight records through mock fallback storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const insight = await createAIInsight({
      id: "ai_test_001",
      userId: "user_test",
      type: "monthly_review",
      mode: "monthly_review",
      title: "Test insight",
      summary: "A short response summary.",
      evidence: ["Safe-to-spend: GBP 100"],
      assumptions: ["Mock data."],
      nextAction: "Review bills.",
      prompt: "What changed?",
      redactedContextSummary: "{\"safeToSpend\":100}",
      responseSummary: "A short response summary.",
      dataUsed: {
        accounts: 1,
        transactions: 1,
        budgets: 1,
        bills: 1,
        subscriptions: 1,
        savingsGoals: 1,
        debts: 1,
        manualItems: 1,
        anomalies: 1,
        dateRange: "2026-06",
      },
      model: "test-model",
      errorStatus: null,
      status: "active",
      createdAt: "2026-06-30T09:00:00.000Z",
    });

    expect(insight.id).toBe("ai_test_001");
    expect(insight.redactedContextSummary).not.toContain("access_token");
  });

  it("builds deterministic dashboard fallback summaries", async () => {
    const context = await buildMoneyCoachContext({
      mode: "weekly_review",
      question: "Dashboard summary",
    });
    const fallback = buildDeterministicMoneyCoachFallback(context, "weekly_review");

    expect(fallback.answerSummary).toContain("deterministic finance engine");
    expect(fallback.keyNumbers.map((number) => number.label)).toContain("Safe-to-spend");
  });

  it("renders suggested prompts", () => {
    const html = renderToStaticMarkup(<SuggestedPromptList />);

    expect(html).toContain("What changed this month?");
    expect(html).toContain("Build my payday plan.");
    expect(html).toContain("Explain my unusual spending.");
  });

  it("enforces the rate limit placeholder", () => {
    const userId = "rate_limit_phase9_user";

    for (let index = 0; index < 20; index += 1) {
      expect(checkMoneyCoachRateLimit(userId, 1000, 20).allowed).toBe(true);
    }

    expect(checkMoneyCoachRateLimit(userId, 1000, 20).allowed).toBe(false);
  });
});
