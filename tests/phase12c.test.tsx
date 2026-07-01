import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackerOnboardingWizard } from "../src/components/setup/tracker-onboarding-wizard";
import { getBackendProvider } from "../src/lib/backend/provider";
import {
  getFirebaseAdminEnv,
  getFirebaseBrowserEnv,
  isFirebaseBackendConfigured,
} from "../src/lib/firebase/env";
import {
  clientSafeEnvironmentSummary,
  validateDeploymentEnvironment,
} from "../src/lib/deployment/env";
import { buildSystemReadinessReport } from "../src/lib/deployment/readiness";

describe("phase 12C Firebase Free Mode", () => {
  it("selects only firebase and mock backend providers (supabase removed)", () => {
    expect(getBackendProvider({ BACKEND_PROVIDER: "firebase" } as unknown as NodeJS.ProcessEnv)).toBe(
      "firebase",
    );
    // Supabase is removed from the primary path; it degrades safely to mock.
    expect(getBackendProvider({ BACKEND_PROVIDER: "supabase" } as unknown as NodeJS.ProcessEnv)).toBe(
      "mock",
    );
    expect(getBackendProvider({ BACKEND_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv)).toBe("mock");
    expect(
      getBackendProvider({
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
        NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-public",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("firebase");
  });

  it("validates Firebase browser and Admin env without exposing secret values", () => {
    const env = {
      BACKEND_PROVIDER: "firebase",
      NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-public-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "finance-hq.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
      NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
      FIREBASE_PROJECT_ID: "finance-hq",
      FIREBASE_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----\\n",
    } as unknown as NodeJS.ProcessEnv;

    expect(getFirebaseBrowserEnv(env)?.projectId).toBe("finance-hq");
    expect(getFirebaseAdminEnv(env)?.privateKey).toContain("\nsecret\n");
    expect(isFirebaseBackendConfigured(env)).toBe(true);

    const validation = validateDeploymentEnvironment(env);
    const summary = clientSafeEnvironmentSummary(env);
    const report = buildSystemReadinessReport(env);
    const serialised = JSON.stringify(report);

    expect(validation.backendProvider).toBe("firebase");
    expect(summary.backendProvider).toBe("firebase");
    expect(summary.firebaseConfigured).toBe(true);
    expect(serialised).not.toContain("-----BEGIN PRIVATE KEY-----");
    expect(serialised).not.toContain("\\nsecret\\n");
    expect(serialised).not.toContain("firebase-admin@example");
  });

  it("keeps Firestore rules and Firebase schema documentation present", () => {
    const rules = fs.readFileSync(path.resolve("firebase/firestore.rules"), "utf8");
    const schema = fs.readFileSync(path.resolve("docs/firebase-schema.md"), "utf8");

    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("users/{userId}");
    expect(rules).toContain("match /providerTokens/{connectionId}");
    expect(rules).toContain("allow read, create, update, delete: if false");
    expect(schema).toContain("users/{userId}/accounts/{accountId}");
    expect(schema).toContain("users/{userId}/providerTokens/{connectionId}");
    expect(schema).toContain("BACKEND_PROVIDER=firebase");
  });

  it("documents Netlify plus Firebase as the free deployment path", () => {
    const envExample = fs.readFileSync(path.resolve(".env.example"), "utf8");
    const readme = fs.readFileSync(path.resolve("README.md"), "utf8");
    const netlifyDoc = fs.readFileSync(path.resolve("docs/netlify-deployment.md"), "utf8");
    const agents = fs.readFileSync(path.resolve("AGENTS.md"), "utf8");

    expect(envExample).toContain("BACKEND_PROVIDER=firebase");
    expect(envExample).toContain("OPEN_BANKING_PROVIDER=mock");
    expect(readme).toContain("Firebase Free Mode");
    expect(netlifyDoc).toContain("Netlify + Firebase");
    expect(agents).toContain("BACKEND_PROVIDER=firebase|mock");
  });

  it("renders the spreadsheet tracker onboarding wizard", () => {
    const html = renderToStaticMarkup(<TrackerOnboardingWizard />);

    expect(html).toContain("Spreadsheet tracker setup");
    expect(html).toContain("Accounts and pots");
    expect(html).toContain("Bills and commitments");
    expect(html).toContain("before enabling any live integrations");
  });
});
