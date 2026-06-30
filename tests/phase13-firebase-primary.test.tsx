import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBackendProvider,
  isFirebaseBackend,
  isMockBackend,
  supportedBackendProviders,
} from "../src/lib/backend/provider";
import { getFirebaseAdminEnv } from "../src/lib/firebase/env";
import {
  getFeatureFlags,
  validateDeploymentEnvironment,
} from "../src/lib/deployment/env";
import {
  assertNoSecretValuesInReadinessReport,
  buildSystemReadinessReport,
} from "../src/lib/deployment/readiness";
import { getPaydayPlans } from "../src/lib/repositories/finance-v2-repository";
import { mockPaydayPlans } from "../src/lib/mock-data";
import SignInPage from "../src/app/sign-in/page";

const firebaseEnv = {
  BACKEND_PROVIDER: "firebase",
  NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-public-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "finance-hq.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
  NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
  FIREBASE_PROJECT_ID: "finance-hq",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nfirebase-secret\\n-----END PRIVATE KEY-----\\n",
  APP_BASE_URL: "https://finance-hq-staging.netlify.app",
  CRON_SECRET: "cron-secret-value",
} as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 13 Firebase primary backend", () => {
  it("supports only firebase and mock backend providers", () => {
    expect(supportedBackendProviders).toEqual(["firebase", "mock"]);
    expect(getBackendProvider({ BACKEND_PROVIDER: "firebase" } as unknown as NodeJS.ProcessEnv)).toBe(
      "firebase",
    );
    expect(getBackendProvider({ BACKEND_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv)).toBe("mock");
  });

  it("degrades a removed supabase selection to mock", () => {
    expect(
      getBackendProvider({ BACKEND_PROVIDER: "supabase" } as unknown as NodeJS.ProcessEnv),
    ).toBe("mock");
    expect(isMockBackend({ BACKEND_PROVIDER: "supabase" } as unknown as NodeJS.ProcessEnv)).toBe(
      true,
    );
  });

  it("chooses firebase when BACKEND_PROVIDER=firebase", () => {
    expect(isFirebaseBackend(firebaseEnv)).toBe(true);
    expect(isMockBackend(firebaseEnv)).toBe(false);
  });

  it("chooses mock when BACKEND_PROVIDER=mock", () => {
    expect(isFirebaseBackend({ BACKEND_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isMockBackend({ BACKEND_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("normalises the Firebase private key newlines without exposing the secret", () => {
    const admin = getFirebaseAdminEnv(firebaseEnv);
    expect(admin?.privateKey).toContain("\nfirebase-secret\n");
    expect(admin?.privateKey).not.toContain("\\nfirebase-secret\\n");
  });

  it("builds Firebase readiness with no primary Supabase failure", () => {
    const report = buildSystemReadinessReport(firebaseEnv);
    const serialised = JSON.stringify(report);

    expect(report.overallStatus).not.toBe("fail");
    expect(report.checks.some((entry) => entry.label.includes("Supabase"))).toBe(false);
    expect(report.checks.find((entry) => entry.id === "backend_provider")?.status).toBe("pass");
    expect(report.checks.find((entry) => entry.id === "firestore")?.status).toBe("pass");
    expect(serialised).not.toContain("firebase-secret");
    expect(serialised).not.toContain("cron-secret-value");
    expect(assertNoSecretValuesInReadinessReport(report)).toBe(true);
  });

  it("builds mock readiness without failing on a missing Supabase", () => {
    const report = buildSystemReadinessReport({
      BACKEND_PROVIDER: "mock",
      MOCK_DATA_FALLBACK_ENABLED: "true",
      APP_BASE_URL: "https://demo.example.com",
      CRON_SECRET: "cron-secret-value",
    } as unknown as NodeJS.ProcessEnv);

    expect(report.checks.some((entry) => entry.label.includes("Supabase"))).toBe(false);
    expect(report.checks.find((entry) => entry.id === "mock_fallback")?.status).toBe("pass");
  });

  it("keeps optional integrations disabled by default", () => {
    const flags = getFeatureFlags({} as unknown as NodeJS.ProcessEnv);
    expect(flags.truelayerSandboxEnabled).toBe(false);
    expect(flags.aiMoneyCoachEnabled).toBe(false);
    expect(flags.openBankingEnabled).toBe(false);
    expect(flags.webPushEnabled).toBe(false);

    const validation = validateDeploymentEnvironment(firebaseEnv);
    expect(validation.serverOnly.openAiConfigured).toBe(false);
    expect(validation.featureFlags.truelayerSandboxEnabled).toBe(false);
  });

  it("renders Firebase sign-in copy when Firebase is selected", () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "firebase-public-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "finance-hq.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "finance-hq");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "firebase-app-id");

    const html = renderToStaticMarkup(<SignInPage />);

    expect(html).toContain("Firebase authentication is used when Firebase is configured.");
    expect(html).not.toContain("Supabase");
    expect(html).not.toContain("magic link");
  });

  it("renders a mock-mode explanation when BACKEND_PROVIDER=mock", () => {
    vi.stubEnv("BACKEND_PROVIDER", "mock");

    const html = renderToStaticMarkup(<SignInPage />);

    expect(html).toContain("Mock mode is active");
    expect(html).not.toContain("Supabase");
  });

  it("selects mock repository data when not on Firebase", async () => {
    vi.stubEnv("BACKEND_PROVIDER", "mock");
    const plans = await getPaydayPlans();
    expect(plans).toEqual(mockPaydayPlans);
    expect(plans.length).toBeGreaterThan(0);
  });
});
