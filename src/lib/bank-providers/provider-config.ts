import type { BankProvider } from "@/lib/domain";

export type MoneyhubProviderConfig = {
  provider: "moneyhub";
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  webhookSecret: string | null;
  apiBaseUrl: string;
  authBaseUrl: string;
  configured: boolean;
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

  return {
    provider: "moneyhub",
    clientId,
    clientSecret,
    redirectUri,
    webhookSecret,
    apiBaseUrl,
    authBaseUrl,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function getProviderConfiguredState(provider = getOpenBankingProvider()) {
  if (provider === "mock") {
    return {
      provider,
      configured: true,
      safeMessage: "Mock provider is active. No real banking APIs are called.",
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
    };
  }

  return {
    provider,
    configured: false,
    safeMessage: "This provider is modelled but not implemented yet.",
  };
}
