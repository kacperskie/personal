import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountsManager } from "../src/components/connected-accounts/connected-accounts-manager";
import type {
  Account,
  BankConnection,
  ProviderAccount,
  ProviderSyncEvent,
  ProviderTransaction,
  Transaction,
} from "../src/lib/domain";
import {
  mapProviderAccountPayload,
  mapProviderTransactionPayload,
} from "../src/lib/bank-providers/provider-mappers";
import {
  ProviderSafeError,
  toProviderSafeError,
} from "../src/lib/bank-providers/provider-errors";
import { syncBankConnection } from "../src/lib/bank-providers/sync-workflow";
import type { OpenBankingProviderAdapter } from "../src/lib/bank-providers/types";
import {
  saveProviderToken,
  toClientSafeTokenRecord,
} from "../src/lib/bank-providers/token-store";
import { POST as startConnection } from "../src/app/api/bank-connections/start/route";
import { GET as handleCallback } from "../src/app/api/bank-connections/callback/route";
import { POST as syncConnection } from "../src/app/api/bank-connections/[connectionId]/sync/route";

const baseConnection: BankConnection = {
  id: "conn_test",
  provider: "mock",
  institutionName: "Sandbox Bank",
  institutionId: "sandbox_bank",
  status: "connected",
  consentStatus: "active",
  consentStartedAt: "2026-06-30T09:00:00.000Z",
  consentExpiresAt: "2026-09-30T09:00:00.000Z",
  lastSyncedAt: null,
  errorMessage: null,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 6 Open Banking sandbox foundation", () => {
  it("maps provider account payloads into app provider accounts", () => {
    const account = mapProviderAccountPayload(
      {
        id: "card_123",
        institution: { id: "amex", name: "American Express" },
        displayName: "Amex test card",
        officialName: "American Express Sandbox Card",
        type: "credit card",
        balance: 320,
        availableBalance: 1680,
        creditLimit: 2000,
        currency: "GBP",
        mask: "3005",
      },
      baseConnection,
    );

    expect(account.providerAccountId).toBe("card_123");
    expect(account.type).toBe("credit_card");
    expect(account.subtype).toBe("credit_card");
    expect(account.balance).toBe(-320);
    expect(account.mask).toBe("3005");
  });

  it("maps provider transaction payloads and detects transfer hints", () => {
    const transaction = mapProviderTransactionPayload(
      {
        id: "txn_123",
        accountId: "acct_123",
        date: "2026-06-30",
        description: "Transfer to savings",
        amount: -50,
        currency: "GBP",
        pending: true,
        category: "Transfer",
      },
      "conn_test",
    );

    expect(transaction.providerTransactionId).toBe("txn_123");
    expect(transaction.pending).toBe(true);
    expect(transaction.isOwnAccountTransfer).toBe(true);
  });

  it("returns provider-safe errors without leaking internals", () => {
    const error = toProviderSafeError(new Error("access_token=secret"), "provider_sync_failed");

    expect(error.code).toBe("provider_sync_failed");
    expect(error.userMessage).not.toContain("access_token");
    expect(error.userMessage).toContain("No credentials or tokens were exposed");
  });

  it("start route rejects unauthenticated requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await startConnection(
      new Request("http://localhost/api/bank-connections/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "moneyhub" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("callback route rejects unauthenticated requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await handleCallback(
      new Request("http://localhost/api/bank-connections/callback?code=test&state=conn_test"),
    );

    expect(response.status).toBe(401);
  });

  it("sync route rejects unauthenticated requests", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await syncConnection(
      new Request("http://localhost/api/bank-connections/conn_test/sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_test" }) },
    );

    expect(response.status).toBe(401);
  });

  it("token store client-safe payloads never include token fields", async () => {
    const record = await saveProviderToken({
      userId: "user_test",
      connectionId: "conn_test",
      provider: "moneyhub",
      encryptedTokenPlaceholder: "encrypted-token-placeholder",
      expiresAt: "2026-09-30T09:00:00.000Z",
      scopes: ["accounts", "transactions"],
    });
    const safe = toClientSafeTokenRecord(record);

    expect(safe).toEqual({
      connectionId: "conn_test",
      provider: "moneyhub",
      tokenStored: true,
      providerUserId: null,
      providerConnectionId: null,
      expiresAt: "2026-09-30T09:00:00.000Z",
      accessExpiresAt: "2026-09-30T09:00:00.000Z",
      refreshExpiresAt: null,
      scopes: ["accounts", "transactions"],
      revokedAt: null,
      updatedAt: record.updatedAt,
    });
    expect(JSON.stringify(safe)).not.toContain("encrypted-token-placeholder");
    expect(JSON.stringify(safe)).not.toContain("accessToken");
    expect(JSON.stringify(safe)).not.toContain("refreshToken");
  });

  it("sync workflow upserts accounts and transactions from mocked provider payloads", async () => {
    const providerAccounts: ProviderAccount[] = [
      {
        providerConnectionId: "conn_test",
        providerAccountId: "provider_current_1",
        institutionName: "Sandbox Bank",
        institutionId: "sandbox_bank",
        name: "Sandbox current",
        officialName: "Sandbox Current Account",
        type: "current_account",
        subtype: "current",
        balance: 100,
        availableBalance: 100,
        creditLimit: null,
        currency: "GBP",
        mask: "0001",
      },
    ];
    const providerTransactions: ProviderTransaction[] = [
      {
        id: "ptxn_1",
        providerConnectionId: "conn_test",
        providerAccountId: "provider_current_1",
        providerTransactionId: "provider_txn_1",
        date: "2026-06-30",
        providerUpdatedAt: "2026-06-30T12:00:00.000Z",
        merchant: "Sandbox Grocers",
        description: "Groceries",
        amount: -12,
        currency: "GBP",
        pending: false,
        category: "Groceries",
        isOwnAccountTransfer: false,
      },
    ];
    const provider: OpenBankingProviderAdapter = {
      createConnection: vi.fn(),
      handleCallback: vi.fn(),
      getConnectionStatus: vi.fn(),
      getAccounts: vi.fn(async () => providerAccounts),
      getTransactions: vi.fn(async () => providerTransactions),
      refreshConnection: vi.fn(async () => ({
        id: "sync_refresh",
        providerConnectionId: "conn_test",
        provider: "mock" as const,
        status: "syncing" as const,
        message: "Refresh requested.",
        startedAt: "2026-06-30T09:00:00.000Z",
        finishedAt: null,
      })),
      revokeConnection: vi.fn(),
    };
    const accounts: Account[] = [];
    const transactions: Transaction[] = [];
    const syncEvents: ProviderSyncEvent[] = [];

    const result = await syncBankConnection({
      userId: "user_test",
      connection: baseConnection,
      provider,
      dependencies: {
        upsertAccount: async (account) => {
          accounts.push(account);
          return account;
        },
        upsertTransaction: async (transaction) => {
          transactions.push(transaction);
          return transaction;
        },
        recordProviderSyncEvent: async (event) => {
          syncEvents.push(event);
          return event;
        },
        updateBankConnectionStatus: async (connection) => connection,
      },
    });

    expect(result.status).toBe("success");
    expect(result.accountsUpserted).toBe(1);
    expect(result.transactionsUpserted).toBe(1);
    expect(accounts[0].providerAccountId).toBe("provider_current_1");
    expect(transactions[0].merchant).toBe("Sandbox Grocers");
    expect(syncEvents.map((event) => event.status)).toEqual(["syncing", "syncing", "connected"]);
    expect(result.auditEvents.map((event) => event.eventType)).toContain(
      "bank_connection_sync_completed",
    );
  });

  it("sync workflow creates failure sync events and audit events", async () => {
    const provider: OpenBankingProviderAdapter = {
      createConnection: vi.fn(),
      handleCallback: vi.fn(),
      getConnectionStatus: vi.fn(),
      getAccounts: vi.fn(async () => {
        throw new ProviderSafeError(
          "provider_sync_failed",
          "Provider sync failed safely.",
          500,
        );
      }),
      getTransactions: vi.fn(),
      refreshConnection: vi.fn(async () => ({
        id: "sync_refresh",
        providerConnectionId: "conn_test",
        provider: "mock" as const,
        status: "syncing" as const,
        message: "Refresh requested.",
        startedAt: "2026-06-30T09:00:00.000Z",
        finishedAt: null,
      })),
      revokeConnection: vi.fn(),
    };
    const syncEvents: ProviderSyncEvent[] = [];

    const result = await syncBankConnection({
      userId: "user_test",
      connection: baseConnection,
      provider,
      dependencies: {
        upsertAccount: async (account) => account,
        upsertTransaction: async (transaction) => transaction,
        recordProviderSyncEvent: async (event) => {
          syncEvents.push(event);
          return event;
        },
        updateBankConnectionStatus: async (connection) => connection,
      },
    });

    expect(result.status).toBe("failed");
    expect(result.connection.status).toBe("sync_failed");
    expect(syncEvents.map((event) => event.status)).toEqual(["syncing", "syncing", "sync_failed"]);
    expect(result.auditEvents.map((event) => event.eventType)).toContain(
      "bank_connection_sync_failed",
    );
  });

  it("connected accounts UI handles provider not configured", () => {
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[]}
        providerState={{
          provider: "moneyhub",
          configured: false,
          safeMessage: "Moneyhub sandbox credentials are not configured.",
        }}
      />,
    );

    expect(html).toContain("Moneyhub sandbox credentials are not configured");
    expect(html).toContain("Start sandbox connection");
  });

  it("connected accounts UI handles sync failed state", () => {
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[
          {
            ...baseConnection,
            status: "sync_failed",
            errorMessage: "Provider-safe sync failure.",
          },
        ]}
        providerState={{
          provider: "mock",
          configured: true,
          safeMessage: "Mock provider is active.",
        }}
      />,
    );

    expect(html).toContain("sync failed");
    expect(html).toContain("Provider-safe sync failure.");
  });
});
