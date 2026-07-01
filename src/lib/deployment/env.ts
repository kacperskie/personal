import "server-only";

import { getBackendProvider, type BackendProvider } from "@/lib/backend/provider";

export type DeploymentEnvironment = "local" | "staging" | "production";
export type DeploymentPlatform = "netlify" | "vercel" | "local" | "unknown";

export type FeatureFlags = {
  openBankingEnabled: boolean;
  aiMoneyCoachEnabled: boolean;
  webPushEnabled: boolean;
  scheduledAlertsEnabled: boolean;
  moneyhubSandboxEnabled: boolean;
  truelayerSandboxEnabled: boolean;
  mockDataFallbackEnabled: boolean;
};

export type EnvironmentValidation = {
  deploymentEnvironment: DeploymentEnvironment;
  deploymentPlatform: DeploymentPlatform;
  backendProvider: BackendProvider;
  appBaseUrl: string | null;
  netlify: {
    context: string | null;
    deployPrimeUrlConfigured: boolean;
    urlConfigured: boolean;
    siteNameConfigured: boolean;
  };
  publicClientSafe: {
    supabaseUrlConfigured: boolean;
    supabaseAnonKeyConfigured: boolean;
    firebaseApiKeyConfigured: boolean;
    firebaseAuthDomainConfigured: boolean;
    firebaseProjectIdConfigured: boolean;
    firebaseAppIdConfigured: boolean;
    webPushPublicKeyConfigured: boolean;
  };
  serverOnly: {
    supabaseServiceRoleConfigured: boolean;
    firebaseAdminConfigured: boolean;
    firebaseClientEmailConfigured: boolean;
    firebasePrivateKeyConfigured: boolean;
    openAiConfigured: boolean;
    moneyhubSandboxConfigured: boolean;
    truelayerSandboxConfigured: boolean;
    tokenEncryptionConfigured: boolean;
    webPushPrivateKeyConfigured: boolean;
    cronSecretConfigured: boolean;
  };
  featureFlags: FeatureFlags;
  missingRequiredForStaging: string[];
};

function enabled(value: string | undefined, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === "true";
}

function deploymentEnvironment(env: NodeJS.ProcessEnv): DeploymentEnvironment {
  const value = env.APP_ENV ?? env.CONTEXT ?? env.VERCEL_ENV ?? env.NODE_ENV;

  if (value === "production") {
    return "production";
  }

  if (value === "staging" || value === "preview" || value === "deploy-preview" || value === "branch-deploy") {
    return "staging";
  }

  return "local";
}

export function detectDeploymentPlatform(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentPlatform {
  if (env.NETLIFY === "true") {
    return "netlify";
  }

  if (env.VERCEL === "1" || env.VERCEL === "true") {
    return "vercel";
  }

  if (
    env.NODE_ENV === "development" ||
    env.NEXT_RUNTIME === "nodejs" ||
    env.APP_ENV === "local"
  ) {
    return "local";
  }

  return "unknown";
}

function normaliseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

export function getFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    openBankingEnabled: enabled(env.OPEN_BANKING_ENABLED, false),
    aiMoneyCoachEnabled: enabled(env.AI_MONEY_COACH_ENABLED, false),
    webPushEnabled: enabled(env.WEB_PUSH_ENABLED, false),
    scheduledAlertsEnabled: enabled(env.SCHEDULED_ALERTS_ENABLED, false),
    moneyhubSandboxEnabled: enabled(env.MONEYHUB_SANDBOX_ENABLED, false),
    truelayerSandboxEnabled: enabled(env.TRUELAYER_SANDBOX_ENABLED, false),
    mockDataFallbackEnabled: enabled(env.MOCK_DATA_FALLBACK_ENABLED, true),
  };
}

