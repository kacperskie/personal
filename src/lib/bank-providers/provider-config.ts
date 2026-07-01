import type { BankProvider } from "@/lib/domain";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFeatureFlags } from "@/lib/deployment/env";
import { isProviderTokenStoreAvailable } from "@/lib/bank-providers/token-store";

export type MoneyhubProviderConfig = {
  provider: "moneyhub";
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  webhookSecret: string | null;
  apiBaseUrl: string;
  authBaseUrl: string;
  jwksUrl: string | null;
  privateKey: string | null;
  keyId: string | null;
  configured: boolean;
  sandboxMode: boolean;
};

export type MoneyhubSandboxReadiness = {
  providerSelected: boolean;
  provider: BankProvider;
  configured: boolean;
  sandboxModeEnabled: boolean;
  redirectUri: string | null;
  requiredEnvironment: Array<{
    name: string;
    present: boolean;
    sensitive: boolean;
  }>;
  missingEnvironment: string[];
  tokenStoreAvailable: boolean;
  supabaseConfigured: boolean;
  providerClientCanBeInitialised: boolean;
  safeMessage: string;
};

export type TrueLayerProviderConfig = {
  provider: "truelayer";
  openBankingEnabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  webhookSecret: string | null;
  apiBaseUrl: string;
  authBaseUrl: string;
  scopes: string[];
  configured: boolean;
  sandboxMode: boolean;
  /** "sandbox" when TRUELAYER_SANDBOX_ENABLED !== "false", otherwise "live". */
  mode: "sandbox" | "live";
  /** Optional capability, off by default. Cards are not part of core sync. */
  cardsEnabled: boolean;
};

export type TrueLayerSandboxReadiness = {
  providerSelected: boolean;
  provider: BankProvider;
  configured: boolean;
  sandboxModeEnabled: boolean;
  redirectUri: string | null;
  requiredEnvironment: Array<{
    name: string;
    present: boolean;
    sensitive: boolean;
  }>;
  missingEnvironment: string[];
  webhookSecretConfigured: boolean;
  requiredScopesPresent: boolean;
  tokenEncryptionConfigured: boolean;
  tokenStoreAvailable: boolean;
  supabaseConfigured: boolean;
  providerClientCanBeInitialised: boolean;
  mode: "sandbox" | "live";
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  /** True when live mode is on but the client ID still looks like a sandbox id. */
  sandboxClientIdInLiveMode: boolean;
  cardSupport: "disabled" | "enabled_scope_missing" | "enabled";
  cardSupportMessage: string;
  safeMessage: string;
};

export type ProviderComparisonCapability = {
  provider: Extract<BankProvider, "mock" | "moneyhub" | "truelayer">;
  label: string;
  configured: boolean;
  sandboxReady: boolean;
  accountsSupport: "mocked" | "sandbox-ready" | "to validate";
  balancesSupport: "mocked" | "sandbox-ready" | "to validate";
  transactionsSupport: "mocked" | "sandbox-ready" | "to validate";
  creditCardsSupport: "mocked" | "sandbox-ready" | "to validate";
  regularPaymentsSupport: "mocked" | "to validate";
  webhookSupport: "placeholder" | "sandbox-ready" | "to validate";
  targetInstitutions: string[];
};

export const supportedOpenBankingProviders: BankProvider[] = [
  "moneyhub",
  "truelayer",
  "tink",
  "plaid",
  "mock",
];

export function getOpenBankingProvider(env: NodeJS.ProcessEnv = process.env): BankProvider {
  const provider = env.OPEN_BANKING_PROVIDER;

  return supportedOpenBankingProviders.includes(provider as BankProvider)
    ? (provider as BankProvider)
    : "mock";
}

