import "server-only";

import {
  getOpenBankingProvider,
  getTrueLayerSandboxReadiness,
} from "@/lib/bank-providers/provider-config";
import { getClientWebPushConfig } from "@/lib/notifications/web-push";
import { validateDeploymentEnvironment } from "@/lib/deployment/env";

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
): SystemReadinessReport {
  const validation = validateDeploymentEnvironment(env);
  const webPush = getClientWebPushConfig(env);
  const truelayerReadiness = getTrueLayerSandboxReadiness(env);
  const flags = validation.featureFlags;
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
      "supabase_url",
      "Supabase URL",
      statusFromConfigured(validation.publicClientSafe.supabaseUrlConfigured),
      validation.publicClientSafe.supabaseUrlConfigured
        ? "Configured for browser and server clients."
        : "Missing; Supabase-backed auth and persistence will be unavailable.",
      "Set the Supabase project URL in the deployment environment.",
    ),
    check(
      "supabase_anon_key",
      "Supabase anon key",
      statusFromConfigured(validation.publicClientSafe.supabaseAnonKeyConfigured),
      validation.publicClientSafe.supabaseAnonKeyConfigured
        ? "Configured as a public Supabase client key."
        : "Missing; Supabase browser/server clients cannot initialise.",
      "Set the Supabase anon key in the deployment environment.",
    ),
    check(
      "supabase_service_role",
      "Supabase service role key",
      statusFromConfigured(validation.serverOnly.supabaseServiceRoleConfigured),
      validation.serverOnly.supabaseServiceRoleConfigured
        ? "Configured server-side only."
        : "Missing; scheduled jobs and service-role reads will use fallback or fail safely.",
      "Set the service role key only in server-side deployment variables.",
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
      statusFromConfigured(Boolean(validation.appBaseUrl && validation.publicClientSafe.supabaseUrlConfigured)),
      validation.appBaseUrl
        ? "Ready to configure in Supabase Auth settings."
        : "Cannot verify until the staging base URL is set.",
      "Add the staging callback URL in Supabase Auth redirect settings.",
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
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];

  return secretPatterns.every((secret) => !serialised.includes(secret));
}
