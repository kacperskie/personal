import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
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
import { ConnectedAccountsManager } from "../src/components/connected-accounts/connected-accounts-manager";

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
});
