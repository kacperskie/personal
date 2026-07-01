import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Account,
  BankConnection,
  ProviderAccount,
  Transaction,
  UserProfile,
} from "../src/lib/domain";
import {
  isSandboxAccount,
  isSandboxConnection,
  liveConnectionIdSet,
  partitionAccounts,
  partitionConnections,
  sandboxConnectionIdSet,
} from "../src/lib/bank-providers/sandbox-data";
import {
  applyLiveModeDashboardFilter,
  getDashboardViewModel,
  type DashboardSummaryData,
} from "../src/lib/dashboard/summary";
import { buildSystemReadinessReport } from "../src/lib/deployment/readiness";
import { suggestAccountPurpose } from "../src/lib/bank-providers/account-purpose-suggestions";
import { previewSandboxCleanup } from "../src/lib/repositories/sandbox-cleanup";
import {
  getMoneyhubSandboxReadiness,
  getTrueLayerSandboxReadiness,
} from "../src/lib/bank-providers/provider-config";
import {
  canRemoveFailedConnectionAttempt,
  ConnectedAccountsManager,
  connectionDisplayTitle,
  connectionReconnectPath,
  connectionRevokePath,
  failedAttemptRemovalPath,
  requiresReconnect,
  shortConnectionId,
} from "../src/components/connected-accounts/connected-accounts-manager";
import { ProviderSafeError } from "../src/lib/bank-providers/provider-errors";
import { syncBankConnection } from "../src/lib/bank-providers/sync-workflow";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

