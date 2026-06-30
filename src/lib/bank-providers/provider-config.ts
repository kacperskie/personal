import type { BankProvider } from "@/lib/domain";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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

export const supportedOpenBankingProviders: BankProvider[] = [
  "moneyhub",
  "truelayer",
  "tink",
  "plaid",
  "mock",
];

export function getOpenBankingProvider(): BankProvider {
  const provider = process.env.OPEN_BANKING_PROVIDER;

  return supportedOpenBankingProviders.includes(provider as BankProvider)
    ? (provider as BankProvider)
    : "mock";
}

export function getMoneyhubProviderConfig(): MoneyhubProviderConfig {
  const clientId = process.env.MONEYHUB_CLIENT_ID || process.env.OPEN_BANKING_CLIENT_ID || null;
  const clientSecret =
    process.env.MONEYHUB_CLIENT_SECRET || process.env.OPEN_BANKING_CLIENT_SECRET || null;
  const redirectUri =
    process.env.MONEYHUB_REDIRECT_URI ||
    process.env.OPEN_BANKING_REDIRECT_URI ||
    "http://localhost:3000/api/bank-connections/callback";
  const webhookSecret =
    process.env.MONEYHUB_WEBHOOK_SECRET || process.env.OPEN_BANKING_WEBHOOK_SECRET || null;
  const apiBaseUrl =
    process.env.MONEYHUB_API_BASE_URL || "https://api.moneyhub.co.uk/v2.0";
  const authBaseUrl =
    process.env.MONEYHUB_AUTH_BASE_URL || "https://identity.moneyhub.co.uk";
  const jwksUrl = process.env.MONEYHUB_JWKS_URL || null;
  const privateKey = process.env.MONEYHUB_PRIVATE_KEY || null;
  const keyId = process.env.MONEYHUB_KEY_ID || null;
  const sandboxMode =
    process.env.OPEN_BANKING_PROVIDER === "moneyhub" ||
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

export function getMoneyhubSandboxReadiness(): MoneyhubSandboxReadiness {
  const provider = getOpenBankingProvider();
  const config = getMoneyhubProviderConfig();
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

export function getProviderConfiguredState(provider = getOpenBankingProvider()) {
  if (provider === "mock") {
    return {
      provider,
      configured: true,
      safeMessage: "Mock provider is active. No real banking APIs are called.",
      moneyhubReadiness: getMoneyhubSandboxReadiness(),
    };
  }

  if (provider === "moneyhub") {
    const config = getMoneyhubProviderConfig();

    return {
      provider,
      configured: config.configured,
      safeMessage: config.configured
        ? "Moneyhub sandbox configuration is present."
        : "Moneyhub sandbox credentials are not configured.",
      moneyhubReadiness: getMoneyhubSandboxReadiness(),
    };
  }

  return {
    provider,
    configured: false,
    safeMessage: "This provider is modelled but not implemented yet.",
    moneyhubReadiness: getMoneyhubSandboxReadiness(),
  };
}
