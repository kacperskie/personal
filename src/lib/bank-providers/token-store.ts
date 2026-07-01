import "server-only";

import type { BankProvider, ProviderTokenStorageRecord } from "@/lib/domain";
import { isFirebaseBackend } from "@/lib/backend/provider";
import {
  deleteFirebaseDocument,
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
  userId?: string;
  connectionId: string;
  provider: BankProvider;
  mode?: "sandbox" | "live";
  status?: "active" | "revoked";
  tokenReference: string;
  encryptedTokenPayload: string | null;
  refreshTokenPresent?: boolean;
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

export type ProviderTokenSyncReason =
  | "token_record_missing"
  | "token_connection_id_mismatch"
  | "token_decrypt_failed"
  | "token_expired_refresh_missing"
  | "token_refresh_failed";

export type ProviderTokenSyncPreflight =
  | {
      ok: true;
      record: ProviderTokenRecord;
      diagnostics: ProviderTokenDiagnostics;
    }
  | {
      ok: false;
      reason: ProviderTokenSyncReason;
      status: number;
      message: string;
      diagnostics: ProviderTokenDiagnostics;
    };

export type ProviderTokenDiagnostics = {
  connectionId: string;
  tokenRecordPresent: boolean;
  tokenDecryptable: "yes" | "no" | "not_tested";
  tokenLinkedToConnection: "yes" | "no";
  syncEligible: "yes" | "no";
  reasonCode: ProviderTokenSyncReason | null;
};

export type SaveProviderTokenInput = {
  userId: string;
  connectionId: string;
  provider: BankProvider;
  mode?: "sandbox" | "live";
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

function refreshTokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const tokenLike = payload as {
    refresh_token?: unknown;
    refreshToken?: unknown;
  };
  const refreshToken = tokenLike.refresh_token ?? tokenLike.refreshToken;

  return typeof refreshToken === "string" && refreshToken.length > 0 ? refreshToken : null;
}

function isExpired(value: string | null) {
  return Boolean(value && new Date(value).getTime() <= Date.now());
}

function storageToRuntimeRecord(
  record: ProviderTokenStorageRecord,
): ProviderTokenRecord {
  let tokenReference = record.tokenReference;

  if (record.encryptedTokenPayload) {
    const payload = decryptTokenPayload(record.encryptedTokenPayload);
    const accessToken = accessTokenFromPayload(payload);
    const refreshToken = refreshTokenFromPayload(payload);

    if (!accessToken) {
      throw new ProviderSafeError(
        "provider_sync_failed",
        "Stored provider token metadata is incomplete. Reconnect the bank account.",
        400,
      );
    }

    tokenReference = accessToken;
    record = {
      ...record,
      refreshTokenExpiresAt: refreshToken ? record.refreshTokenExpiresAt : null,
    };
  }

  return {
    connectionId: record.connectionId,
    provider: record.provider,
    userId: record.userId,
    mode: record.mode,
    status: record.status ?? (record.revokedAt ? "revoked" : "active"),
    tokenReference,
    encryptedTokenPayload: record.encryptedTokenPayload,
    refreshTokenPresent: Boolean(record.encryptedTokenPayload && record.refreshTokenExpiresAt),
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

  if (input.tokenPayload && !accessTokenFromPayload(input.tokenPayload)) {
    throw new ProviderSafeError(
      "provider_callback_failed",
      "TrueLayer did not return usable token metadata. Reconnect the bank account.",
      400,
    );
  }

  const encryptedTokenPayload = input.tokenPayload
    ? encryptTokenPayload(input.tokenPayload)
    : null;
  const refreshTokenPresent = input.tokenPayload
    ? Boolean(refreshTokenFromPayload(input.tokenPayload))
    : false;
  const tokenReference = input.tokenPayload
    ? (accessTokenFromPayload(input.tokenPayload) ?? `token-ref:${input.provider}:${input.connectionId}`)
    : `token-ref:${input.provider}:${input.connectionId}`;
  const record: ProviderTokenRecord = {
    userId: input.userId,
    connectionId: input.connectionId,
    provider: input.provider,
    mode: input.mode,
    status: "active",
    tokenReference,
    encryptedTokenPayload,
    refreshTokenPresent,
    providerUserId: input.providerUserId ?? null,
    providerConnectionId: input.providerConnectionId ?? null,
    expiresAt: input.expiresAt,
    accessTokenExpiresAt: input.accessTokenExpiresAt ?? input.expiresAt,
    refreshTokenExpiresAt: refreshTokenPresent ? input.refreshTokenExpiresAt ?? null : null,
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

function missingDiagnostics(connectionId: string): ProviderTokenDiagnostics {
  return {
    connectionId,
    tokenRecordPresent: false,
    tokenDecryptable: "not_tested",
    tokenLinkedToConnection: "no",
    syncEligible: "no",
    reasonCode: "token_record_missing",
  };
}

function diagnosticsForRecord(
  connectionId: string,
  record: ProviderTokenRecord | ProviderTokenStorageRecord,
  changes: Partial<ProviderTokenDiagnostics> = {},
): ProviderTokenDiagnostics {
  const linked = record.connectionId === connectionId;
  const revoked = record.status === "revoked" || Boolean(record.revokedAt);

  return {
    connectionId,
    tokenRecordPresent: true,
    tokenDecryptable: "not_tested",
    tokenLinkedToConnection: linked ? "yes" : "no",
    syncEligible: linked && !revoked ? "yes" : "no",
    reasonCode: linked ? (revoked ? "token_record_missing" : null) : "token_connection_id_mismatch",
    ...changes,
  };
}

export async function getProviderTokenDiagnostics(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenDiagnostics> {
  const stored = isFirebaseBackend()
    ? await getStoredProviderToken(userId, connectionId)
    : tokenPlaceholders.get(tokenKey(userId, connectionId)) ?? null;

  if (!stored) {
    return missingDiagnostics(connectionId);
  }

  try {
    const record =
      "encryptedTokenPayload" in stored && stored.encryptedTokenPayload
        ? storageToRuntimeRecord(stored as ProviderTokenStorageRecord)
        : (stored as ProviderTokenRecord);
    const linked = record.connectionId === connectionId;
    const revoked = record.status === "revoked" || Boolean(record.revokedAt);
    const expiredWithoutRefresh = isExpired(record.accessTokenExpiresAt) && !record.refreshTokenPresent;

    return diagnosticsForRecord(connectionId, record, {
      tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
      syncEligible: linked && !revoked && !expiredWithoutRefresh ? "yes" : "no",
      reasonCode: !linked
        ? "token_connection_id_mismatch"
        : revoked
          ? "token_record_missing"
        : expiredWithoutRefresh
          ? "token_expired_refresh_missing"
          : null,
    });
  } catch {
    return diagnosticsForRecord(connectionId, stored, {
      tokenDecryptable: "no",
      syncEligible: "no",
      reasonCode: "token_decrypt_failed",
    });
  }
}

export async function getProviderTokenForSync(
  userId: string,
  connectionId: string,
): Promise<ProviderTokenSyncPreflight> {
  const stored = isFirebaseBackend()
    ? await getStoredProviderToken(userId, connectionId)
    : tokenPlaceholders.get(tokenKey(userId, connectionId)) ?? null;

  if (!stored) {
    return {
      ok: false,
      reason: "token_record_missing",
      status: 409,
      message: "Reconnect required before this bank connection can sync.",
      diagnostics: missingDiagnostics(connectionId),
    };
  }

  let record: ProviderTokenRecord;

  try {
    record =
      "encryptedTokenPayload" in stored && stored.encryptedTokenPayload
        ? storageToRuntimeRecord(stored as ProviderTokenStorageRecord)
        : (stored as ProviderTokenRecord);
  } catch {
    return {
      ok: false,
      reason: "token_decrypt_failed",
      status: 409,
      message: "Reconnect required because the stored bank token could not be read.",
      diagnostics: diagnosticsForRecord(connectionId, stored, {
        tokenDecryptable: "no",
        syncEligible: "no",
        reasonCode: "token_decrypt_failed",
      }),
    };
  }

  if (record.connectionId !== connectionId) {
    return {
      ok: false,
      reason: "token_connection_id_mismatch",
      status: 409,
      message: "Reconnect required because the stored token is not linked to this connection.",
      diagnostics: diagnosticsForRecord(connectionId, record, {
        tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
        syncEligible: "no",
        reasonCode: "token_connection_id_mismatch",
      }),
    };
  }

  if (record.status === "revoked" || record.revokedAt) {
    return {
      ok: false,
      reason: "token_record_missing",
      status: 409,
      message: "Reconnect required before this bank connection can sync.",
      diagnostics: diagnosticsForRecord(connectionId, record, {
        tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
        syncEligible: "no",
        reasonCode: "token_record_missing",
      }),
    };
  }

  if (isExpired(record.accessTokenExpiresAt) && !record.refreshTokenPresent) {
    return {
      ok: false,
      reason: "token_expired_refresh_missing",
      status: 409,
      message: "Reconnect required because the stored bank token has expired.",
      diagnostics: diagnosticsForRecord(connectionId, record, {
        tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
        syncEligible: "no",
        reasonCode: "token_expired_refresh_missing",
      }),
    };
  }

  if (isExpired(record.accessTokenExpiresAt) && record.refreshTokenPresent) {
    return {
      ok: false,
      reason: "token_refresh_failed",
      status: 409,
      message: "Reconnect required because the stored bank token could not be refreshed.",
      diagnostics: diagnosticsForRecord(connectionId, record, {
        tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
        syncEligible: "no",
        reasonCode: "token_refresh_failed",
      }),
    };
  }

  return {
    ok: true,
    record,
    diagnostics: diagnosticsForRecord(connectionId, record, {
      tokenDecryptable: record.encryptedTokenPayload ? "yes" : "not_tested",
      syncEligible: "yes",
      reasonCode: null,
    }),
  };
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
      status: "revoked",
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
        status: "revoked",
        revokedAt,
        updatedAt: revokedAt,
      });
    }
  }

  return { revoked: true, connectionId, revokedAt };
}

export async function deleteProviderTokenForConnection(
  userId: string,
  connectionId: string,
): Promise<{ id: string }> {
  tokenPlaceholders.delete(tokenKey(userId, connectionId));

  if (isFirebaseBackend()) {
    const context = await getFirebaseAuthenticatedContext();

    if (context?.userId === userId) {
      await deleteFirebaseDocument("providerTokens", connectionId);
    }
  }

  return { id: connectionId };
}

export function isProviderTokenStoreAvailable(env: NodeJS.ProcessEnv = process.env) {
  return isTokenEncryptionConfigured(env);
}
