import "server-only";

export type DeploymentEnvironment = "local" | "staging" | "production";

export type FeatureFlags = {
  openBankingEnabled: boolean;
  aiMoneyCoachEnabled: boolean;
  webPushEnabled: boolean;
  scheduledAlertsEnabled: boolean;
  moneyhubSandboxEnabled: boolean;
  mockDataFallbackEnabled: boolean;
};

export type EnvironmentValidation = {
  deploymentEnvironment: DeploymentEnvironment;
  appBaseUrl: string | null;
  publicClientSafe: {
    supabaseUrlConfigured: boolean;
    supabaseAnonKeyConfigured: boolean;
    webPushPublicKeyConfigured: boolean;
  };
  serverOnly: {
    supabaseServiceRoleConfigured: boolean;
    openAiConfigured: boolean;
    moneyhubSandboxConfigured: boolean;
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
  const value = env.APP_ENV ?? env.VERCEL_ENV ?? env.NODE_ENV;

  if (value === "production") {
    return "production";
  }

  if (value === "staging" || value === "preview") {
    return "staging";
  }

  return "local";
}

export function getFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    openBankingEnabled: enabled(env.OPEN_BANKING_ENABLED, false),
    aiMoneyCoachEnabled: enabled(env.AI_MONEY_COACH_ENABLED, false),
    webPushEnabled: enabled(env.WEB_PUSH_ENABLED, false),
    scheduledAlertsEnabled: enabled(env.SCHEDULED_ALERTS_ENABLED, false),
    moneyhubSandboxEnabled: enabled(env.MONEYHUB_SANDBOX_ENABLED, false),
    mockDataFallbackEnabled: enabled(env.MOCK_DATA_FALLBACK_ENABLED, true),
  };
}

export function validateDeploymentEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentValidation {
  const flags = getFeatureFlags(env);
  const appBaseUrl = env.NEXT_PUBLIC_APP_BASE_URL ?? env.APP_BASE_URL ?? env.VERCEL_URL ?? null;
  const moneyhubSandboxConfigured = Boolean(
    env.MONEYHUB_CLIENT_ID &&
      env.MONEYHUB_CLIENT_SECRET &&
      env.MONEYHUB_REDIRECT_URI &&
      env.MONEYHUB_WEBHOOK_SECRET,
  );
  const webPushConfigured = Boolean(
    env.WEB_PUSH_VAPID_PUBLIC_KEY &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      env.WEB_PUSH_SUBJECT,
  );
  const validation: EnvironmentValidation = {
    deploymentEnvironment: deploymentEnvironment(env),
    appBaseUrl,
    publicClientSafe: {
      supabaseUrlConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseAnonKeyConfigured: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      webPushPublicKeyConfigured: Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY),
    },
    serverOnly: {
      supabaseServiceRoleConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      openAiConfigured: Boolean(env.OPENAI_API_KEY),
      moneyhubSandboxConfigured,
      webPushPrivateKeyConfigured: Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY),
      cronSecretConfigured: Boolean(env.CRON_SECRET),
    },
    featureFlags: flags,
    missingRequiredForStaging: [],
  };
  const requiredForStaging: Array<[string, boolean]> = [
    ["Supabase URL", validation.publicClientSafe.supabaseUrlConfigured],
    ["Supabase anon key", validation.publicClientSafe.supabaseAnonKeyConfigured],
    ["Supabase service role key", validation.serverOnly.supabaseServiceRoleConfigured],
    ["Application base URL", Boolean(validation.appBaseUrl)],
    ["Cron secret", validation.serverOnly.cronSecretConfigured],
  ];

  if (flags.openBankingEnabled || flags.moneyhubSandboxEnabled) {
    requiredForStaging.push(["Moneyhub sandbox configuration", moneyhubSandboxConfigured]);
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
    appBaseUrlConfigured: Boolean(validation.appBaseUrl),
    supabaseConfigured:
      validation.publicClientSafe.supabaseUrlConfigured &&
      validation.publicClientSafe.supabaseAnonKeyConfigured,
    mockDataFallbackEnabled: validation.featureFlags.mockDataFallbackEnabled,
    openBankingEnabled: validation.featureFlags.openBankingEnabled,
    aiMoneyCoachEnabled: validation.featureFlags.aiMoneyCoachEnabled,
    webPushEnabled: validation.featureFlags.webPushEnabled,
    scheduledAlertsEnabled: validation.featureFlags.scheduledAlertsEnabled,
  };
}
