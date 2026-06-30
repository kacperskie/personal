import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  assertNoSecretValuesInReadinessReport,
  buildSystemReadinessReport,
} from "../src/lib/deployment/readiness";
import {
  clientSafeEnvironmentSummary,
  getFeatureFlags,
  validateDeploymentEnvironment,
} from "../src/lib/deployment/env";
import { createServerLogPayload } from "../src/lib/observability/server-logger";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("phase 11 staging readiness", () => {
  it("builds safe readiness output without secret values", () => {
    const env = {
      NODE_ENV: "production",
      APP_ENV: "staging",
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      URL: "https://staging.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      OPENAI_API_KEY: "openai-secret-value",
      MONEYHUB_CLIENT_ID: "client-id",
      MONEYHUB_CLIENT_SECRET: "moneyhub-secret-value",
      MONEYHUB_REDIRECT_URI: "https://staging.example.com/api/bank-connections/callback",
      MONEYHUB_WEBHOOK_SECRET: "moneyhub-webhook-secret-value",
      WEB_PUSH_VAPID_PUBLIC_KEY: "public-vapid",
      WEB_PUSH_VAPID_PRIVATE_KEY: "private-vapid-secret-value",
      WEB_PUSH_SUBJECT: "mailto:admin@example.com",
      CRON_SECRET: "cron-secret-value",
      NEXT_PUBLIC_APP_BASE_URL: "https://staging.example.com",
      OPEN_BANKING_ENABLED: "true",
      AI_MONEY_COACH_ENABLED: "true",
      WEB_PUSH_ENABLED: "true",
      SCHEDULED_ALERTS_ENABLED: "true",
      MONEYHUB_SANDBOX_ENABLED: "true",
      MOCK_DATA_FALLBACK_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv;
    const report = buildSystemReadinessReport(env);
    const serialised = JSON.stringify(report);

    expect(report.overallStatus).toBe("pass");
    expect(serialised).not.toContain("service-role-secret-value");
    expect(serialised).not.toContain("openai-secret-value");
    expect(serialised).not.toContain("moneyhub-secret-value");
    expect(serialised).not.toContain("private-vapid-secret-value");
    expect(serialised).not.toContain("cron-secret-value");
    expect(assertNoSecretValuesInReadinessReport(report)).toBe(true);
  });

  it("keeps server-only env vars out of client-safe summaries", () => {
    const summary = clientSafeEnvironmentSummary({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      OPENAI_API_KEY: "openai-secret-value",
      WEB_PUSH_VAPID_PRIVATE_KEY: "private-vapid-secret-value",
      CRON_SECRET: "cron-secret-value",
    } as unknown as NodeJS.ProcessEnv);
    const serialised = JSON.stringify(summary);

    expect(serialised).not.toContain("service-role-secret-value");
    expect(serialised).not.toContain("openai-secret-value");
    expect(serialised).not.toContain("private-vapid-secret-value");
    expect(serialised).not.toContain("cron-secret-value");
    expect(summary.mockDataFallbackEnabled).toBe(true);
  });

  it("sets safe feature flag defaults", () => {
    expect(getFeatureFlags({} as NodeJS.ProcessEnv)).toEqual({
      openBankingEnabled: false,
      aiMoneyCoachEnabled: false,
      webPushEnabled: false,
      scheduledAlertsEnabled: false,
      moneyhubSandboxEnabled: false,
      truelayerSandboxEnabled: false,
      mockDataFallbackEnabled: true,
    });
  });

  it("validates staging required variables without throwing", () => {
    const validation = validateDeploymentEnvironment({
      APP_ENV: "staging",
      MOCK_DATA_FALLBACK_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);

    expect(validation.deploymentEnvironment).toBe("staging");
    expect(validation.missingRequiredForStaging).toContain("Supabase URL");
    expect(validation.missingRequiredForStaging).toContain("Cron secret");
  });

  it("keeps scheduled route protection closed without a valid secret", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    const { GET } = await import("../src/app/api/notifications/scheduled/route");
    const response = await GET(new Request("http://localhost/api/notifications/scheduled"));

    expect(response.status).toBe(401);
  });

  it("keeps push, AI and Moneyhub start routes protected", async () => {
    const [{ POST: pushSubscribe }, { POST: aiCoach }, { POST: moneyhubStart }] =
      await Promise.all([
        import("../src/app/api/notifications/push/subscribe/route"),
        import("../src/app/api/ai/money-coach/route"),
        import("../src/app/api/bank-connections/start/route"),
      ]);

    const pushResponse = await pushSubscribe(
      new Request("http://localhost/api/notifications/push/subscribe", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    const aiResponse = await aiCoach(
      new Request("http://localhost/api/ai/money-coach", {
        method: "POST",
        body: JSON.stringify({ question: "What changed?" }),
      }),
    );
    const moneyhubResponse = await moneyhubStart(
      new Request("http://localhost/api/bank-connections/start", {
        method: "POST",
        body: JSON.stringify({ provider: "moneyhub" }),
      }),
    );

    expect(pushResponse.status).toBe(401);
    expect(aiResponse.status).toBe(401);
    expect(moneyhubResponse.status).toBe(401);
  });

  it("keeps RLS migration coverage for user-owned tables", () => {
    const migrationText = fs
      .readdirSync(path.resolve("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .map((file) => fs.readFileSync(path.resolve("supabase/migrations", file), "utf8"))
      .join("\n")
      .toLowerCase();

    for (const table of [
      "accounts",
      "transactions",
      "manual_finance_items",
      "app_notifications",
      "push_subscriptions",
      "notification_delivery_attempts",
      "ai_insights",
    ]) {
      expect(migrationText).toContain(`public.${table}`);
      expect(migrationText).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migrationText).toContain("auth.uid() = user_id");
  });

  it("does not render known secret env names in client page source", () => {
    const sourceFiles = [
      "src/app/settings/page.tsx",
      "src/app/settings/system-readiness/page.tsx",
      "src/components/notifications/notification-preferences-manager.tsx",
      "src/components/ai/money-coach-chat.tsx",
    ];
    const source = sourceFiles
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n");

    for (const secretName of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY",
      "MONEYHUB_CLIENT_SECRET",
      "WEB_PUSH_VAPID_PRIVATE_KEY",
      "CRON_SECRET",
    ]) {
      expect(source).not.toContain(secretName);
    }
  });

  it("keeps required staging docs and PWA files", () => {
    for (const file of [
      "docs/staging-smoke-test.md",
      "docs/security-checklist.md",
      "docs/deployment-checklist.md",
      "public/manifest.webmanifest",
      "public/sw.js",
      "public/offline.html",
    ]) {
      expect(fs.existsSync(path.resolve(file))).toBe(true);
    }
  });

  it("redacts structured server logs", () => {
    const payload = createServerLogPayload({
      level: "error",
      event: "provider_sync_event",
      message: "Provider sync failed",
      metadata: {
        accessToken: "secret-token",
        raw_payload: { accountNumber: "123456789" },
        provider: "moneyhub",
      },
    });
    const serialised = JSON.stringify(payload);

    expect(serialised).toContain("moneyhub");
    expect(serialised).not.toContain("secret-token");
    expect(serialised).not.toContain("123456789");
  });
});
