import { createHmac } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionsExplorer } from "../src/components/transactions/transactions-explorer";
import type {
  Account,
  BankConnection,
  ProviderSyncEvent,
  Transaction,
} from "../src/lib/domain";
import { suggestAccountPurpose } from "../src/lib/bank-providers/account-purpose-suggestions";
import { MoneyhubProvider, type MoneyhubClientLike } from "../src/lib/bank-providers/moneyhub-provider";
import {
  getMoneyhubProviderConfig,
  getMoneyhubSandboxReadiness,
  type MoneyhubProviderConfig,
} from "../src/lib/bank-providers/provider-config";
import { ProviderSafeError } from "../src/lib/bank-providers/provider-errors";
import {
  mapProviderAccountPayload,
  mergeSyncedTransaction,
} from "../src/lib/bank-providers/provider-mappers";
import { syncBankConnection } from "../src/lib/bank-providers/sync-workflow";
import {
  getProviderToken,
  saveProviderToken,
  toClientSafeTokenRecord,
} from "../src/lib/bank-providers/token-store";
import { mockCategories } from "../src/lib/mock-data";

const configuredMoneyhub: MoneyhubProviderConfig = {
  provider: "moneyhub",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:3000/api/bank-connections/callback",
  webhookSecret: "webhook-secret",
  apiBaseUrl: "https://api.moneyhub.co.uk/v2.0",
  authBaseUrl: "https://identity.moneyhub.co.uk",
  jwksUrl: null,
  privateKey: null,
  keyId: null,
  configured: true,
  sandboxMode: true,
};

