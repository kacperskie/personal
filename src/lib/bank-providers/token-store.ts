import "server-only";

import type { BankProvider } from "@/lib/domain";

export type ProviderTokenRecord = {
  connectionId: string;
  provider: BankProvider;
  tokenReference: string;
  providerUserId: string | null;
  providerConnectionId: string | null;
  expiresAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveProviderTokenInput = {
  userId: string;
  connectionId: string;
  provider: BankProvider;
  encryptedTokenPlaceholder: string;
  providerUserId?: string | null;
  providerConnectionId?: string | null;
  expiresAt: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
};

const tokenPlaceholders = new Map<string, ProviderTokenRecord>();

function tokenKey(userId: string, connectionId: string) {
  return `${userId}:${connectionId}`;
}

export function toClientSafeTokenRecord(record: ProviderTokenRecord | null) {
  if (!record) {
    return null;
  }

  return {
    connectionId: record.connectionId,
    provider: record.provider,
    tokenReference: record.tokenReference,
    providerUserId: record.providerUserId,
    providerConnectionId: record.providerConnectionId,
    expiresAt: record.expiresAt,
    accessExpiresAt: record.accessTokenExpiresAt,
    refreshExpiresAt: record.refreshTokenExpiresAt,
    scopes: record.scopes,
    revokedAt: record.revokedAt,
    updatedAt: record.updatedAt,
  };
}

// Provider tokens must never be exposed to the browser.
// Provider tokens must only be accessed server-side through this boundary.
// Future production storage should use encrypted storage or provider-managed token vaulting where available.
export async function saveProviderToken(
  input: SaveProviderTokenInput,
): Promise<ProviderTokenRecord> {
  void input.encryptedTokenPlaceholder;
  const now = new Date().toISOString();
  const record: ProviderTokenRecord = {
    connectionId: input.connectionId,
    provider: input.provider,
    tokenReference: `token-ref:${input.provider}:${input.connectionId}`,
    providerUserId: input.providerUserId ?? null,
    providerConnectionId: input.providerConnectionId ?? null,
    expiresAt: input.expiresAt,
    accessTokenExpiresAt: input.accessTokenExpiresAt ?? input.expiresAt,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
    scopes: input.scopes,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  tokenPlaceholders.set(tokenKey(input.userId, input.connectionId), record);

  return record;
}

export async function getProviderToken(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenRecord | null> {
  return tokenPlaceholders.get(tokenKey(userId, connectionId)) ?? null;
}

export async function revokeProviderToken(
  userId: string,
  connectionId: string,
): Promise<{ revoked: true; connectionId: string; revokedAt: string }> {
  const revokedAt = new Date().toISOString();
  const existing = tokenPlaceholders.get(tokenKey(userId, connectionId));

  if (existing) {
    tokenPlaceholders.set(tokenKey(userId, connectionId), {
      ...existing,
      revokedAt,
      updatedAt: revokedAt,
    });
  }

  return { revoked: true, connectionId, revokedAt };
}
