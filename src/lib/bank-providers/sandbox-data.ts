import type { Account, BankConnection, Transaction } from "@/lib/domain";

/**
 * Pure, isomorphic classifiers for separating live TrueLayer data from
 * sandbox/mock data. No secrets, tokens, or account numbers are read here — only
 * provider/institution markers. Used by dashboard, accounts, connected-accounts,
 * and the cleanup action so the rules stay consistent and testable.
 */

export function isLiveTrueLayerMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TRUELAYER_SANDBOX_ENABLED === "false";
}

type ConnectionLike = Pick<
  BankConnection,
  "id" | "provider" | "institutionId" | "institutionName"
>;

type AccountLike = Pick<
  Account,
  "provider" | "providerConnectionId" | "name" | "officialName" | "institutionName"
>;

function looksSandbox(value: string | null | undefined): boolean {
  return Boolean(value && /sandbox/i.test(value));
}

function looksMock(value: string | null | undefined): boolean {
  // Word-boundary MOCK so real names containing "mock" substrings are unaffected.
  return Boolean(value && /\bmock\b/i.test(value));
}

function looksLive(value: string | null | undefined): boolean {
  return Boolean(value && (/truelayer_live/i.test(value) || /\blive\b/i.test(value)));
}

export function isSandboxConnection(connection: ConnectionLike): boolean {
  if (connection.provider === "mock") {
    return true;
  }
  // Explicit live markers win — never classify a live connection as sandbox.
  if (looksLive(connection.institutionId) || looksLive(connection.institutionName)) {
    return false;
  }
  if (connection.institutionId === "truelayer_sandbox") {
    return true;
  }
  return (
    looksSandbox(connection.institutionId) ||
    looksSandbox(connection.institutionName) ||
    looksSandbox(connection.id) ||
    looksMock(connection.institutionName) ||
    looksMock(connection.institutionId)
  );
}

export function partitionConnections<T extends ConnectionLike>(connections: T[]) {
  const live: T[] = [];
  const sandbox: T[] = [];
  for (const connection of connections) {
    (isSandboxConnection(connection) ? sandbox : live).push(connection);
  }
  return { live, sandbox };
}

export function sandboxConnectionIdSet(connections: ConnectionLike[]): Set<string> {
  return new Set(connections.filter(isSandboxConnection).map((connection) => connection.id));
}

export function liveConnectionIdSet(connections: ConnectionLike[]): Set<string> {
  return new Set(
    connections.filter((connection) => !isSandboxConnection(connection)).map((c) => c.id),
  );
}

export function isMockAccount(account: AccountLike): boolean {
  if (account.provider === "mock") {
    return true;
  }
  const text = `${account.name ?? ""} ${account.officialName ?? ""} ${account.institutionName ?? ""}`;
  return looksMock(text) || looksSandbox(text);
}

/**
 * An account is sandbox/mock when it is a mock account OR is linked to a sandbox
 * connection. Accounts linked to a LIVE connection are always protected.
 */
export function isSandboxAccount(
  account: AccountLike,
  sandboxConnectionIds: Set<string>,
  liveConnectionIds: Set<string>,
): boolean {
  if (account.providerConnectionId && liveConnectionIds.has(account.providerConnectionId)) {
    return false;
  }
  if (isMockAccount(account)) {
    return true;
  }
  return Boolean(
    account.providerConnectionId && sandboxConnectionIds.has(account.providerConnectionId),
  );
}

export function partitionAccounts<T extends Account>(accounts: T[], connections: ConnectionLike[]) {
  const sandboxIds = sandboxConnectionIdSet(connections);
  const liveIds = liveConnectionIdSet(connections);
  const live: T[] = [];
  const sandbox: T[] = [];
  for (const account of accounts) {
    (isSandboxAccount(account, sandboxIds, liveIds) ? sandbox : live).push(account);
  }
  return { live, sandbox };
}

export function partitionTransactions<T extends Transaction>(
  transactions: T[],
  sandboxAccountIds: Set<string>,
) {
  const live: T[] = [];
  const sandbox: T[] = [];
  for (const transaction of transactions) {
    (sandboxAccountIds.has(transaction.accountId) ? sandbox : live).push(transaction);
  }
  return { live, sandbox };
}
