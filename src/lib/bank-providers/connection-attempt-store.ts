import "server-only";

import type { BankProvider } from "@/lib/domain";

export type BankConnectionAttempt = {
  state: string;
  nonce: string;
  userId: string;
  providerUserId: string;
  provider: BankProvider;
  connectionId: string;
  reconnectConnectionId?: string;
  institutionId: string;
  institutionName: string;
  redirectUri: string;
  createdAt: string;
  expiresAt: string;
};

const attempts = new Map<string, BankConnectionAttempt>();
const attemptTtlMs = 15 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

export function createConnectionAttempt(input: {
  userId: string;
  providerUserId: string;
  provider: BankProvider;
  connectionId: string;
  reconnectConnectionId?: string;
  institutionId: string;
  institutionName: string;
  redirectUri: string;
}): BankConnectionAttempt {
  const now = Date.now();
  const state = `${input.connectionId}_${crypto.randomUUID()}`;
  const attempt: BankConnectionAttempt = {
    state,
    nonce: crypto.randomUUID(),
    userId: input.userId,
    providerUserId: input.providerUserId,
    provider: input.provider,
    connectionId: input.connectionId,
    reconnectConnectionId: input.reconnectConnectionId,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    redirectUri: input.redirectUri,
    createdAt: nowIso(),
    expiresAt: new Date(now + attemptTtlMs).toISOString(),
  };

  attempts.set(state, attempt);
  return attempt;
}

export function getConnectionAttempt(state: string | null): BankConnectionAttempt | null {
  if (!state) {
    return null;
  }

  const attempt = attempts.get(state);

  if (!attempt) {
    return null;
  }

  if (new Date(attempt.expiresAt).getTime() <= Date.now()) {
    attempts.delete(state);
    return null;
  }

  return attempt;
}

export function consumeConnectionAttempt(state: string | null): BankConnectionAttempt | null {
  const attempt = getConnectionAttempt(state);

  if (state) {
    attempts.delete(state);
  }

  return attempt;
}
