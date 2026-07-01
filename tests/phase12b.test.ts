import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectDeploymentPlatform,
  validateDeploymentEnvironment,
} from "../src/lib/deployment/env";
import { buildSystemReadinessReport } from "../src/lib/deployment/readiness";
import {
  invokeProtectedScheduledRoute,
  resolveScheduledBaseUrl,
} from "../netlify/functions/_scheduled-route";
import scheduledNotifications from "../netlify/functions/scheduled-notifications";
import scheduledBankSync from "../netlify/functions/scheduled-bank-sync";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("phase 12B Netlify staging deployment", () => {
  it("keeps Netlify and Vercel deployment config files", () => {
    const netlifyToml = fs.readFileSync(path.resolve("netlify.toml"), "utf8");

    expect(netlifyToml).toContain("npm run build");
    expect(netlifyToml).toContain("@netlify/plugin-nextjs");
    expect(netlifyToml).toContain("netlify/functions");
    expect(fs.existsSync(path.resolve("vercel.json"))).toBe(true);
  });

  it("keeps Netlify scheduled function wrappers present", () => {
    expect(fs.existsSync(path.resolve("netlify/functions/scheduled-notifications.ts"))).toBe(true);
    expect(fs.existsSync(path.resolve("netlify/functions/scheduled-bank-sync.ts"))).toBe(true);
  });

  it("detects Netlify readiness safely without exposing secrets", () => {
    const env = {
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      URL: "https://finance-hq-staging.netlify.app",
      SITE_NAME: "finance-hq-staging",
      BACKEND_PROVIDER: "firebase",
      NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-public-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "finance-hq.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      FIREBASE_PROJECT_ID: "finance-hq",
      FIREBASE_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nfirebase-secret\\n-----END PRIVATE KEY-----\\n",
      CRON_SECRET: "cron-secret-value",
      MOCK_DATA_FALLBACK_ENABLED: "true",
      OPEN_BANKING_PROVIDER: "mock",
    } as unknown as NodeJS.ProcessEnv;
    const validation = validateDeploymentEnvironment(env);
    const report = buildSystemReadinessReport(env);
    const serialised = JSON.stringify(report);

    expect(detectDeploymentPlatform(env)).toBe("netlify");
    expect(validation.deploymentPlatform).toBe("netlify");
    expect(validation.appBaseUrl).toBe("https://finance-hq-staging.netlify.app");
    expect(report.deploymentPlatform).toBe("netlify");
    expect(serialised).not.toContain("service-role-secret-value");
    expect(serialised).not.toContain("cron-secret-value");
  });

  it("resolves Netlify app URLs for scheduled wrappers", () => {
    expect(
      resolveScheduledBaseUrl({
        DEPLOY_PRIME_URL: "finance-hq-preview.netlify.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://finance-hq-preview.netlify.app");
    expect(
      resolveScheduledBaseUrl({
        APP_BASE_URL: "https://finance-hq-staging.netlify.app",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("https://finance-hq-staging.netlify.app");
  });

  it("requires CRON_SECRET before scheduled wrappers call API routes", async () => {
    vi.stubEnv("APP_BASE_URL", "https://finance-hq-staging.netlify.app");

    const result = await invokeProtectedScheduledRoute("/api/notifications/scheduled");

    expect(result.statusCode).toBe(500);
    expect(result.body).toContain("cron_secret_missing");
  });

  it("delegates Netlify scheduled notification and bank sync wrappers to protected API routes", async () => {
    vi.stubEnv("APP_BASE_URL", "https://finance-hq-staging.netlify.app");
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL ? input.toString() : String(input);

      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer cron-secret-value",
        "x-cron-secret": "cron-secret-value",
      });

      return new Response(JSON.stringify({ ok: true, url }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const notificationResult = await scheduledNotifications();
    const bankSyncResult = await scheduledBankSync();

    expect(notificationResult.statusCode).toBe(200);
    expect(bankSyncResult.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://finance-hq-staging.netlify.app/api/notifications/scheduled"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://finance-hq-staging.netlify.app/api/scheduled/bank-sync"),
      expect.any(Object),
    );
  });

  it("keeps Netlify wrappers thin and avoids duplicating scheduled business logic", () => {
    const combined = [
      "netlify/functions/scheduled-notifications.ts",
      "netlify/functions/scheduled-bank-sync.ts",
    ]
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n");

    expect(combined).toContain("invokeProtectedScheduledRoute");
    expect(combined).not.toContain("runScheduledNotificationGeneration");
    expect(combined).not.toContain("runServerConnectionSync");
    expect(combined).not.toContain("processPendingSyncJobs");
  });

  it("documents Netlify as the primary staging path", () => {
    const netlifyDoc = fs.readFileSync(path.resolve("docs/netlify-deployment.md"), "utf8");
    const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
    const checklist = fs.readFileSync(path.resolve("docs/deployment-checklist.md"), "utf8");

    expect(netlifyDoc).toContain("primary staging deployment path");
    expect(netlifyDoc).toContain("TrueLayer");
    expect(netlifyDoc).toContain("Moneyhub");
    expect(readme).toContain("Netlify + Firebase the primary free");
    expect(readme).toContain("Vercel remains supported as a secondary deployment option");
    expect(checklist).toContain("Netlify + Firebase is the primary free staging path");
  });
});
