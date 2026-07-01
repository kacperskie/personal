import "server-only";

import type { BankProvider, ProviderTokenStorageRecord } from "@/lib/domain";
import { isFirebaseBackend } from "@/lib/backend/provider";
import {
  getFirebaseAuthenticatedContext,
  upsertFirebaseDocument,
} from "@/lib/repositories/firebase-repository";
import { createFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  decryptTokenPayload,
  encryptTokenPayload,
  isTokenEncryptionConfigured,
} from "@/lib/security/token-encryption";

export type ProviderTokenRecord = {
  connectionId: string;
  provider: BankProvider;
  tokenReference: string;
  encryptedTokenPayload: string | null;
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
  encryptedTokenPlaceholder?: string;
  tokenPayload?: unknown;
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
    tokenStored: Boolean(record.tokenReference || record.encryptedTokenPayload),
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

function accessTokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const tokenLike = payload as {
    access_token?: unknown;
    accessToken?: unknown;
  };
  const accessToken = tokenLike.access_token ?? tokenLike.accessToken;

  return typeof accessToken === "string" && accessToken.length > 0 ? accessToken : null;
}

function storageToRuntimeRecord(
  record: ProviderTokenStorageRecord,
): ProviderTokenRecord {
  let tokenReference = record.tokenReference;

  if (record.encryptedTokenPayload) {
    const payload = decryptTokenPayload(record.encryptedTokenPayload);
    const accessToken = accessTokenFromPayload(payload);

    if (!accessToken) {
      throw new ProviderSafeError(
        "provider_sync_failed",
        "Stored provider token metadata is incomplete. Reconnect the bank account.",
        400,
      );
    }

    tokenReference = accessToken;
  }

  return {
    connectionId: record.connectionId,
    provider: record.provider,
    tokenReference,
    encryptedTokenPayload: record.encryptedTokenPayload,
    providerUserId: record.providerUserId,
    providerConnectionId: record.providerConnectionId,
    expiresAt: record.expiresAt,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    refreshTokenExpiresAt: record.refreshTokenExpiresAt,
    scopes: record.scopes,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function getStoredProviderToken(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenStorageRecord | null> {
  const db = await createFirebaseAdminFirestore();

  if (!db) {
    return null;
  }

  const snapshot = await db
    .collection(`users/${userId}/providerTokens`)
    .doc(connectionId)
    .get();

  return snapshot.exists ? (snapshot.data() as ProviderTokenStorageRecord) : null;
}

// Provider tokens must never be exposed to the browser.
// Provider tokens must only be accessed server-side through this boundary.
// TrueLayer token payloads use encrypted storage before they are persisted.
export async function saveProviderToken(
  input: SaveProviderTokenInput,
): Promise<ProviderTokenRecord> {
  const now = new Date().toISOString();
  if (input.tokenPayload && !isTokenEncryptionConfigured()) {
    throw new ProviderSafeError(
      "provider_callback_failed",
      "Open Banking token encryption is not configured.",
      400,
    );
  }

  const encryptedTokenPayload = input.tokenPayload
    ? encryptTokenPayload(input.tokenPayload)
    : null;
  const tokenReference = input.tokenPayload
    ? (accessTokenFromPayload(input.tokenPayload) ?? `token-ref:${input.provider}:${input.connectionId}`)
    : `token-ref:${input.provider}:${input.connectionId}`;
  const record: ProviderTokenRecord = {
    connectionId: input.connectionId,
    provider: input.provider,
    tokenReference,
    encryptedTokenPayload,
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

  if (isFirebaseBackend()) {
    const context = await getFirebaseAuthenticatedContext();

    if (!context || context.userId !== input.userId) {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "Provider token storage requires the signed-in Firebase user.",
        401,
      );
    }
    await upsertFirebaseDocument("providerTokens", {
      id: input.connectionId,
      ...record,
      tokenReference: encryptedTokenPayload ? "encrypted" : record.tokenReference,
    });
  }

  return record;
}

export async function getProviderToken(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenRecord | null> {
  if (isFirebaseBackend()) {
    const context = await getFirebaseAuthenticatedContext();

    if (context && context.userId !== userId) {
      return null;
    }

    const stored = await getStoredProviderToken(userId, connectionId);

    if (stored) {
      return storageToRuntimeRecord(stored);
    }
  }

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

  if (isFirebaseBackend()) {
    const context = await getFirebaseAuthenticatedContext();
    const existingStored =
      context?.userId === userId ? await getStoredProviderToken(userId, connectionId) : null;

    if (existingStored) {
      await upsertFirebaseDocument("providerTokens", {
        ...existingStored,
        revokedAt,
        updatedAt: revokedAt,
      });
    }
  }

  return { revoked: true, connectionId, revokedAt };
}

export function isProviderTokenStoreAvailable(env: NodeJS.ProcessEnv = process.env) {
  return isTokenEncryptionConfigured(env);
}