export function getMoneyhubProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): MoneyhubProviderConfig {
  const clientId = env.MONEYHUB_CLIENT_ID || env.OPEN_BANKING_CLIENT_ID || null;
  const clientSecret =
    env.MONEYHUB_CLIENT_SECRET || env.OPEN_BANKING_CLIENT_SECRET || null;
  const redirectUri =
    env.MONEYHUB_REDIRECT_URI ||
    env.OPEN_BANKING_REDIRECT_URI ||
    "http://localhost:3000/api/bank-connections/callback";
  const webhookSecret =
    env.MONEYHUB_WEBHOOK_SECRET || env.OPEN_BANKING_WEBHOOK_SECRET || null;
  const apiBaseUrl =
    env.MONEYHUB_API_BASE_URL || "https://api.moneyhub.co.uk/v2.0";
  const authBaseUrl =
    env.MONEYHUB_AUTH_BASE_URL || "https://identity.moneyhub.co.uk";
  const jwksUrl = env.MONEYHUB_JWKS_URL || null;
  const privateKey = env.MONEYHUB_PRIVATE_KEY || null;
  const keyId = env.MONEYHUB_KEY_ID || null;
  const sandboxMode =
    env.OPEN_BANKING_PROVIDER === "moneyhub" ||
    apiBaseUrl.toLowerCase().includes("moneyhub") ||
    authBaseUrl.toLowerCase().includes("moneyhub");

  return {
    provider: "moneyhub",
    clientId,
    clientSecret,
    redirectUri,
    webhookSecret,
    apiBaseUrl,
    authBaseUrl,
    jwksUrl,
    privateKey,
    keyId,
    configured: Boolean(clientId && clientSecret && redirectUri),
    sandboxMode,
  };
}

