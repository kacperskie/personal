import { describe, expect, it } from "vitest";
import {
  assertNoSecretValuesInReadinessReport,
  buildSystemReadinessReport,
} from "../src/lib/deployment/readiness";

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

function adminCheck(env: NodeJS.ProcessEnv, status: Parameters<typeof buildSystemReadinessReport>[1]) {
  const report = buildSystemReadinessReport(env, status);
  return {
    admin: report.checks.find((entry) => entry.id === "firebase_admin"),
    firestore: report.checks.find((entry) => entry.id === "firestore"),
    report,
  };
}

describe("Firebase Admin readiness wiring (injected init status)", () => {
  it("marks firebase_admin and firestore as pass when Admin init is available", () => {
    const { admin, firestore } = adminCheck(firebaseEnv, "available");
    expect(admin?.status).toBe("pass");
    expect(firestore?.status).toBe("pass");
    expect(admin?.remediation).toBeNull();
  });

  it("marks firebase_admin and firestore as fail when Admin init is unavailable", () => {
    const { admin, firestore } = adminCheck(firebaseEnv, "unavailable");
    expect(admin?.status).toBe("fail");
    expect(firestore?.status).toBe("fail");
    expect(admin?.safeDetails).toContain("initialisation failed");
  });

  it("falls back to env presence when init status is not tested", () => {
    const { admin } = adminCheck(firebaseEnv, "not_tested");
    // All three Admin env vars are present, so presence-based status is pass.
    expect(admin?.status).toBe("pass");
  });

  it("never leaks secret values regardless of injected init status", () => {
    for (const status of ["available", "unavailable", "not_tested"] as const) {
      const { report } = adminCheck(firebaseEnv, status);
      const serialised = JSON.stringify(report);
      expect(serialised).not.toContain("firebase-secret");
      expect(serialised).not.toContain("cron-secret-value");
      expect(assertNoSecretValuesInReadinessReport(report)).toBe(true);
    }
  });
});
