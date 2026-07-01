import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConnectedAccountsManager,
  isDeadPreConsentConnection,
} from "../src/components/connected-accounts/connected-accounts-manager";
import type {
  Account,
  BankConnection,
  ProviderSyncEvent,
  Transaction,
} from "../src/lib/domain";
import {
  getProviderComparisonCapabilities,
  getTrueLayerSandboxReadiness,
  type TrueLayerProviderConfig,
} from "../src/lib/bank-providers/provider-config";
import { getProviderAdapter } from "../src/lib/bank-providers/provider-service";
import { syncBankConnection } from "../src/lib/bank-providers/sync-workflow";
import {
  buildTrueLayerAuthorizationUrl,
  TrueLayerProvider,
  truelayerAccountPayload,
  truelayerTransactionPayload,
  type TrueLayerClientLike,
} from "../src/lib/bank-providers/truelayer-provider";
import {
  deterministicProviderCategory,
  providerTransactionToTransaction,
} from "../src/lib/bank-providers/provider-mappers";
import {
  getProviderToken,
  getProviderTokenForSync,
  toClientSafeTokenRecord,
} from "../src/lib/bank-providers/token-store";

const configuredTrueLayer: TrueLayerProviderConfig = {
  provider: "truelayer",
  openBankingEnabled: true,
  clientId: "truelayer-client",
  clientSecret: "truelayer-secret",
  redirectUri: "http://localhost:3000/api/bank-connections/callback",
  webhookSecret: "truelayer-webhook-secret",
  apiBaseUrl: "https://api.truelayer-sandbox.com",
  authBaseUrl: "https://auth.truelayer-sandbox.com",
  scopes: ["info", "accounts", "balance", "cards", "transactions", "offline_access"],
  configured: true,
  sandboxMode: true,
  mode: "sandbox",
  cardsEnabled: true,
};

const liveTrueLayer: TrueLayerProviderConfig = {
  ...configuredTrueLayer,
  authBaseUrl: "https://auth.truelayer.com",
  apiBaseUrl: "https://api.truelayer.com",
  sandboxMode: false,
  mode: "live",
};