export function getTrueLayerProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): TrueLayerProviderConfig {
  const clientId = env.TRUELAYER_CLIENT_ID || null;
  const clientSecret = env.TRUELAYER_CLIENT_SECRET || null;
  const redirectUri =
    env.TRUELAYER_REDIRECT_URI ||
    "http://localhost:3000/api/bank-connections/callback";
  const webhookSecret = env.TRUELAYER_WEBHOOK_SECRET || null;
  // Mode is driven by the flag: sandbox unless explicitly TRUELAYER_SANDBOX_ENABLED=false.
  // Base URLs default from the mode (explicit env overrides still win), so turning
  // the flag off switches the app to the live TrueLayer environment.
  const sandboxMode = env.TRUELAYER_SANDBOX_ENABLED !== "false";
  const mode: "sandbox" | "live" = sandboxMode ? "sandbox" : "live";
  const apiBaseUrl =
    env.TRUELAYER_API_BASE_URL ||
    (sandboxMode ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com");
  const authBaseUrl =
    env.TRUELAYER_AUTH_BASE_URL ||
    (sandboxMode ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com");
  // Cards are NOT in the default scope set - they are an optional capability
  // enabled via TRUELAYER_CARDS_ENABLED. Core sync uses info/accounts/balance/
  // transactions/offline_access only.
  const scopes = (env.TRUELAYER_SCOPES ?? "info accounts balance transactions offline_access")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const cardsEnabled = env.TRUELAYER_CARDS_ENABLED === "true";
  const openBankingEnabled =
    env.OPEN_BANKING_ENABLED === "true" && env.OPEN_BANKING_PROVIDER === "truelayer";

  return {
    provider: "truelayer",
    openBankingEnabled,
    clientId,
    clientSecret,
    redirectUri,
    webhookSecret,
    apiBaseUrl,
    authBaseUrl,
    scopes,
    configured: Boolean(openBankingEnabled && clientId && clientSecret && redirectUri),
    sandboxMode,
    mode,
    cardsEnabled,
  };
}

export function getMoneyhubSandboxReadiness(
  env: NodeJS.ProcessEnv = process.env,
): MoneyhubSandboxReadiness {
  const provider = getOpenBankingProvider(env);
  const config = getMoneyhubProviderConfig(env);
  const requiredEnvironment = [
    {
      name: "OPEN_BANKING_PROVIDER",
      present: provider === "moneyhub",
      sensitive: false,
    },
    {
      name: "MONEYHUB_CLIENT_ID",
      present: Boolean(config.clientId),
      sensitive: true,
    },
    {
      name: "MONEYHUB_CLIENT_SECRET",
      present: Boolean(config.clientSecret),
      sensitive: true,
    },
    {
      name: "MONEYHUB_REDIRECT_URI",
      present: Boolean(config.redirectUri),
      sensitive: false,
    },
    {
      name: "MONEYHUB_API_BASE_URL",
      present: Boolean(config.apiBaseUrl),
      sensitive: false,
    },
    {
      name: "MONEYHUB_AUTH_BASE_URL",
      present: Boolean(config.authBaseUrl),
      sensitive: false,
    },
  ];
  const missingEnvironment = requiredEnvironment
    .filter((item) => !item.present)
    .map((item) => item.name);
  const providerClientCanBeInitialised = config.configured && config.sandboxMode;

  return {
    providerSelected: provider === "moneyhub",
    provider,
    configured: config.configured,
    sandboxModeEnabled: config.sandboxMode,
    redirectUri: config.redirectUri,
    requiredEnvironment,
    missingEnvironment,
    tokenStoreAvailable: true,
    supabaseConfigured: isSupabaseConfigured(),
    providerClientCanBeInitialised,
    safeMessage: providerClientCanBeInitialised
      ? "Moneyhub sandbox appears configured. The app will still use sandbox/test mode only."
      : "Moneyhub sandbox is not fully configured. Mock provider remains available.",
  };
}

export function getTrueLayerSandboxReadiness(
  env: NodeJS.ProcessEnv = process.env,
): TrueLayerSandboxReadiness {
  const provider = getOpenBankingProvider(env);
  const config = getTrueLayerProviderConfig(env);
  const flags = getFeatureFlags(env);
  const requiredScopes = ["info", "accounts", "balance", "transactions"];
  const requiredScopesPresent = requiredScopes.every((scope) => config.scopes.includes(scope));
  const tokenEncryptionConfigured = isProviderTokenStoreAvailable(env);
  const providerSelected = provider === "truelayer";
  const openBankingActive = flags.openBankingEnabled && providerSelected;
  const requiredEnvironment = [
    {
      name: "OPEN_BANKING_ENABLED",
      present: flags.openBankingEnabled,
      sensitive: false,
    },
    {
      name: "OPEN_BANKING_PROVIDER",
      present: providerSelected,
      sensitive: false,
    },
    {
      name: "TRUELAYER_CLIENT_ID",
      present: Boolean(config.clientId),
      sensitive: true,
    },
    {
      name: "TRUELAYER_CLIENT_SECRET",
      present: Boolean(config.clientSecret),
      sensitive: true,
    },
    {
      name: "TRUELAYER_REDIRECT_URI",
      present: Boolean(config.redirectUri),
      sensitive: false,
    },
    {
      name: "TRUELAYER_API_BASE_URL",
      present: Boolean(config.apiBaseUrl),
      sensitive: false,
    },
    {
      name: "TRUELAYER_AUTH_BASE_URL",
      present: Boolean(config.authBaseUrl),
      sensitive: false,
    },
    {
      name: "TRUELAYER_SCOPES",
      present: config.scopes.length > 0 && requiredScopesPresent,
      sensitive: false,
    },
    {
      name: "TOKEN_ENCRYPTION_KEY",
      present: tokenEncryptionConfigured,
      sensitive: true,
    },
  ];
  const missingEnvironment = requiredEnvironment
    .filter((item) => openBankingActive && !item.present)
    .map((item) => item.name);
  // The client can initialise in EITHER environment (sandbox or live) once
  // configured - mode no longer gates this, so live mode is a first-class path.
  const providerClientCanBeInitialised =
    providerSelected &&
    config.configured &&
    requiredScopesPresent &&
    tokenEncryptionConfigured;
  const sandboxClientIdInLiveMode =
    config.mode === "live" && Boolean(config.clientId?.startsWith("sandbox-"));
  const cardsScopePresent = config.scopes.includes("cards");
  const cardSupport: TrueLayerSandboxReadiness["cardSupport"] = !config.cardsEnabled
    ? "disabled"
    : cardsScopePresent
      ? "enabled"
      : "enabled_scope_missing";
  const cardSupportMessage =
    cardSupport === "disabled"
      ? "Cards are disabled. Amex/card-only providers will not sync. Set TRUELAYER_CARDS_ENABLED=true and reconnect to add them."
      : cardSupport === "enabled_scope_missing"
        ? "Cards are enabled but the cards scope is missing. Add cards to TRUELAYER_SCOPES and reconnect."
        : "Cards are enabled and the cards scope is present. Card-only providers (e.g. Amex) can be attempted.";

  return {
    providerSelected,
    provider,
    configured: config.configured,
    sandboxModeEnabled: config.sandboxMode,
    redirectUri: config.redirectUri,
    requiredEnvironment,
    missingEnvironment,
    webhookSecretConfigured: Boolean(config.webhookSecret),
    requiredScopesPresent,
    tokenEncryptionConfigured,
    tokenStoreAvailable: tokenEncryptionConfigured,
    mode: config.mode,
    clientIdConfigured: Boolean(config.clientId),
    clientSecretConfigured: Boolean(config.clientSecret),
    redirectUriConfigured: Boolean(config.redirectUri),
    sandboxClientIdInLiveMode,
    cardSupport,
    cardSupportMessage,
    supabaseConfigured: isSupabaseConfigured(),
    providerClientCanBeInitialised,
    safeMessage: sandboxClientIdInLiveMode
      ? 'TrueLayer live mode is on, but the client ID still starts with "sandbox-". Set live TrueLayer credentials before connecting real bank data.'
      : providerClientCanBeInitialised
        ? `TrueLayer read-only ${config.mode} mode is configured with server-only encrypted token storage.`
        : flags.openBankingEnabled && providerSelected
          ? `TrueLayer ${config.mode} is selected but missing read-only configuration. Banking calls remain disabled until required server-side settings are present.`
          : "Open Banking is disabled. TrueLayer will not be called until the feature flag and provider are enabled.",
  };
}

export function getProviderComparisonCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): ProviderComparisonCapability[] {
  const moneyhub = getMoneyhubSandboxReadiness(env);
  const truelayer = getTrueLayerSandboxReadiness(env);
  const targetInstitutions = ["American Express", "Nationwide", "Revolut"];

  return [
    {
      provider: "mock",
      label: "Mock provider",
      configured: true,
      sandboxReady: true,
      accountsSupport: "mocked",
      balancesSupport: "mocked",
      transactionsSupport: "mocked",
      creditCardsSupport: "mocked",
      regularPaymentsSupport: "mocked",
      webhookSupport: "placeholder",
      targetInstitutions,
    },
    {
      provider: "moneyhub",
      label: "Moneyhub",
      configured: moneyhub.configured,
      sandboxReady: moneyhub.providerClientCanBeInitialised,
      accountsSupport: "sandbox-ready",
      balancesSupport: "sandbox-ready",
      transactionsSupport: "sandbox-ready",
      creditCardsSupport: "to validate",
      regularPaymentsSupport: "to validate",
      webhookSupport: "placeholder",
      targetInstitutions,
    },
    {
      provider: "truelayer",
      label: "TrueLayer",
      configured: truelayer.configured,
      sandboxReady: truelayer.providerClientCanBeInitialised,
      accountsSupport: "sandbox-ready",
      balancesSupport: "sandbox-ready",
      transactionsSupport: "sandbox-ready",
      creditCardsSupport: "to validate",
      regularPaymentsSupport: "to validate",
      webhookSupport: "placeholder",
      targetInstitutions,
    },
  ];
}

export function getProviderConfiguredState(
  provider?: BankProvider,
  env: NodeJS.ProcessEnv = process.env,
) {
  const selectedProvider = provider ?? getOpenBankingProvider(env);

  if (selectedProvider === "mock") {
    return {
      provider: selectedProvider,
      configured: true,
      safeMessage: "Mock provider is active. No real banking APIs are called.",
      moneyhubReadiness: getMoneyhubSandboxReadiness(env),
      truelayerReadiness: getTrueLayerSandboxReadiness(env),
      providerComparison: getProviderComparisonCapabilities(env),
    };
  }

  if (selectedProvider === "moneyhub") {
    const config = getMoneyhubProviderConfig(env);

    return {
      provider: selectedProvider,
      configured: config.configured,
      safeMessage: config.configured
        ? "Moneyhub sandbox configuration is present."
        : "Moneyhub sandbox credentials are not configured.",
      moneyhubReadiness: getMoneyhubSandboxReadiness(env),
      truelayerReadiness: getTrueLayerSandboxReadiness(env),
      providerComparison: getProviderComparisonCapabilities(env),
    };
  }

  if (selectedProvider === "truelayer") {
    const config = getTrueLayerProviderConfig(env);

    return {
      provider: selectedProvider,
      configured: config.configured,
      safeMessage: config.configured
        ? `TrueLayer ${config.mode} configuration is present.`
        : `TrueLayer ${config.mode} credentials are not configured.`,
      moneyhubReadiness: getMoneyhubSandboxReadiness(env),
      truelayerReadiness: getTrueLayerSandboxReadiness(env),
      providerComparison: getProviderComparisonCapabilities(env),
    };
  }

  return {
    provider: selectedProvider,
    configured: false,
    safeMessage: "This provider is modelled but not implemented yet.",
    moneyhubReadiness: getMoneyhubSandboxReadiness(env),
    truelayerReadiness: getTrueLayerSandboxReadiness(env),
    providerComparison: getProviderComparisonCapabilities(env),
  };
}
