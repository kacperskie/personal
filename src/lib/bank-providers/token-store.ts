import "server-only";

import type { BankProvider } from "@/lib/domain";

export type ProviderTokenRecord = {
  connectionId: string;
  provider: BankProvider;
  tokenReference: string;
  expiresAt: string | null;
  scopes: string[];
};

export type SaveProviderTokenInput = {
  userId: string;
  connectionId: string;
  provider: BankProvider;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
};

// Provider tokens must never be exposed to the browser.
// Provider tokens must only be accessed server-side through this boundary.
// Future production storage should use encrypted storage or provider-managed token vaulting where available.
export async function saveProviderToken(
  input: SaveProviderTokenInput,
): Promise<ProviderTokenRecord> {
  void input.accessToken;
  void input.refreshToken;

  return {
    connectionId: input.connectionId,
    provider: input.provider,
    tokenReference: `mock-token-ref:${input.connectionId}`,
    expiresAt: input.expiresAt,
    scopes: input.scopes,
  };
}

export async function getProviderToken(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenRecord | null> {
  void userId;
  void connectionId;
  return null;
}

export async function revokeProviderToken(
  userId: string,
  connectionId: string,
): Promise<{ revoked: true; connectionId: string }> {
  void userId;
  return { revoked: true, connectionId };
}