function connection(overrides: Partial<BankConnection>): BankConnection {
  return {
    id: "conn",
    provider: "truelayer",
    institutionName: "TrueLayer live",
    institutionId: "truelayer_live",
    status: "connected",
    consentStatus: "active",
    consentStartedAt: null,
    consentExpiresAt: null,
    lastSyncedAt: null,
    errorMessage: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function account(overrides: Partial<Account>): Account {
  return {
    id: "acc",
    provider: "truelayer",
    providerConnectionId: "conn_live",
    name: "Revolut Current",
    officialName: "Revolut Current",
    institutionName: "Revolut",
    balance: 100,
    ...overrides,
  } as unknown as Account;
}

const liveConnection = connection({ id: "conn_live", institutionId: "truelayer_live", institutionName: "TrueLayer live" });
const sandboxConnection = connection({ id: "conn_sb", institutionId: "truelayer_sandbox", institutionName: "TrueLayer sandbox" });
const mockConnection = connection({ id: "conn_mock", provider: "mock", institutionId: "mock_failed", institutionName: "Mock Sandbox Failure" });

describe("sandbox classifier", () => {
  it("classifies connections", () => {
    expect(isSandboxConnection(liveConnection)).toBe(false);
    expect(isSandboxConnection(sandboxConnection)).toBe(true);
    expect(isSandboxConnection(mockConnection)).toBe(true);
  });

  it("protects live-linked accounts even if the name contains MOCK", () => {
    const connections = [liveConnection, sandboxConnection];
    const sandboxIds = sandboxConnectionIdSet(connections);
    const liveIds = liveConnectionIdSet(connections);

    const liveLinkedButMockName = account({
      providerConnectionId: "conn_live",
      name: "MOCK leftover name",
    });
    const mockAccount = account({ provider: "mock", providerConnectionId: null, name: "MOCK - SAVINGS ACCOUNT" });
    const sandboxLinked = account({ providerConnectionId: "conn_sb", name: "Sandbox Current" });

    expect(isSandboxAccount(liveLinkedButMockName, sandboxIds, liveIds)).toBe(false);
    expect(isSandboxAccount(mockAccount, sandboxIds, liveIds)).toBe(true);
    expect(isSandboxAccount(sandboxLinked, sandboxIds, liveIds)).toBe(true);
  });

  it("partitions connections and accounts", () => {
    const connections = [liveConnection, sandboxConnection, mockConnection];
    const partedConnections = partitionConnections(connections);
    expect(partedConnections.live).toHaveLength(1);
    expect(partedConnections.sandbox).toHaveLength(2);

    const accounts = [
      account({ providerConnectionId: "conn_live" }),
      account({ provider: "mock", providerConnectionId: null, name: "MOCK - TRANSACTION ACCOUNT" }),
      account({ providerConnectionId: "conn_sb" }),
    ];
    const partedAccounts = partitionAccounts(accounts, connections);
    expect(partedAccounts.live).toHaveLength(1);
    expect(partedAccounts.sandbox).toHaveLength(2);
  });
});

function dashboardData(): DashboardSummaryData {
  const transaction = (id: string, accountId: string): Transaction =>
    ({ id, accountId, amount: -5, date: "2026-06-15" }) as unknown as Transaction;
  return {
    userId: "user_1",
    profile: { paydayDayOfMonth: 25, minimumBuffer: 350 } as unknown as UserProfile,
    accounts: [
      account({ id: "acc_live", providerConnectionId: "conn_live" }),
      account({ id: "acc_mock", provider: "mock", providerConnectionId: null, name: "MOCK - SAVINGS ACCOUNT" }),
    ],
    bills: [],
    subscriptions: [],
    debts: [],
    savingsGoals: [],
    transactions: [transaction("t_live", "acc_live"), transaction("t_mock", "acc_mock")],
    manualFinanceItems: [],
    paydayPlans: [],
    overdraftPlans: [],
    budgets: [],
    budgetPeriods: [],
    categories: [],
    bankConnections: [liveConnection, sandboxConnection],
  };
}

describe("dashboard live-mode filter", () => {
  it("excludes sandbox accounts, their transactions, and sandbox connections in live mode", () => {
    const filtered = applyLiveModeDashboardFilter(dashboardData(), {
      TRUELAYER_SANDBOX_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    expect(filtered.accounts.map((a) => a.id)).toEqual(["acc_live"]);
    expect(filtered.transactions.map((t) => t.id)).toEqual(["t_live"]);
    expect(filtered.bankConnections.map((c) => c.id)).toEqual(["conn_live"]);
  });

  it("does not filter in sandbox mode", () => {
    const filtered = applyLiveModeDashboardFilter(dashboardData(), {} as NodeJS.ProcessEnv);
    expect(filtered.accounts).toHaveLength(2);
    expect(filtered.transactions).toHaveLength(2);
  });

  it("mock backend still works", async () => {
    const model = await getDashboardViewModel({ BACKEND_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv);
    expect(model.kind).toBe("ready");
    if (model.kind === "ready") {
      expect(model.source).toBe("mock");
    }
  });
});

describe("readiness skips unused Moneyhub when TrueLayer is selected", () => {
  it("marks the Moneyhub check pass when provider is truelayer", () => {
    const report = buildSystemReadinessReport({
      BACKEND_PROVIDER: "firebase",
      OPEN_BANKING_ENABLED: "true",
      OPEN_BANKING_PROVIDER: "truelayer",
      TRUELAYER_SANDBOX_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    const moneyhub = report.checks.find((entry) => entry.id === "moneyhub");
    expect(moneyhub?.status).toBe("pass");
    expect(moneyhub?.safeDetails).toContain("skipped");
  });
});

describe("cleanup preview is value-free and safe", () => {
  it("returns numeric counts only and never throws without admin", async () => {
    const counts = await previewSandboxCleanup("user_1");
    expect(Object.values(counts).every((value) => typeof value === "number")).toBe(true);
    expect(counts).toEqual({
      connections: 0,
      accounts: 0,
      transactions: 0,
      providerTokens: 0,
      syncRuns: 0,
    });
  });

  it("returns zeros for an empty user id", async () => {
    const counts = await previewSandboxCleanup("");
    expect(counts.connections).toBe(0);
  });
});

describe("Revolut pocket purpose", () => {
  it("suggests the pocket purpose for a Revolut pocket, excluded from safe-to-spend", () => {
    const revolutPocket: ProviderAccount = {
      providerConnectionId: "conn_live",
      providerAccountId: "acc_pocket",
      institutionName: "Revolut",
      institutionId: "revolut",
      name: "Amex Pocket",
      officialName: "Amex Pocket",
      type: "savings",
      subtype: "pocket",
      balance: 200,
      availableBalance: 200,
      creditLimit: null,
      currency: "GBP",
      mask: null,
    };
    const suggestion = suggestAccountPurpose(revolutPocket);
    expect(suggestion.purpose).toBe("pocket");
    expect(suggestion.includeInSafeToSpend).toBe(false);
  });
});

describe("Connected Accounts live-mode UI hides Moneyhub/mock provider", () => {
  it("dropdown shows only TrueLayer live and hides the Moneyhub readiness section", () => {
    const liveEnv = {
      OPEN_BANKING_ENABLED: "true",
      OPEN_BANKING_PROVIDER: "truelayer",
      TRUELAYER_SANDBOX_ENABLED: "false",
      TRUELAYER_CLIENT_ID: "live-client-id",
      TRUELAYER_CLIENT_SECRET: "live-secret-value",
      TRUELAYER_REDIRECT_URI: "https://app.example.com/api/bank-connections/callback",
      TOKEN_ENCRYPTION_KEY: "x".repeat(32),
    } as unknown as NodeJS.ProcessEnv;

    const html = renderToStaticMarkup(
      createElement(ConnectedAccountsManager, {
        connections: [],
        tokenDiagnostics: {},
        providerState: {
          provider: "truelayer",
          configured: true,
          safeMessage: "",
          truelayerReadiness: getTrueLayerSandboxReadiness(liveEnv),
          moneyhubReadiness: getMoneyhubSandboxReadiness(liveEnv),
        },
      }),
    );

    expect(html).toContain("TrueLayer live");
    expect(html).not.toContain("Moneyhub sandbox readiness");
    expect(html).not.toContain(">Mock provider<");
    expect(html).not.toContain(">Moneyhub sandbox<");
    // No secret values are rendered.
    expect(html).not.toContain("live-secret-value");
  });

  it("labels live connections by provider metadata and shows safe failure details", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectedAccountsManager, {
        connections: [
          connection({
            id: "conn_amex",
            mode: "live",
            providerName: "American Express",
            displayName: "American Express",
            status: "sync_failed",
            consentStatus: "active",
            errorMessage:
              "This provider may be card-only (its accounts endpoint is unsupported). Enable card data and reconnect if this is your Amex connection.",
            lastFailedEndpoint: "accounts",
            lastFailedStatus: 501,
            lastFailureReason: "truelayer_accounts_endpoint_not_supported",
            accountsSyncedCount: 0,
          }),
        ],
        tokenDiagnostics: {
          conn_amex: {
            connectionId: "conn_amex",
            tokenRecordPresent: true,
            tokenDecryptable: "yes",
            tokenLinkedToConnection: "yes",
            syncEligible: "yes",
            reasonCode: null,
          },
        },
        providerState: {
          provider: "truelayer",
          configured: true,
          safeMessage: "",
          truelayerReadiness: getTrueLayerSandboxReadiness({
            OPEN_BANKING_ENABLED: "true",
            OPEN_BANKING_PROVIDER: "truelayer",
            TRUELAYER_SANDBOX_ENABLED: "false",
            TRUELAYER_CLIENT_ID: "live-client-id",
            TRUELAYER_CLIENT_SECRET: "live-secret-value",
            TRUELAYER_REDIRECT_URI: "https://app.example.com/api/bank-connections/callback",
            TOKEN_ENCRYPTION_KEY: "x".repeat(32),
          } as unknown as NodeJS.ProcessEnv),
          moneyhubReadiness: getMoneyhubSandboxReadiness(),
        },
      }),
    );

    expect(html).toContain("American Express");
    expect(html).toContain("Failing endpoint: accounts");
    expect(html).toContain("HTTP status: 501");
    expect(html).toContain("truelayer_accounts_endpoint_not_supported");
    expect(html).toContain("Reconnect with card access");
    expect(html).not.toContain("live-secret-value");
  });
});

describe("per-connection live connection identity and cleanup", () => {
  const providerState = {
    provider: "truelayer" as const,
    configured: true,
    safeMessage: "",
    truelayerReadiness: getTrueLayerSandboxReadiness({
      OPEN_BANKING_ENABLED: "true",
      OPEN_BANKING_PROVIDER: "truelayer",
      TRUELAYER_SANDBOX_ENABLED: "false",
      TRUELAYER_CLIENT_ID: "live-client-id",
      TRUELAYER_CLIENT_SECRET: "live-secret-value",
      TRUELAYER_REDIRECT_URI: "https://app.example.com/api/bank-connections/callback",
      TOKEN_ENCRYPTION_KEY: "x".repeat(32),
    } as unknown as NodeJS.ProcessEnv),
    moneyhubReadiness: getMoneyhubSandboxReadiness(),
  };

  it("falls back to linked account metadata for generic live connection titles", () => {
    const generic = connection({
      id: "conn_live_nationwide_12345678",
      mode: "live",
      institutionName: "TrueLayer live",
      institutionId: "truelayer_live",
      lastSyncedAt: "2026-07-01T09:00:00.000Z",
    });
    const summary = {
      connectionId: generic.id,
      linkedAccountCount: 2,
      linkedTransactionCount: 7,
      linkedAccountNames: ["Bills Current", "Grad Current"],
      linkedInstitutionNames: ["Nationwide"],
    };

    const html = renderToStaticMarkup(
      createElement(ConnectedAccountsManager, {
        connections: [generic],
        tokenDiagnostics: {},
        connectionSummaries: { [generic.id]: summary },
        providerState,
      }),
    );

    expect(connectionDisplayTitle(generic, summary)).toBe("Nationwide");
    expect(html).toContain("Nationwide");
    expect(html).toContain("Linked accounts: Bills Current, Grad Current");
    expect(html).toContain("Linked transactions");
    expect(html).toContain("7");
    expect(html).toContain(shortConnectionId(generic.id));
    expect(html).not.toContain("live-secret-value");
  });

  it("builds exact per-connection action paths", () => {
    expect(connectionRevokePath("conn_live_a")).toBe(
      "/api/bank-connections/conn_live_a/revoke",
    );
    expect(connectionReconnectPath("conn_live_a")).toBe(
      "/api/bank-connections/conn_live_a/reconnect",
    );
    expect(failedAttemptRemovalPath("conn_live_b")).toBe(
      "/api/bank-connections/conn_live_b/failed-attempt",
    );
  });

  it("shows reconnect for revoked connections and disables sync", () => {
    const revoked = connection({
      id: "conn_revolut_revoked",
      mode: "live",
      providerName: "Revolut",
      institutionName: "Revolut",
      consentStatus: "revoked",
      status: "disconnected",
    });
    const diagnostics = {
      connectionId: revoked.id,
      tokenRecordPresent: true,
      tokenDecryptable: "yes" as const,
      tokenLinkedToConnection: "yes" as const,
      syncEligible: "no" as const,
      reasonCode: "token_record_missing" as const,
    };
    const html = renderToStaticMarkup(
      createElement(ConnectedAccountsManager, {
        connections: [revoked],
        tokenDiagnostics: { [revoked.id]: diagnostics },
        connectionSummaries: {
          [revoked.id]: {
            connectionId: revoked.id,
            linkedAccountCount: 1,
            linkedTransactionCount: 3,
            linkedAccountNames: ["Revolut Spending"],
            linkedInstitutionNames: ["Revolut"],
          },
        },
        providerState,
      }),
    );

    expect(requiresReconnect(revoked, diagnostics)).toBe(true);
    expect(html).toContain("Reconnect required");
    expect(html).toContain("Reconnect");
    expect(html).toContain("Sync eligible");
    expect(html).toContain("disabled");
    expect(html).not.toContain("live-secret-value");
  });

  it("identifies removable failed live attempts without including synced connections", () => {
    const failed = connection({
      id: "conn_failed_live",
      mode: "live",
      status: "sync_failed",
      consentStatus: "active",
      lastFailureReason: "truelayer_token_rejected",
    });
    const synced = connection({
      id: "conn_synced_live",
      mode: "live",
      status: "sync_failed",
      consentStatus: "active",
      lastSyncedAt: "2026-07-01T09:00:00.000Z",
      lastFailureReason: "truelayer_token_rejected",
    });

    expect(
      canRemoveFailedConnectionAttempt(failed, {
        connectionId: failed.id,
        linkedAccountCount: 0,
        linkedTransactionCount: 0,
        linkedAccountNames: [],
        linkedInstitutionNames: [],
      }),
    ).toBe(true);
    expect(
      canRemoveFailedConnectionAttempt(synced, {
        connectionId: synced.id,
        linkedAccountCount: 0,
        linkedTransactionCount: 0,
        linkedAccountNames: [],
        linkedInstitutionNames: [],
      }),
    ).toBe(false);
  });

  it("disconnecting one live connection only updates that connection and token", async () => {
    const store = new Map<string, BankConnection>([
      [
        "conn_live_a",
        connection({
          id: "conn_live_a",
          mode: "live",
          providerName: "Nationwide",
          institutionName: "Nationwide",
          institutionId: "truelayer_live",
        }),
      ],
      [
        "conn_live_b",
        connection({
          id: "conn_live_b",
          mode: "live",
          providerName: "Revolut",
          institutionName: "Revolut",
          institutionId: "truelayer_live",
        }),
      ],
      ["conn_sandbox", connection({ id: "conn_sandbox", mode: "sandbox", institutionId: "truelayer_sandbox" })],
    ]);
    const revokedTokens: string[] = [];

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => store.get(id) ?? null,
      updateBankConnectionStatus: async (updated: BankConnection) => {
        store.set(updated.id, updated);
        return updated;
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderToken: async (_userId: string, connectionId: string) => ({
        connectionId,
        provider: "truelayer",
        tokenReference: `token-${connectionId}`,
        providerUserId: "tl_user",
        providerConnectionId: connectionId,
        scopes: ["accounts"],
      }),
      revokeProviderToken: async (_userId: string, connectionId: string) => {
        revokedTokens.push(connectionId);
        return { revoked: true, connectionId, revokedAt: "2026-07-01T10:00:00.000Z" };
      },
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        revokeConnection: async (id: string) =>
          connection({
            id,
            institutionName: "TrueLayer live",
            institutionId: "truelayer_live",
            status: "disconnected",
            consentStatus: "revoked",
          }),
      }),
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/revoke/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_live_a/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_live_a" }) },
    );

    expect(response.status).toBe(200);
    expect(store.get("conn_live_a")?.status).toBe("disconnected");
    expect(store.get("conn_live_a")?.institutionName).toBe("Nationwide");
    expect(store.get("conn_live_b")?.status).toBe("connected");
    expect(store.get("conn_sandbox")?.status).toBe("connected");
    expect(revokedTokens).toEqual(["conn_live_a"]);
  });

  it("disconnecting sandbox does not affect a live connection", async () => {
    const store = new Map<string, BankConnection>([
      ["conn_live", connection({ id: "conn_live", mode: "live", institutionId: "truelayer_live" })],
      ["conn_sandbox", connection({ id: "conn_sandbox", mode: "sandbox", institutionId: "truelayer_sandbox" })],
    ]);
    const revokedTokens: string[] = [];

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => store.get(id) ?? null,
      updateBankConnectionStatus: async (updated: BankConnection) => {
        store.set(updated.id, updated);
        return updated;
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderToken: async (_userId: string, connectionId: string) => ({
        connectionId,
        provider: "truelayer",
        tokenReference: `token-${connectionId}`,
        providerUserId: "tl_user",
        providerConnectionId: connectionId,
        scopes: ["accounts"],
      }),
      revokeProviderToken: async (_userId: string, connectionId: string) => {
        revokedTokens.push(connectionId);
        return { revoked: true, connectionId, revokedAt: "2026-07-01T10:00:00.000Z" };
      },
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({ revokeConnection: async () => undefined }),
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/revoke/route");
    await POST(
      new Request("http://localhost/api/bank-connections/conn_sandbox/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_sandbox" }) },
    );

    expect(store.get("conn_sandbox")?.status).toBe("disconnected");
    expect(store.get("conn_live")?.status).toBe("connected");
    expect(revokedTokens).toEqual(["conn_sandbox"]);
  });

  it("reconnecting Revolut starts auth for only the Revolut connection", async () => {
    const store = new Map<string, BankConnection>([
      [
        "conn_revolut",
        connection({
          id: "conn_revolut",
          mode: "live",
          institutionName: "Revolut",
          providerName: "Revolut",
          status: "disconnected",
          consentStatus: "revoked",
        }),
      ],
      [
        "conn_nationwide",
        connection({
          id: "conn_nationwide",
          mode: "live",
          institutionName: "Nationwide",
          providerName: "Nationwide",
          status: "disconnected",
          consentStatus: "revoked",
        }),
      ],
    ]);
    const updated: BankConnection[] = [];

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => store.get(id) ?? null,
      updateBankConnectionStatus: async (connection: BankConnection) => {
        updated.push(connection);
        store.set(connection.id, connection);
        return connection;
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        createConnection: async (input: {
          reconnectConnectionId?: string;
          existingConnection?: BankConnection;
        }) => ({
          connection: {
            ...input.existingConnection!,
            id: input.reconnectConnectionId!,
            status: "connecting",
            consentStatus: "pending",
            updatedAt: "2026-07-01T12:00:00.000Z",
          },
          authorizationUrl: "https://auth.truelayer.com/?state=conn_revolut_state",
          providerConfigured: true,
          state: "conn_revolut_state",
          safeMessage: null,
        }),
      }),
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/reconnect/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_revolut/reconnect", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_revolut" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.connectionId).toBe("conn_revolut");
    expect(payload.authorizationUrl).toContain("state=conn_revolut_state");
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("conn_revolut");
    expect(store.get("conn_revolut")?.status).toBe("connecting");
    expect(store.get("conn_nationwide")?.status).toBe("disconnected");
  });

  it("reconnecting Nationwide does not affect Revolut", async () => {
    const store = new Map<string, BankConnection>([
      ["conn_revolut", connection({ id: "conn_revolut", mode: "live", institutionName: "Revolut" })],
      [
        "conn_nationwide",
        connection({
          id: "conn_nationwide",
          mode: "live",
          institutionName: "Nationwide",
          status: "disconnected",
          consentStatus: "revoked",
        }),
      ],
    ]);

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => store.get(id) ?? null,
      updateBankConnectionStatus: async (updated: BankConnection) => {
        store.set(updated.id, updated);
        return updated;
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        createConnection: async (input: {
          reconnectConnectionId?: string;
          existingConnection?: BankConnection;
        }) => ({
          connection: {
            ...input.existingConnection!,
            id: input.reconnectConnectionId!,
            status: "connecting",
            consentStatus: "pending",
            updatedAt: "2026-07-01T12:00:00.000Z",
          },
          authorizationUrl: "https://auth.truelayer.com/?state=conn_nationwide_state",
          providerConfigured: true,
          state: "conn_nationwide_state",
          safeMessage: null,
        }),
      }),
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/reconnect/route");
    await POST(
      new Request("http://localhost/api/bank-connections/conn_nationwide/reconnect", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: "conn_nationwide" }) },
    );

    expect(store.get("conn_nationwide")?.status).toBe("connecting");
    expect(store.get("conn_revolut")?.status).toBe("connected");
  });

  it("callback with reconnectConnectionId updates existing connection only", async () => {
    const existing = connection({
      id: "conn_revolut",
      mode: "live",
      institutionName: "Revolut",
      providerName: "Revolut",
      status: "disconnected",
      consentStatus: "revoked",
      lastSyncedAt: "2026-07-01T09:00:00.000Z",
      createdAt: "2026-06-30T09:00:00.000Z",
      errorMessage: "Reconnect required before this bank connection can sync.",
      lastFailureReason: "truelayer_token_rejected",
      accountsSyncedCount: 1,
    });
    const updated: BankConnection[] = [];
    const upserted: BankConnection[] = [];

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/bank-providers/provider-config", () => ({
      getOpenBankingProvider: () => "truelayer",
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        handleCallback: async () => ({
          reconnectConnectionId: "conn_revolut",
          connection: {
            ...existing,
            institutionName: "TrueLayer live",
            providerName: null,
            status: "connected",
            consentStatus: "active",
            consentCompletedAt: "2026-07-01T12:00:00.000Z",
            consentExpiresAt: "2026-09-29T12:00:00.000Z",
            lastSyncedAt: null,
            createdAt: "2026-07-01T12:00:00.000Z",
            updatedAt: "2026-07-01T12:00:00.000Z",
            errorMessage: null,
          },
          safeMessage: "TrueLayer callback handled.",
        }),
      }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => (id === existing.id ? existing : null),
      updateBankConnectionStatus: async (connection: BankConnection) => {
        updated.push(connection);
        return connection;
      },
      upsertBankConnection: async (connection: BankConnection) => {
        upserted.push(connection);
        return connection;
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));

    const { GET } = await import("../src/app/api/bank-connections/callback/route");
    const response = await GET(
      new Request("http://localhost/api/bank-connections/callback?code=auth-code&state=state"),
    );

    expect(response.status).toBe(307);
    expect(upserted).toEqual([]);
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("conn_revolut");
    expect(updated[0].institutionName).toBe("Revolut");
    expect(updated[0].providerName).toBe("Revolut");
    expect(updated[0].createdAt).toBe("2026-06-30T09:00:00.000Z");
    expect(updated[0].lastSyncedAt).toBe("2026-07-01T09:00:00.000Z");
    expect(updated[0].accountsSyncedCount).toBe(1);
    expect(updated[0].status).toBe("connected");
    expect(updated[0].consentStatus).toBe("active");
    expect(updated[0].lastFailureReason).toBeNull();
  });

  it("removes a failed live attempt by exact connection id only", async () => {
    const deletedConnections: string[] = [];
    const deletedTokens: string[] = [];
    const failed = connection({
      id: "conn_failed_live",
      mode: "live",
      status: "sync_failed",
      consentStatus: "active",
      lastFailureReason: "truelayer_token_rejected",
    });

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async (id: string) => (id === failed.id ? failed : null),
      getAccounts: async () => [],
      getTransactions: async () => [],
      deleteBankConnection: async (id: string) => {
        deletedConnections.push(id);
        return { id };
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderTokenDiagnostics: async () => ({
        connectionId: failed.id,
        tokenRecordPresent: true,
        tokenDecryptable: "yes",
        tokenLinkedToConnection: "yes",
        syncEligible: "no",
        reasonCode: "token_record_missing",
      }),
      deleteProviderTokenForConnection: async (_userId: string, connectionId: string) => {
        deletedTokens.push(connectionId);
        return { id: connectionId };
      },
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/failed-attempt/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_failed_live/failed-attempt", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: failed.id }) },
    );

    expect(response.status).toBe(200);
    expect(deletedConnections).toEqual([failed.id]);
    expect(deletedTokens).toEqual([failed.id]);
  });

  it("does not remove a successfully synced live connection as a failed attempt", async () => {
    const deletedConnections: string[] = [];
    const synced = connection({
      id: "conn_synced_live",
      mode: "live",
      status: "sync_failed",
      consentStatus: "active",
      lastSyncedAt: "2026-07-01T09:00:00.000Z",
      lastFailureReason: "truelayer_token_rejected",
    });

    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_live" } }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnectionById: async () => synced,
      getAccounts: async () => [],
      getTransactions: async () => [],
      deleteBankConnection: async (id: string) => {
        deletedConnections.push(id);
        return { id };
      },
      recordAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/token-store", () => ({
      getProviderTokenDiagnostics: async () => ({
        connectionId: synced.id,
        tokenRecordPresent: true,
        tokenDecryptable: "yes",
        tokenLinkedToConnection: "yes",
        syncEligible: "no",
        reasonCode: "token_record_missing",
      }),
      deleteProviderTokenForConnection: async () => ({ id: synced.id }),
    }));

    const { POST } = await import("../src/app/api/bank-connections/[connectionId]/failed-attempt/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/conn_synced_live/failed-attempt", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectionId: synced.id }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.reason).toBe("not_removable_failed_attempt");
    expect(deletedConnections).toEqual([]);
  });

  it("sync failure on one connection updates only that connection", async () => {
    const updates: BankConnection[] = [];
    const failing = connection({ id: "conn_live_a", mode: "live" });
    const result = await syncBankConnection({
      userId: "user_live",
      connection: failing,
      provider: {
        createConnection: vi.fn(),
        handleCallback: vi.fn(),
        getConnectionStatus: vi.fn(async () => failing),
        getAccounts: vi.fn(async () => {
          throw new ProviderSafeError(
            "provider_sync_failed",
            "TrueLayer rejected the access token. Reconnect the live account.",
            401,
            "truelayer_token_rejected",
          );
        }),
        getTransactions: vi.fn(),
        refreshConnection: vi.fn(),
        revokeConnection: vi.fn(),
      },
      providerContext: { tokenReference: "token" },
      dependencies: {
        upsertAccount: vi.fn(),
        upsertTransaction: vi.fn(),
        recordProviderSyncEvent: vi.fn(async (event) => event),
        updateBankConnectionStatus: vi.fn(async (updated) => {
          updates.push(updated);
          return updated;
        }),
      },
    });

    expect(result.status).toBe("failed");
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("conn_live_a");
    expect(updates[0].status).toBe("sync_failed");
  });
});