const baseConnection: BankConnection = {
  id: "conn_moneyhub_test",
  provider: "moneyhub",
  institutionName: "Moneyhub sandbox",
  institutionId: "moneyhub_sandbox",
  status: "connected",
  consentStatus: "active",
  consentStartedAt: "2026-06-30T09:00:00.000Z",
  consentExpiresAt: "2026-09-30T09:00:00.000Z",
  lastSyncedAt: null,
  errorMessage: null,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

function moneyhubClient(overrides: Partial<MoneyhubClientLike> = {}): MoneyhubClientLike {
  return {
    getAuthorizeUrlForCreatedUser: vi.fn(async ({ state }) => `https://auth.moneyhub.test?state=${state}`),
    exchangeCodeForTokens: vi.fn(async () => ({
      expires_in: 3600,
      claims: () => ({ sub: "mh_user_001", "mh:con_id": "mh_connection_001" }),
    })),
    syncUserConnection: vi.fn(async () => ({ data: { status: "completed" } })),
    getAccounts: vi.fn(async () => ({
      data: [
        {
          id: "mh_account_001",
          connectionId: "mh_connection_001",
          providerName: "Nationwide",
          providerId: "nationwide",
          accountName: "FlexDirect",
          productName: "Nationwide FlexDirect Current Account",
          type: "cash:current",
          balance: { amount: { value: 1234.56, currency: "GBP" }, date: "2026-06-30" },
          accountReference: "12345678",
        },
      ],
    })),
    getTransactions: vi.fn(async () => ({
      data: [
        {
          id: "mh_txn_001",
          accountId: "mh_account_001",
          amount: { value: -22.4, currency: "GBP" },
          date: "2026-06-30",
          dateModified: "2026-06-30T12:00:00.000Z",
          longDescription: "Sandbox Grocers",
          shortDescription: "Grocers",
          status: "posted",
          categoryId: "cat_groceries",
          proprietaryTransactionCode: { code: "CARD" },
        },
      ],
    })),
    getUserConnections: vi.fn(async () => ({ data: [] })),
    registerUser: vi.fn(async () => ({ id: "mh_registered_user_001" })),
    deleteUserConnection: vi.fn(async () => 204),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/server/route-auth");
  vi.doUnmock("@/lib/bank-providers/provider-service");
  vi.doUnmock("@/lib/repositories/finance-repository");
  vi.doUnmock("@/lib/repositories/notification-repository");
  vi.resetModules();
});

describe("phase 7 Moneyhub sandbox proof of concept", () => {
  it("reports Moneyhub readiness without exposing secret values", () => {
    vi.stubEnv("OPEN_BANKING_PROVIDER", "moneyhub");
    vi.stubEnv("MONEYHUB_CLIENT_ID", "client-id");
    vi.stubEnv("MONEYHUB_CLIENT_SECRET", "secret-value");
    vi.stubEnv("MONEYHUB_REDIRECT_URI", "http://localhost:3000/api/bank-connections/callback");

    const readiness = getMoneyhubSandboxReadiness();

    expect(readiness.providerSelected).toBe(true);
    expect(readiness.configured).toBe(true);
    expect(readiness.redirectUri).toContain("/api/bank-connections/callback");
    expect(JSON.stringify(readiness)).not.toContain("secret-value");
  });

  it("returns safe missing environment output", () => {
    vi.stubEnv("OPEN_BANKING_PROVIDER", "moneyhub");
    vi.stubEnv("MONEYHUB_CLIENT_ID", "");
    vi.stubEnv("MONEYHUB_CLIENT_SECRET", "");

    const readiness = getMoneyhubSandboxReadiness();

    expect(readiness.configured).toBe(false);
    expect(readiness.missingEnvironment).toContain("MONEYHUB_CLIENT_ID");
    expect(readiness.missingEnvironment).toContain("MONEYHUB_CLIENT_SECRET");
    expect(readiness.safeMessage).toContain("Mock provider remains available");
  });

  it("creates Moneyhub authorisation URLs with state and stores callback token metadata", async () => {
    const client = moneyhubClient();
    const provider = new MoneyhubProvider(configuredMoneyhub, async () => client);
    const start = await provider.createConnection({
      userId: "user_test",
      institutionId: "moneyhub_test_bank",
      institutionName: "Moneyhub test bank",
    });

    expect(start.providerConfigured).toBe(true);
    expect(start.authorizationUrl).toContain(start.state);
    expect(client.getAuthorizeUrlForCreatedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        bankId: "moneyhub_test_bank",
        userId: "mh_registered_user_001",
        state: start.state,
      }),
    );

    const callback = await provider.handleCallback({
      code: "sandbox-code",
      state: start.state,
      userId: "user_test",
    });
    const token = await getProviderToken("user_test", callback.connection.id);

    expect(callback.connection.status).toBe("connected");
    expect(token?.providerUserId).toBe("mh_user_001");
    expect(token?.providerConnectionId).toBe("mh_connection_001");
    expect(JSON.stringify(toClientSafeTokenRecord(token))).not.toContain("sandbox-code");
  });

  it("handles cancelled Moneyhub callbacks safely", async () => {
    const provider = new MoneyhubProvider(configuredMoneyhub, async () => moneyhubClient());

    await expect(
      provider.handleCallback({
        code: null,
        state: "missing-state",
        userId: "user_test",
        error: "access_denied",
      }),
    ).rejects.toMatchObject({
      code: "provider_callback_failed",
      userMessage: "The Moneyhub consent flow was cancelled or failed.",
    });
  });

  it("maps account-purpose defaults for Amex, Nationwide, and Revolut", () => {
    const amex = mapProviderAccountPayload(
      {
        id: "amex_001",
        institution: { id: "amex", name: "American Express" },
        accountName: "Amex card",
        type: "card",
        balance: { amount: { value: 120, currency: "GBP" } },
      },
      baseConnection,
    );
    const nationwide = mapProviderAccountPayload(
      {
        id: "nw_bills",
        institution: { id: "nationwide", name: "Nationwide" },
        accountName: "Bills pot",
        type: "cash:current",
        balance: { amount: { value: 900, currency: "GBP" } },
      },
      baseConnection,
    );
    const revolut = mapProviderAccountPayload(
      {
        id: "rev_vault",
        institution: { id: "revolut", name: "Revolut" },
        accountName: "Holiday vault",
        type: "savings",
        subtype: "vault",
        balance: { amount: { value: 500, currency: "GBP" } },
      },
      baseConnection,
    );

    expect(suggestAccountPurpose(amex).purpose).toBe("credit_card");
    expect(suggestAccountPurpose(amex).includeInSafeToSpend).toBe(false);
    expect(suggestAccountPurpose(nationwide).purpose).toBe("bills_account");
    expect(suggestAccountPurpose(nationwide).includeInSafeToSpend).toBe(false);
    expect(suggestAccountPurpose(revolut).purpose).toBe("pocket");
    expect(suggestAccountPurpose(revolut).includeInSafeToSpend).toBe(false);
  });

  it("sync workflow uses Moneyhub accounts and transactions without duplicating repeat syncs", async () => {
    const client = moneyhubClient();
    const provider = new MoneyhubProvider(configuredMoneyhub, async () => client);
    const accounts = new Map<string, Account>();
    const transactions = new Map<string, Transaction>();
    const syncEvents: ProviderSyncEvent[] = [];
    const result = await syncBankConnection({
      userId: "user_test",
      connection: baseConnection,
      provider,
      providerContext: {
        providerUserId: "mh_user_001",
        providerConnectionId: "mh_connection_001",
        tokenReference: "token-ref:moneyhub:conn_moneyhub_test",
      },
      dependencies: {
        upsertAccount: async (account) => {
          accounts.set(account.id, account);
          return account;
        },
        upsertTransaction: async (transaction) => {
          transactions.set(transaction.id, transaction);
          return transaction;
        },
        recordProviderSyncEvent: async (event) => {
          syncEvents.push(event);
          return event;
        },
        updateBankConnectionStatus: async (connection) => connection,
      },
    });
    await syncBankConnection({
      userId: "user_test",
      connection: baseConnection,
      provider,
      providerContext: {
        providerUserId: "mh_user_001",
        providerConnectionId: "mh_connection_001",
      },
      dependencies: {
        upsertAccount: async (account) => {
          accounts.set(account.id, account);
          return account;
        },
        upsertTransaction: async (transaction) => {
          transactions.set(transaction.id, transaction);
          return transaction;
        },
        recordProviderSyncEvent: async (event) => event,
        updateBankConnectionStatus: async (connection) => connection,
      },
    });

    expect(result.status).toBe("success");
    expect(accounts.size).toBe(1);
    expect(transactions.size).toBe(1);
    expect([...transactions.values()][0].providerTransactionId).toBe("mh_txn_001");
    expect(syncEvents.map((event) => event.status)).toEqual(["syncing", "syncing", "connected"]);
    expect(result.auditEvents.map((event) => event.eventType)).toContain(
      "bank_connection_sync_completed",
    );
  });

  it("preserves reviewed user transaction categories on provider updates", () => {
    const existing: Transaction = {
      id: "txn_existing",
      accountId: "acct_001",
      categoryId: "cat_personal",
      providerConnectionId: "conn_moneyhub_test",
      providerTransactionId: "mh_txn_001",
      providerUpdatedAt: "2026-06-29T09:00:00.000Z",
      date: "2026-06-29",
      merchant: "Existing merchant",
      description: "Existing description",
      amount: -10,
      currency: "GBP",
      kind: "expense",
      status: "reviewed",
      flags: ["user_checked"],
      pending: false,
      createdAt: "2026-06-29T09:00:00.000Z",
      updatedAt: "2026-06-29T09:00:00.000Z",
    };
    const incoming: Transaction = {
      ...existing,
      categoryId: "cat_uncategorised",
      status: "needs_review",
      flags: [],
      providerUpdatedAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    };

    const merged = mergeSyncedTransaction(existing, incoming);

    expect(merged.categoryId).toBe("cat_personal");
    expect(merged.status).toBe("reviewed");
    expect(merged.flags).toContain("user_checked");
  });

  it("renders synced transactions with account and institution context", () => {
    const account: Account = {
      id: "acct_moneyhub_current",
      userId: "user_test",
      providerConnectionId: "conn_moneyhub_test",
      providerAccountId: "mh_account_001",
      institutionName: "Nationwide",
      institutionId: "nationwide",
      name: "FlexDirect",
      officialName: "Nationwide FlexDirect Current Account",
      type: "current_account",
      subtype: "current",
      currency: "GBP",
      balance: 100,
      availableBalance: 100,
      creditLimit: null,
      mask: "1234",
      purpose: "main_current_account",
      accountRole: "spending",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: true,
      isSpendingAccount: true,
      isBillsAccount: false,
      isSavingsAccount: false,
      linkedGoalIds: [],
      syncStatus: "connected",
      lastSyncedAt: "2026-06-30T09:00:00.000Z",
      consentExpiresAt: "2026-09-30T09:00:00.000Z",
      notes: null,
      provider: "moneyhub",
      status: "active",
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    };
    const transaction: Transaction = {
      id: "txn_moneyhub",
      accountId: account.id,
      categoryId: "cat_groceries",
      providerConnectionId: "conn_moneyhub_test",
      providerTransactionId: "mh_txn_001",
      providerUpdatedAt: "2026-06-30T12:00:00.000Z",
      date: "2026-06-30",
      merchant: "Sandbox Grocers",
      description: "Sandbox grocery transaction",
      amount: -22.4,
      currency: "GBP",
      kind: "expense",
      status: "needs_review",
      flags: [],
      pending: false,
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    };

    const html = renderToStaticMarkup(
      <TransactionsExplorer
        transactions={[transaction]}
        accounts={[account]}
        categories={mockCategories}
      />,
    );

    expect(html).toContain("Sandbox Grocers");
    expect(html).toContain("FlexDirect");
    expect(html).toContain("Nationwide");
    expect(html).toContain("Groceries");
  });

  it("start route returns provider state from a mocked adapter", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_test" }, supabase: {} }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        createConnection: async () => ({
          connection: baseConnection,
          authorizationUrl: "https://auth.moneyhub.test?state=state_test",
          providerConfigured: true,
          state: "state_test",
          safeMessage: null,
        }),
      }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      upsertBankConnection: async (connection: BankConnection) => connection,
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { POST } = await import("../src/app/api/bank-connections/start/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "moneyhub" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("state_test");
    expect(payload.authorizationUrl).toContain("state_test");
  });

  it("callback route redirects after mocked provider success", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_test" }, supabase: {} }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        handleCallback: async () => ({
          connection: baseConnection,
          safeMessage: "ok",
        }),
      }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      upsertBankConnection: async (connection: BankConnection) => connection,
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { GET } = await import("../src/app/api/bank-connections/callback/route");
    const response = await GET(
      new Request(
        "http://localhost/api/bank-connections/callback?code=test-code&state=state_test",
      ),
    );

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("location")).toContain("connection=connected");
  });

  it("sync route rejects a connection that is not owned or visible to the user", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_test" }, supabase: {} }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async () => null,
      recordAuditEvent: async (event: unknown) => event,
      recordProviderSyncEvent: async (event: unknown) => event,
      updateBankConnectionStatus: async (connection: unknown) => connection,
      upsertAccount: async (account: unknown) => account,
      upsertTransaction: async (transaction: unknown) => transaction,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/sync/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_missing/sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_missing" }) },
    );

    expect(response.status).toBe(404);
  });

  it("webhook route rejects invalid signatures and invalid payloads", async () => {
    vi.stubEnv("MONEYHUB_WEBHOOK_SECRET", "webhook-secret");
    const { POST } = await import("../src/app/api/bank-connections/webhook/moneyhub/route");
    const invalidSignature = await POST(
      new Request("http://localhost/api/bank-connections/webhook/moneyhub", {
        method: "POST",
        headers: { "x-moneyhub-signature": "bad" },
        body: JSON.stringify({ eventType: "sync", connectionId: "conn_moneyhub_test" }),
      }),
    );
    const body = JSON.stringify({ eventType: "sync" });
    const signature = `sha256=${createHmac("sha256", "webhook-secret").update(body).digest("hex")}`;
    const invalidPayload = await POST(
      new Request("http://localhost/api/bank-connections/webhook/moneyhub", {
        method: "POST",
        headers: { "x-moneyhub-signature": signature },
        body,
      }),
    );

    expect(invalidSignature.status).toBe(401);
    expect(invalidPayload.status).toBe(400);
  });

  it("keeps token values out of client-safe payloads", async () => {
    const token = await saveProviderToken({
      userId: "user_safe",
      connectionId: "conn_moneyhub_safe",
      provider: "moneyhub",
      encryptedTokenPlaceholder: "access-token-secret refresh-token-secret",
      providerUserId: "mh_user_safe",
      providerConnectionId: "mh_connection_safe",
      expiresAt: "2026-09-30T09:00:00.000Z",
      scopes: ["accounts:read"],
    });
    const safe = toClientSafeTokenRecord(token);
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain("access-token-secret");
    expect(serialized).not.toContain("refresh-token-secret");
    expect(serialized).not.toContain("client-secret");
  });

  it("surfaces provider-safe errors for Moneyhub client failures", async () => {
    const provider = new MoneyhubProvider(configuredMoneyhub, async () => {
      throw new Error("access_token=secret-token");
    });

    await expect(
      provider.getAccounts("conn_moneyhub_test", {
        providerUserId: "mh_user_001",
      }),
    ).rejects.toBeInstanceOf(ProviderSafeError);
  });

  it("builds config from Moneyhub environment placeholders", () => {
    vi.stubEnv("MONEYHUB_CLIENT_ID", "client-id");
    vi.stubEnv("MONEYHUB_CLIENT_SECRET", "client-secret");
    vi.stubEnv("MONEYHUB_REDIRECT_URI", "http://localhost:3000/api/bank-connections/callback");
    vi.stubEnv("MONEYHUB_JWKS_URL", "https://example.test/jwks.json");
    vi.stubEnv("MONEYHUB_KEY_ID", "key-id");

    const config = getMoneyhubProviderConfig();

    expect(config.configured).toBe(true);
    expect(config.jwksUrl).toBe("https://example.test/jwks.json");
    expect(config.keyId).toBe("key-id");
  });
});
