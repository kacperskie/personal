import "server-only";

import {
  getOpenBankingProvider,
  getTrueLayerSandboxReadiness,
} from "@/lib/bank-providers/provider-config";
import { getClientWebPushConfig } from "@/lib/notifications/web-push";
import { validateDeploymentEnvironment } from "@/lib/deployment/env";
import { isFirebasePrivateKeyMalformed } from "@/lib/firebase/env";
import type { FirebaseAdminInitialisationStatus } from "@/lib/firebase/admin-diagnostics";

export type ReadinessStatus = "pass" | "warning" | "fail";

export type ReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  safeDetails: string;
  remediation: string | null;
};

export type SystemReadinessReport = {
  generatedAt: string;
  environment: string;
  deploymentPlatform: string;
  overallStatus: ReadinessStatus;
  checks: ReadinessCheck[];
};

function statusFromConfigured(configured: boolean, optional = false): ReadinessStatus {
  if (configured) {
    return "pass";
  }

  return optional ? "warning" : "fail";
}

function check(
  id: string,
  label: string,
  status: ReadinessStatus,
  safeDetails: string,
  remediation: string | null = null,
): ReadinessCheck {
  return { id, label, status, safeDetails, remediation };
}

export function buildSystemReadinessReport(
  env: NodeJS.ProcessEnv = process.env,
  adminInitStatus: FirebaseAdminInitialisationStatus = "not_tested",
): SystemReadinessReport {
  const validation = validateDeploymentEnvironment(env);
  const webPush = getClientWebPushConfig(env);
  const truelayerReadiness = getTrueLayerSandboxReadiness(env);
  const flags = validation.featureFlags;
  const firebaseClientConfigured =
    validation.publicClientSafe.firebaseApiKeyConfigured &&
    validation.publicClientSafe.firebaseAuthDomainConfigured &&
    validation.publicClientSafe.firebaseProjectIdConfigured &&
    validation.publicClientSafe.firebaseAppIdConfigured;
  const firebaseSelected = validation.backendProvider === "firebase";
  const mockSelected = validation.backendProvider === "mock";
  const firebasePrivateKeyMalformed = isFirebasePrivateKeyMalformed(env);
  // When the caller supplies a real Firebase Admin initialisation result, drive
  // the admin/firestore checks off it instead of mere env-var presence. This is
  // how a green readiness page can still catch a key that parses past the PEM
  // header check but fails actual `initializeApp`. "not_tested" keeps the prior
  // presence-based behaviour so pure/synchronous callers are unchanged.
  const firebaseAdminStatus: ReadinessStatus = !firebaseSelected
    ? "pass"
    : firebasePrivateKeyMalformed
      ? "warning"
      : adminInitStatus === "available"
        ? "pass"
        : adminInitStatus === "unavailable"
          ? "fail"
          : statusFromConfigured(validation.serverOnly.firebaseAdminConfigured);
  const firestoreStatus: ReadinessStatus = !firebaseSelected
    ? "pass"
    : adminInitStatus === "available"
      ? "pass"
      : adminInitStatus === "unavailable"
        ? "fail"
        : statusFromConfigured(validation.serverOnly.firebaseAdminConfigured);
  const trueLayerSelected = env.OPEN_BANKING_PROVIDER === "truelayer";
  const selectedProvider = getOpenBankingProvider(env);
  const selectedProviderConfigured =
    selectedProvider === "moneyhub"
      ? validation.serverOnly.moneyhubSandboxConfigured
      : selectedProvider === "truelayer"
        ? validation.serverOnly.truelayerSandboxConfigured
        : selectedProvider === "mock";
  const checks: ReadinessCheck[] = [
    check(
      "deployment_platform",
      "Deployment platform",
      validation.deploymentPlatform === "unknown" ? "warning" : "pass",
      validation.deploymentPlatform === "netlify"
        ? `Netlify staging detected${validation.netlify.context ? ` for ${validation.netlify.context}` : ""}.`
        : validation.deploymentPlatform === "vercel"
          ? "Vercel deployment detected. Vercel remains supported as a secondary option."
          : validation.deploymentPlatform === "local"
            ? "Local development environment detected."
            : "Deployment platform could not be identified.",
      validation.deploymentPlatform === "unknown"
        ? "Set Netlify or Vercel deployment environment variables."
        : null,
    ),
    check(
      "backend_provider",
      "Backend provider",
      validation.backendProvider === "mock" ? "warning" : "pass",
      validation.backendProvider === "firebase"
        ? "Firebase is selected as the primary free backend."
        : "Mock backend is selected; no persistent backend is required.",
      validation.backendProvider === "mock"
        ? "Set BACKEND_PROVIDER=firebase for the Netlify free staging path."
        : null,
    ),
    check(
      "firebase_client",
      "Firebase browser client",
      firebaseSelected ? statusFromConfigured(firebaseClientConfigured) : "pass",
      firebaseClientConfigured
        ? "Firebase public web app configuration is present."
        : "Missing; Firebase Auth and Firestore browser clients cannot initialise.",
      firebaseSelected
        ? "Set NEXT_PUBLIC_FIREBASE_API_KEY, AUTH_DOMAIN, PROJECT_ID, and APP_ID."
        : null,
    ),
    check(
      "firebase_admin",
      "Firebase Admin server setup",
      firebaseAdminStatus,
      firebasePrivateKeyMalformed
        ? "A FIREBASE_PRIVATE_KEY is set but does not look like a PEM key; check for missing newlines or stray quotes."
        : adminInitStatus === "available"
          ? "Firebase Admin credentials are configured and initialise successfully."
          : adminInitStatus === "unavailable"
            ? "Firebase Admin credentials are present but initialisation failed; session cookies cannot be created. Check the private key formatting and service account."
            : validation.serverOnly.firebaseAdminConfigured
              ? "Firebase Admin credentials are configured server-side."
              : "Missing; Firebase session verification and server Firestore writes are unavailable.",
      firebaseSelected
        ? firebasePrivateKeyMalformed
          ? "Re-paste FIREBASE_PRIVATE_KEY with escaped \\n newlines and no surrounding quotes."
          : adminInitStatus === "unavailable"
            ? "Re-check FIREBASE_PRIVATE_KEY newlines/quoting and that the service account matches the project."
            : adminInitStatus === "available"
              ? null
              : "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY server-side."
        : null,
    ),
    check(
      "firestore",
      "Firestore readiness",
      firestoreStatus,
      firebaseSelected
        ? adminInitStatus === "available"
          ? "Firestore is reachable via Firebase Admin for server reads and writes."
          : adminInitStatus === "unavailable"
            ? "Firestore is unavailable because Firebase Admin failed to initialise."
            : validation.serverOnly.firebaseAdminConfigured
              ? "Firestore is reachable via Firebase Admin for server reads and writes."
              : "Firestore is unavailable until Firebase Admin credentials are configured."
        : "Mock backend selected; Firestore is not required.",
      firebaseSelected && firestoreStatus !== "pass"
        ? "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY server-side."
        : null,
    ),
    check(
      "mock_fallback",
      "Mock fallback status",
      "pass",
      flags.mockDataFallbackEnabled
        ? mockSelected
          ? "Mock data mode is active; the app runs without a backend."
          : "Mock fallback is enabled and available if the backend is unconfigured."
        : "Mock fallback is disabled; a configured backend is required.",
      null,
    ),
    check(
      "openai",
      "OpenAI Money Coach",
      statusFromConfigured(validation.serverOnly.openAiConfigured, !flags.aiMoneyCoachEnabled),
      validation.serverOnly.openAiConfigured
        ? "Configured server-side."
        : "Not configured; deterministic fallback remains available.",
      flags.aiMoneyCoachEnabled ? "Set the OpenAI API key server-side or disable AI." : null,
    ),
    check(
      "moneyhub",
      "Moneyhub sandbox",
      statusFromConfigured(
        validation.serverOnly.moneyhubSandboxConfigured,
        !flags.moneyhubSandboxEnabled && !flags.openBankingEnabled,
      ),
      validation.serverOnly.moneyhubSandboxConfigured
        ? "Sandbox configuration appears present."
        : "Not fully configured; mock provider fallback remains available.",
      flags.moneyhubSandboxEnabled || flags.openBankingEnabled
        ? "Set Moneyhub sandbox client, redirect, and webhook configuration."
        : null,
    ),
    check(
      "open_banking_provider",
      "Open Banking provider",
      selectedProviderConfigured ||
        (!flags.openBankingEnabled &&
          !flags.moneyhubSandboxEnabled &&
          !flags.truelayerSandboxEnabled)
        ? "pass"
        : "fail",
      selectedProvider === "mock"
        ? "Mock provider selected; no banking APIs are called."
        : selectedProviderConfigured
          ? `${selectedProvider} sandbox configuration appears present.`
          : `${selectedProvider} sandbox is selected but not fully configured.`,
      selectedProviderConfigured
        ? null
        : "Set the selected provider sandbox variables or switch to mock.",
    ),
    check(
      "truelayer",
      "TrueLayer sandbox",
      trueLayerSelected
        ? statusFromConfigured(validation.serverOnly.truelayerSandboxConfigured)
        : "pass",
      validation.serverOnly.truelayerSandboxConfigured
        ? "Sandbox configuration appears present."
        : "Not fully configured; mock provider fallback remains available.",
      trueLayerSelected
        ? "Set TrueLayer sandbox client, redirect, scope, and webhook configuration."
        : null,
    ),
    check(
      "truelayer_webhook",
      "TrueLayer webhook secret",
      trueLayerSelected
        ? statusFromConfigured(truelayerReadiness.webhookSecretConfigured)
        : "pass",
      truelayerReadiness.webhookSecretConfigured
        ? "Configured server-side for sandbox webhook validation."
        : "Missing; TrueLayer webhook route rejects non-stub signatures.",
      trueLayerSelected ? "Set the TrueLayer webhook secret server-side." : null,
    ),
    check(
      "web_push",
      "Web Push VAPID keys",
      statusFromConfigured(
        webPush.configured && validation.serverOnly.webPushPrivateKeyConfigured,
        !flags.webPushEnabled,
      ),
      webPush.configured && validation.serverOnly.webPushPrivateKeyConfigured
        ? "Public key and server-only private key are configured."
        : "Push is not fully configured; in-app notifications remain available.",
      flags.webPushEnabled ? "Set VAPID public key, private key, and subject." : null,
    ),
    check(
      "cron_secret",
      "Cron secret",
      statusFromConfigured(validation.serverOnly.cronSecretConfigured),
      validation.serverOnly.cronSecretConfigured
        ? "Scheduled routes can validate cron callers."
        : "Scheduled routes reject requests because no secret is configured.",
      "Set a strong cron secret in deployment variables.",
    ),
    check(
      "app_base_url",
      "Application base URL",
      statusFromConfigured(Boolean(validation.appBaseUrl)),
      validation.appBaseUrl
        ? "Configured for redirects and callback URL checks."
        : "Missing; staging redirect and webhook URL checks need a base URL.",
      "Set the staging app base URL.",
    ),
    check(
      "auth_redirects",
      "Auth redirect URLs",
      statusFromConfigured(
        Boolean(
          validation.appBaseUrl &&
            (firebaseSelected ? firebaseClientConfigured : true),
        ),
      ),
      validation.appBaseUrl
        ? firebaseSelected
          ? "Ready to configure in Firebase authorized domains and provider settings."
          : "Mock mode requires no auth redirect configuration."
        : "Cannot verify until the staging base URL is set.",
      firebaseSelected
        ? "Add the Netlify domain to Firebase Auth authorized domains."
        : null,
    ),
    check(
      "webhook_urls",
      "Webhook URLs",
      statusFromConfigured(
        Boolean(
          validation.appBaseUrl &&
            (validation.serverOnly.moneyhubSandboxConfigured ||
              validation.serverOnly.truelayerSandboxConfigured),
        ),
        true,
      ),
      validation.appBaseUrl
        ? "Moneyhub and TrueLayer webhook endpoints are route-backed; provider portal setup still required."
        : "Webhook URL cannot be formed until base URL is configured.",
      "Configure provider webhook endpoints in the sandbox provider portal.",
    ),
    check(
      "scheduled_routes",
      "Scheduled route protection",
      validation.serverOnly.cronSecretConfigured ? "pass" : "fail",
      "Scheduled notification and bank sync routes require the cron secret.",
      validation.serverOnly.cronSecretConfigured ? null : "Set the cron secret before enabling cron.",
    ),
    check(
      "scheduled_job_support",
      "Scheduled job support",
      validation.deploymentPlatform === "netlify" ||
        validation.deploymentPlatform === "vercel" ||
        validation.serverOnly.cronSecretConfigured
        ? "pass"
        : "warning",
      validation.deploymentPlatform === "netlify"
        ? "Netlify scheduled function wrappers are expected to call protected API routes."
        : validation.deploymentPlatform === "vercel"
          ? "Vercel Cron remains supported through vercel.json."
          : "HTTP scheduled routes are available for local/manual cron testing.",
      validation.serverOnly.cronSecretConfigured
        ? null
        : "Set CRON_SECRET before enabling scheduled jobs.",
    ),
  ];
  const hasFail = checks.some((item) => item.status === "fail");
  const hasWarning = checks.some((item) => item.status === "warning");

  return {
    generatedAt: new Date().toISOString(),
    environment: validation.deploymentEnvironment,
    deploymentPlatform: validation.deploymentPlatform,
    overallStatus: hasFail ? "fail" : hasWarning ? "warning" : "pass",
    checks,
  };
}

export function assertNoSecretValuesInReadinessReport(report: SystemReadinessReport) {
  const serialised = JSON.stringify(report);
  const secretPatterns = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.OPENAI_API_KEY,
    process.env.MONEYHUB_CLIENT_SECRET,
    process.env.TRUELAYER_CLIENT_SECRET,
    process.env.TRUELAYER_WEBHOOK_SECRET,
    process.env.FIREBASE_PRIVATE_KEY,
    process.env.FIREBASE_CLIENT_EMAIL,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];

  return secretPatterns.every((secret) => !serialised.includes(secret));
}