const baseConnection: BankConnection = {
  id: "conn_truelayer_test",
  provider: "truelayer",
  institutionName: "TrueLayer sandbox",
  institutionId: "truelayer_sandbox",
  status: "connected",
  consentStatus: "active",
  consentStartedAt: "2026-06-30T09:00:00.000Z",
  consentExpiresAt: "2026-09-30T09:00:00.000Z",
  lastSyncedAt: null,
  errorMessage: null,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

function truelayerClient(overrides: Partial<TrueLayerClientLike> = {}): TrueLayerClientLike {
  return {
    exchangeCodeForTokens: vi.fn(async () => ({
      access_token: "tl-access-token",
      refresh_token: "tl-refresh-token",
      expires_in: 3600,
      sub: "tl_user_001",
    })),
    refreshConnection: vi.fn(async () => undefined),
    getAccounts: vi.fn(async () => [
      {
        account_id: "tl_account_current",
        account_type: "TRANSACTION",
        display_name: "Nationwide FlexDirect",
        currency: "GBP",
        provider: {
          display_name: "Nationwide",
          provider_id: "nationwide",
        },
        account_number: {
          number: "12345678",
        },
      },
      {
        account_id: "tl_account_saver",
        account_type: "SAVINGS",
        display_name: "Revolut Savings Pocket",
        currency: "GBP",
        provider: {
          display_name: "Revolut",
          provider_id: "revolut",
        },
      },
    ]),
    getCards: vi.fn(async () => [
      {
        card_id: "tl_card_amex",
        display_name: "American Express Platinum",
        currency: "GBP",
        provider: {
          display_name: "American Express",
          provider_id: "amex",
        },
      },
    ]),
    getBalances: vi.fn(async () => [
      {
        account_id: "tl_account_current",
        current: 1200,
        available: 1100,
        currency: "GBP",
      },
      {
        account_id: "tl_account_saver",
        current: 600,
        available: 600,
        currency: "GBP",
      },
      {
        account_id: "tl_card_amex",
        current: 250,
        available: 1750,
        credit_limit: 2000,
        currency: "GBP",
      },
    ]),
    getTransactions: vi.fn(async (query) => [
      {
        transaction_id: `tl_txn_${query.providerAccountId}`,
        account_id: query.providerAccountId,
        timestamp: "2026-06-30T12:00:00.000Z",
        description: "TESCO STORES",
        merchant_name: "Tesco",
        amount: -32.45,
        currency: "GBP",
        transaction_category: "PURCHASE",
        status: "posted",
      },
    ]),
    revokeConnection: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("phase 12A TrueLayer provider comparison", () => {
  it("reports TrueLayer readiness without exposing secret values", () => {
    vi.stubEnv("OPEN_BANKING_PROVIDER", "truelayer");
    vi.stubEnv("OPEN_BANKING_ENABLED", "true");
    vi.stubEnv("TRUELAYER_CLIENT_ID", "client-id");
    vi.stubEnv("TRUELAYER_CLIENT_SECRET", "secret-value");
    vi.stubEnv("TRUELAYER_REDIRECT_URI", configuredTrueLayer.redirectUri!);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "x".repeat(32));

    const readiness = getTrueLayerSandboxReadiness();
    const serialised = JSON.stringify(readiness);

    expect(readiness.providerSelected).toBe(true);
    expect(readiness.configured).toBe(true);
    expect(readiness.redirectUri).toContain("/api/bank-connections/callback");
    expect(serialised).not.toContain("secret-value");
    expect(serialised).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("returns safe missing TrueLayer environment output", () => {
    vi.stubEnv("OPEN_BANKING_PROVIDER", "truelayer");
    vi.stubEnv("OPEN_BANKING_ENABLED", "true");
    vi.stubEnv("TRUELAYER_CLIENT_ID", "");
    vi.stubEnv("TRUELAYER_CLIENT_SECRET", "");

    const readiness = getTrueLayerSandboxReadiness();

    expect(readiness.configured).toBe(false);
    expect(readiness.missingEnvironment).toContain("TRUELAYER_CLIENT_ID");
    expect(readiness.missingEnvironment).toContain("TRUELAYER_CLIENT_SECRET");
    expect(readiness.safeMessage).toContain("Mock provider remains available");
  });

  it("keeps TrueLayer disabled until Open Banking is explicitly enabled", () => {
    vi.stubEnv("OPEN_BANKING_PROVIDER", "truelayer");
    vi.stubEnv("TRUELAYER_CLIENT_ID", "client-id");
    vi.stubEnv("TRUELAYER_CLIENT_SECRET", "secret-value");
    vi.stubEnv("TRUELAYER_REDIRECT_URI", configuredTrueLayer.redirectUri!);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "x".repeat(32));

    const readiness = getTrueLayerSandboxReadiness();

    expect(readiness.configured).toBe(false);
    expect(readiness.providerClientCanBeInitialised).toBe(false);
    expect(readiness.safeMessage).toContain("Open Banking is disabled");
  });

  it("selects mock, Moneyhub, and TrueLayer provider adapters", () => {
    expect(getProviderAdapter("mock")).toBeTruthy();
    expect(getProviderAdapter("moneyhub")).toBeTruthy();
    expect(getProviderAdapter("truelayer")).toBeInstanceOf(TrueLayerProvider);
  });

  it("maps TrueLayer account payloads into canonical account types", () => {
    const current = truelayerAccountPayload(
      {
        account_id: "tl_current",
        account_type: "TRANSACTION",
        display_name: "Nationwide Current Account",
        currency: "GBP",
        provider: { display_name: "Nationwide", provider_id: "nationwide" },
      },
      [{ account_id: "tl_current", current: 500, available: 450, currency: "GBP" }],
    );
    const card = truelayerAccountPayload(
      {
        card_id: "tl_amex",
        display_name: "American Express Platinum",
        currency: "GBP",
        provider: { display_name: "American Express", provider_id: "amex" },
      },
      [{ account_id: "tl_amex", current: 200, available: 1800, credit_limit: 2000 }],
    );

    expect(current.providerAccountId).toBe("tl_current");
    expect(current.institution?.name).toBe("Nationwide");
    expect(current.availableBalance).toBe(450);
    expect(card.type).toBe("credit_card");
    expect(card.creditLimit).toBe(2000);
  });

  it("maps TrueLayer transaction payloads into canonical transaction payloads", () => {
    const mapped = truelayerTransactionPayload({
      transaction_id: "tl_txn_001",
      account_id: "tl_account_current",
      timestamp: "2026-06-30T12:00:00.000Z",
      description: "PAYPAL *SPOTIFY",
      merchant_name: "Spotify",
      amount: -10.99,
      currency: "GBP",
      transaction_category: "PURCHASE",
      status: "pending",
    });

    expect(mapped.transactionId).toBe("tl_txn_001");
    expect(mapped.accountId).toBe("tl_account_current");
    expect(mapped.merchant).toBe("Spotify");
    expect(mapped.pending).toBe(true);
  });

  it("builds the TrueLayer auth URL from configured scopes and redirect URI", async () => {
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());
    const start = await provider.createConnection({
      userId: "user_test",
      institutionId: "truelayer_sandbox",
      institutionName: "TrueLayer sandbox",
    });
    const url = new URL(start.authorizationUrl ?? "");

    expect(url.searchParams.get("redirect_uri")).toBe(configuredTrueLayer.redirectUri);
    expect(url.searchParams.get("scope")).toBe(configuredTrueLayer.scopes.join(" "));
    expect(url.searchParams.get("client_id")).toBe(configuredTrueLayer.clientId);
    expect(url.searchParams.get("state")).toBe(start.state);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("providers")).toBe("uk-cs-mock");
    expect(url.searchParams.has("nonce")).toBe(false);
    expect(url.hostname).toBe("auth.truelayer-sandbox.com");
  });

  it("does not force the sandbox mock provider for live TrueLayer auth URLs", () => {
    const { authorizationUrl } = buildTrueLayerAuthorizationUrl({
      config: liveTrueLayer,
      redirectUri: "https://finance-hq-alpha.vercel.app/api/bank-connections/callback",
      state: "state_live",
    });

    expect(authorizationUrl.hostname).toBe("auth.truelayer.com");
    expect(authorizationUrl.searchParams.get("providers")).toBeNull();
  });

  it("serialises TrueLayer auth URL scopes and redirect URI exactly", () => {
    const redirectUri = "https://finance-hq-alpha.vercel.app/api/bank-connections/callback";
    const { authorizationUrl } = buildTrueLayerAuthorizationUrl({
      config: configuredTrueLayer,
      redirectUri,
      state: "state_exact",
    });

    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "info accounts balance cards transactions offline_access",
    );
  });

  it("logs safe TrueLayer auth diagnostics without secrets or tokens", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());

    await provider.createConnection({
      userId: "user_test",
      institutionId: "truelayer_sandbox",
      institutionName: "TrueLayer sandbox",
    });

    const logged = consoleSpy.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(logged).toContain("auth.truelayer-sandbox.com");
    expect(logged).toContain("uk-cs-mock");
    expect(logged).toContain("redirectUriHostname");
    expect(logged).not.toContain(configuredTrueLayer.clientSecret);
    expect(logged).not.toContain("tl-access-token");
    expect(logged).not.toContain("tl-refresh-token");
    expect(logged).not.toContain("sandbox-code");
  });

  it("rejects invalid TrueLayer callback state", async () => {
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());

    await expect(
      provider.handleCallback({
        code: "sandbox-code",
        state: "invalid-state",
        userId: "user_test",
      }),
    ).rejects.toMatchObject({
      code: "provider_callback_failed",
    });
  });

  it("maps simple deterministic categories without AI", () => {
    const providerTransaction = {
      id: "ptxn_tesco",
      providerConnectionId: "conn_truelayer_test",
      providerAccountId: "tl_account_current",
      providerTransactionId: "tl_txn_tesco",
      date: "2026-06-30",
      providerUpdatedAt: null,
      providerStatus: "posted" as const,
      merchant: "Tesco",
      description: "TESCO STORES",
      amount: -32.45,
      currency: "GBP" as const,
      pending: false,
      category: "PURCHASE",
      isOwnAccountTransfer: false,
    };

    expect(deterministicProviderCategory(providerTransaction)).toBe("cat_groceries");
    expect(providerTransactionToTransaction(providerTransaction, "acct_current").categoryId).toBe(
      "cat_groceries",
    );
  });

  it("handles TrueLayer callback state and stores safe token metadata", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "x".repeat(32));
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());
    const start = await provider.createConnection({
      userId: "user_test",
      institutionId: "truelayer_sandbox",
      institutionName: "TrueLayer sandbox",
    });
    const callback = await provider.handleCallback({
      code: "sandbox-code",
      state: start.state,
      userId: "user_test",
    });
    const token = await getProviderToken("user_test", callback.connection.id);
    const clientSafeToken = toClientSafeTokenRecord(token);

    expect(callback.connection.provider).toBe("truelayer");
    expect(callback.connection.status).toBe("connected");
    expect(token?.providerUserId).toBe("tl_user_001");
    expect(token?.tokenReference).toBeTruthy();
    expect(token?.tokenReference).not.toContain("token-ref:");
    expect(JSON.stringify(clientSafeToken)).not.toContain("sandbox-code");
    expect(JSON.stringify(clientSafeToken)).not.toContain(configuredTrueLayer.clientSecret);
    expect(JSON.stringify(clientSafeToken)).not.toContain(token?.tokenReference ?? "");
  });

  it("does not return a connected callback result when token storage cannot encrypt", async () => {
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());
    const start = await provider.createConnection({
      userId: "user_token_fail",
      institutionId: "truelayer_sandbox",
      institutionName: "TrueLayer sandbox",
    });

    await expect(
      provider.handleCallback({
        code: "sandbox-code",
        state: start.state,
        userId: "user_token_fail",
      }),
    ).rejects.toMatchObject({
      code: "provider_callback_failed",
      userMessage: "Open Banking token encryption is not configured.",
    });
  });

  it("uses the same connectionId for BankConnection and providerToken", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "x".repeat(32));
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());
    const start = await provider.createConnection({
      userId: "user_linked",
      institutionId: "truelayer_sandbox",
      institutionName: "TrueLayer sandbox",
    });
    const callback = await provider.handleCallback({
      code: "sandbox-code",
      state: start.state,
      userId: "user_linked",
    });
    const preflight = await getProviderTokenForSync("user_linked", callback.connection.id);

    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.record.connectionId).toBe(callback.connection.id);
  });

  it("syncs TrueLayer mocked accounts and transactions through the generic workflow", async () => {
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => truelayerClient());
    const accounts = new Map<string, Account>();
    const transactions = new Map<string, Transaction>();
    const syncEvents: ProviderSyncEvent[] = [];
    const result = await syncBankConnection({
      userId: "user_test",
      connection: baseConnection,
      provider,
      providerContext: {
        tokenReference: "token-ref:truelayer:conn_truelayer_test",
        providerUserId: "tl_user_001",
        providerConnectionId: "conn_truelayer_test",
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

    expect(result.status).toBe("success");
    expect(accounts.size).toBe(3);
    expect(transactions.size).toBe(3);
    expect(syncEvents.some((event) => event.provider === "truelayer")).toBe(true);
    expect([...accounts.values()].some((account) => account.provider === "truelayer")).toBe(true);
  });

  it("revokes TrueLayer safely without exposing tokens", async () => {
    const client = truelayerClient();
    const provider = new TrueLayerProvider(configuredTrueLayer, async () => client);
    const revoked = await provider.revokeConnection("conn_truelayer_test", {
      tokenReference: "token-ref:truelayer:conn_truelayer_test",
    });

    expect(revoked.status).toBe("disconnected");
    expect(revoked.consentStatus).toBe("revoked");
    expect(client.revokeConnection).toHaveBeenCalled();
  });

  it("rejects invalid TrueLayer webhook payloads and signatures", async () => {
    vi.stubEnv("TRUELAYER_WEBHOOK_SECRET", "webhook-secret");
    const { POST } = await import("../src/app/api/bank-connections/webhook/truelayer/route");
    const badSignature = await POST(
      new Request("http://localhost/api/bank-connections/webhook/truelayer", {
        method: "POST",
        headers: { "x-truelayer-signature": "bad" },
        body: JSON.stringify({ event_type: "transactions.created" }),
      }),
    );

    expect(badSignature.status).toBe(401);

    vi.stubEnv("TRUELAYER_WEBHOOK_SECRET", "");
    const invalidPayload = await POST(
      new Request("http://localhost/api/bank-connections/webhook/truelayer", {
        method: "POST",
        headers: { "x-truelayer-signature": "stub" },
        body: JSON.stringify({ event_type: "unknown" }),
      }),
    );

    expect(invalidPayload.status).toBe(400);
  });

  it("renders provider comparison UI for Moneyhub, TrueLayer, and target institutions", () => {
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[]}
        providerState={{
          provider: "mock",
          configured: true,
          safeMessage: "Mock provider is active.",
          providerComparison: getProviderComparisonCapabilities(),
        }}
      />,
    );

    expect(html).toContain("Provider comparison");
    expect(html).toContain("Moneyhub");
    expect(html).toContain("TrueLayer");
    expect(html).toContain("American Express");
    expect(html).toContain("Nationwide");
    expect(html).toContain("Revolut");
  });

  it("hides dead pre-consent records but keeps historical connected or synced records visible", () => {
    const deadPending: BankConnection = {
      ...baseConnection,
      id: "conn_dead_pending",
      status: "disconnected",
      consentStatus: "revoked",
      consentCompletedAt: null,
      lastSyncedAt: null,
    };
    const historicalRevoked: BankConnection = {
      ...baseConnection,
      id: "conn_historical",
      status: "disconnected",
      consentStatus: "revoked",
      consentCompletedAt: "2026-06-30T09:00:00.000Z",
      lastSyncedAt: null,
      institutionName: "Historical TrueLayer",
    };
    const syncedRevoked: BankConnection = {
      ...baseConnection,
      id: "conn_synced",
      status: "disconnected",
      consentStatus: "revoked",
      consentCompletedAt: null,
      lastSyncedAt: "2026-06-30T09:00:00.000Z",
      institutionName: "Synced TrueLayer",
    };
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[deadPending, historicalRevoked, syncedRevoked]}
        providerState={{
          provider: "truelayer",
          configured: true,
          safeMessage: "TrueLayer configured.",
        }}
      />,
    );

    expect(isDeadPreConsentConnection(deadPending)).toBe(true);
    expect(isDeadPreConsentConnection(historicalRevoked)).toBe(false);
    expect(isDeadPreConsentConnection(syncedRevoked)).toBe(false);
    expect(html).toContain("dead pending records are");
    expect(html).not.toContain("conn_dead_pending");
    expect(html).toContain("Historical TrueLayer");
    expect(html).toContain("Synced TrueLayer");
  });

  it("shows reconnect required for old connected records without usable tokens", () => {
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[
          {
            ...baseConnection,
            id: "conn_connected_without_token",
            status: "connected",
            consentStatus: "active",
            institutionName: "Broken TrueLayer",
          },
        ]}
        tokenDiagnostics={{
          conn_connected_without_token: {
            connectionId: "conn_connected_without_token",
            tokenRecordPresent: false,
            tokenDecryptable: "not_tested",
            tokenLinkedToConnection: "no",
            syncEligible: "no",
            reasonCode: "token_record_missing",
          },
        }}
        providerState={{
          provider: "truelayer",
          configured: true,
          safeMessage: "TrueLayer configured.",
        }}
      />,
    );

    expect(html).toContain("Broken TrueLayer");
    expect(html).toContain("Reconnect required");
    expect(html).toContain("Token record present");
    expect(html).toContain("No");
    expect(html).toContain("disabled");
  });

  it("keeps provider token Firestore access scoped to the signed-in user path", () => {
    const tokenStoreSource = fs.readFileSync(
      path.resolve("src/lib/bank-providers/token-store.ts"),
      "utf8",
    );

    expect(tokenStoreSource).toContain("users/${userId}/providerTokens");
    expect(tokenStoreSource).not.toContain("providerTokens/${userId}");
  });

  it("sync route returns token_record_missing without calling TrueLayer", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_missing_token" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async () => ({
        ...baseConnection,
        id: "conn_missing_token",
        status: "connected",
        consentStatus: "active",
      }),
      recordAuditEvent: async (event: unknown) => event,
      recordProviderSyncEvent: async (event: unknown) => event,
      updateBankConnectionStatus: async (connection: unknown) => connection,
      upsertAccount: async (account: unknown) => account,
      upsertTransaction: async (transaction: unknown) => transaction,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderTokenForSync: async () => ({
        ok: false,
        reason: "token_record_missing",
        status: 409,
        message: "Reconnect required before this bank connection can sync.",
        diagnostics: {
          connectionId: "conn_missing_token",
          tokenRecordPresent: false,
          tokenDecryptable: "not_tested",
          tokenLinkedToConnection: "no",
          syncEligible: "no",
          reasonCode: "token_record_missing",
        },
      }),
    }));
    const getProviderAdapter = vi.fn();
    vi.doMock("@/lib/bank-providers/provider-service", () => ({ getProviderAdapter }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/sync/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_missing_token/sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_missing_token" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe("token_record_missing");
    expect(getProviderAdapter).not.toHaveBeenCalled();
  });

  it("sync route rejects token connection mismatches before provider calls", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_mismatch" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async () => ({
        ...baseConnection,
        id: "conn_expected",
        status: "connected",
        consentStatus: "active",
      }),
      recordAuditEvent: async (event: unknown) => event,
      recordProviderSyncEvent: async (event: unknown) => event,
      updateBankConnectionStatus: async (connection: unknown) => connection,
      upsertAccount: async (account: unknown) => account,
      upsertTransaction: async (transaction: unknown) => transaction,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderTokenForSync: async () => ({
        ok: false,
        reason: "token_connection_id_mismatch",
        status: 409,
        message: "Reconnect required because the stored token is not linked to this connection.",
        diagnostics: {
          connectionId: "conn_expected",
          tokenRecordPresent: true,
          tokenDecryptable: "yes",
          tokenLinkedToConnection: "no",
          syncEligible: "no",
          reasonCode: "token_connection_id_mismatch",
        },
      }),
    }));
    const getProviderAdapter = vi.fn();
    vi.doMock("@/lib/bank-providers/provider-service", () => ({ getProviderAdapter }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/sync/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_expected/sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_expected" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe("token_connection_id_mismatch");
    expect(getProviderAdapter).not.toHaveBeenCalled();
  });

  it("sync route calls provider workflow only after valid token preflight", async () => {
    const syncBankConnectionMock = vi.fn(async () => ({
      status: "success",
      connection: baseConnection,
      accountsUpserted: 1,
      transactionsUpserted: 1,
      syncEvents: [],
      auditEvents: [],
      safeMessage: "Connection synced successfully.",
    }));
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_valid_token" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async () => ({
        ...baseConnection,
        id: "conn_valid_token",
        status: "connected",
        consentStatus: "active",
      }),
      recordAuditEvent: async (event: unknown) => event,
      recordProviderSyncEvent: async (event: unknown) => event,
      updateBankConnectionStatus: async (connection: unknown) => connection,
      upsertAccount: async (account: unknown) => account,
      upsertTransaction: async (transaction: unknown) => transaction,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderTokenForSync: async () => ({
        ok: true,
        record: {
          connectionId: "conn_valid_token",
          provider: "truelayer",
          tokenReference: "decrypted-access-token",
          encryptedTokenPayload: "encrypted",
          providerUserId: "tl_user_001",
          providerConnectionId: "conn_valid_token",
          expiresAt: "2099-01-01T00:00:00.000Z",
          accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
          refreshTokenExpiresAt: "2099-01-01T00:00:00.000Z",
          scopes: ["accounts"],
          revokedAt: null,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z",
        },
        diagnostics: {
          connectionId: "conn_valid_token",
          tokenRecordPresent: true,
          tokenDecryptable: "yes",
          tokenLinkedToConnection: "yes",
          syncEligible: "yes",
          reasonCode: null,
        },
      }),
    }));
    const providerAdapter = { marker: "provider" };
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => providerAdapter,
    }));
    vi.doMock("@/lib/bank-providers/sync-workflow", () => ({
      syncBankConnection: syncBankConnectionMock,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/sync/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_valid_token/sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_valid_token" }) },
    );

    expect(response.status).toBe(200);
    expect(syncBankConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_valid_token",
        provider: providerAdapter,
        providerContext: expect.objectContaining({
          tokenReference: "decrypted-access-token",
          providerConnectionId: "conn_valid_token",
        }),
      }),
    );
  });
});
