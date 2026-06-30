import type { BankProvider } from "@/lib/domain";
import { mockOpenBankingProvider } from "@/lib/bank-providers/mock-open-banking-provider";
import { moneyhubProvider, MoneyhubProvider } from "@/lib/bank-providers/moneyhub-provider";
import { truelayerProvider, TrueLayerProvider } from "@/lib/bank-providers/truelayer-provider";
import {
  getMoneyhubProviderConfig,
  getOpenBankingProvider,
  getTrueLayerProviderConfig,
} from "@/lib/bank-providers/provider-config";
import { ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import type { OpenBankingProviderAdapter } from "@/lib/bank-providers/types";

export function getProviderAdapter(provider: BankProvider = getOpenBankingProvider()): OpenBankingProviderAdapter {
  if (provider === "mock") {
    return mockOpenBankingProvider;
  }

  if (provider === "moneyhub") {
    return moneyhubProvider;
  }

  if (provider === "truelayer") {
    return truelayerProvider;
  }

  throw new ProviderSafeError(
    "provider_not_supported",
    "This provider is not implemented yet.",
    400,
  );
}

export function createProviderAdapterForConfig(provider: BankProvider): OpenBankingProviderAdapter {
  if (provider === "moneyhub") {
    return new MoneyhubProvider(getMoneyhubProviderConfig());
  }

  if (provider === "truelayer") {
    return new TrueLayerProvider(getTrueLayerProviderConfig());
  }

  return getProviderAdapter(provider);
}