export function validateDeploymentEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentValidation {
  const flags = getFeatureFlags(env);
  const backendProvider = getBackendProvider(env);
  const appBaseUrl =
    normaliseUrl(env.NEXT_PUBLIC_APP_BASE_URL) ??
    normaliseUrl(env.APP_BASE_URL) ??
    normaliseUrl(env.URL) ??
    normaliseUrl(env.DEPLOY_PRIME_URL) ??
    normaliseUrl(env.VERCEL_URL);
  const moneyhubSandboxConfigured = Boolean(
    env.MONEYHUB_CLIENT_ID &&
      env.MONEYHUB_CLIENT_SECRET &&
      env.MONEYHUB_REDIRECT_URI &&
      env.MONEYHUB_WEBHOOK_SECRET,
  );
  const truelayerSandboxConfigured = Boolean(
    env.TRUELAYER_CLIENT_ID &&
      env.TRUELAYER_CLIENT_SECRET &&
      env.TRUELAYER_REDIRECT_URI &&
      (env.TRUELAYER_API_BASE_URL || "https://api.truelayer-sandbox.com") &&
      (env.TRUELAYER_AUTH_BASE_URL || "https://auth.truelayer-sandbox.com") &&
      (env.TRUELAYER_SCOPES || "info accounts balance cards transactions offline_access") &&
      env.TOKEN_ENCRYPTION_KEY &&
      env.TOKEN_ENCRYPTION_KEY.length >= 32,
  );
  const webPushConfigured = Boolean(
    env.WEB_PUSH_VAPID_PUBLIC_KEY &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      env.WEB_PUSH_SUBJECT,
  );
  const validation: EnvironmentValidation = {
    deploymentEnvironment: deploymentEnvironment(env),
    deploymentPlatform: detectDeploymentPlatform(env),
    backendProvider,
    appBaseUrl,
    netlify: {
      context: env.CONTEXT ?? null,
      deployPrimeUrlConfigured: Boolean(env.DEPLOY_PRIME_URL),
      urlConfigured: Boolean(env.URL),
      siteNameConfigured: Boolean(env.SITE_NAME),
    },
    publicClientSafe: {
      supabaseUrlConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseAnonKeyConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      firebaseApiKeyConfigured: Boolean(env.NEXT_PUBLIC_FIREBASE_API_KEY),
      firebaseAuthDomainConfigured: Boolean(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      firebaseProjectIdConfigured: Boolean(
        env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? env.FIREBASE_PROJECT_ID,
      ),
      firebaseAppIdConfigured: Boolean(env.NEXT_PUBLIC_FIREBASE_APP_ID),
      webPushPublicKeyConfigured: Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY),
    },
    serverOnly: {
      supabaseServiceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      firebaseAdminConfigured: Boolean(
        (env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
          env.FIREBASE_CLIENT_EMAIL &&
          env.FIREBASE_PRIVATE_KEY,
      ),
      firebaseClientEmailConfigured: Boolean(env.FIREBASE_CLIENT_EMAIL),
      firebasePrivateKeyConfigured: Boolean(env.FIREBASE_PRIVATE_KEY),
      openAiConfigured: Boolean(env.OPENAI_API_KEY),
      moneyhubSandboxConfigured,
      truelayerSandboxConfigured,
      tokenEncryptionConfigured: Boolean(
        env.TOKEN_ENCRYPTION_KEY && env.TOKEN_ENCRYPTION_KEY.length >= 32,
      ),
      webPushPrivateKeyConfigured: Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY),
      cronSecretConfigured: Boolean(env.CRON_SECRET),
    },
    featureFlags: flags,
    missingRequiredForStaging: [],
  };
  const requiredForStaging: Array<[string, boolean]> = [
    ["Application base URL", Boolean(validation.appBaseUrl)],
    ["Cron secret", validation.serverOnly.cronSecretConfigured],
  ];

  if (backendProvider === "firebase") {
    requiredForStaging.push(
      ["Firebase public client configuration", Boolean(
        validation.publicClientSafe.firebaseApiKeyConfigured &&
          validation.publicClientSafe.firebaseAuthDomainConfigured &&
          validation.publicClientSafe.firebaseProjectIdConfigured &&
          validation.publicClientSafe.firebaseAppIdConfigured,
      )],
      ["Firebase Admin credentials", validation.serverOnly.firebaseAdminConfigured],
    );
  }

  if (flags.openBankingEnabled || flags.moneyhubSandboxEnabled || flags.truelayerSandboxEnabled) {
    const selectedProvider = env.OPEN_BANKING_PROVIDER ?? "mock";
    const selectedProviderConfigured =
      selectedProvider === "truelayer"
        ? truelayerSandboxConfigured
        : selectedProvider === "moneyhub"
          ? moneyhubSandboxConfigured
          : true;

    requiredForStaging.push([
      "Selected Open Banking sandbox configuration",
      selectedProviderConfigured,
    ]);
  }

  if (flags.webPushEnabled) {
    requiredForStaging.push(["VAPID public/private keys and subject", webPushConfigured]);
  }

  if (flags.aiMoneyCoachEnabled) {
    requiredForStaging.push(["OpenAI API key", validation.serverOnly.openAiConfigured]);
  }

  validation.missingRequiredForStaging = requiredForStaging
    .filter(([, present]) => !present)
    .map(([name]) => name);

  return validation;
}

export function clientSafeEnvironmentSummary(env: NodeJS.ProcessEnv = process.env) {
  const validation = validateDeploymentEnvironment(env);

  return {
    deploymentEnvironment: validation.deploymentEnvironment,
    backendProvider: validation.backendProvider,
    appBaseUrlConfigured: Boolean(validation.appBaseUrl),
    supabaseConfigured:
      validation.publicClientSafe.supabaseUrlConfigured &&
      validation.publicClientSafe.supabaseAnonKeyConfigured,
    firebaseConfigured:
      validation.publicClientSafe.firebaseApiKeyConfigured &&
      validation.publicClientSafe.firebaseAuthDomainConfigured &&
      validation.publicClientSafe.firebaseProjectIdConfigured &&
      validation.publicClientSafe.firebaseAppIdConfigured,
    mockDataFallbackEnabled: validation.featureFlags.mockDataFallbackEnabled,
    openBankingEnabled: validation.featureFlags.openBankingEnabled,
    aiMoneyCoachEnabled: validation.featureFlags.aiMoneyCoachEnabled,
    webPushEnabled: validation.featureFlags.webPushEnabled,
    scheduledAlertsEnabled: validation.featureFlags.scheduledAlertsEnabled,
    deploymentPlatform: validation.deploymentPlatform,
  };
}
