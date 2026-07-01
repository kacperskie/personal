import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TrueLayerProvider,
  classifyTrueLayerFailure,
  type TrueLayerEndpoint,
} from "../src/lib/bank-providers/truelayer-provider";
import {
  getTrueLayerProviderConfig,
  type TrueLayerProviderConfig,
} from "../src/lib/bank-providers/provider-config";
import { ProviderSafeError } from "../src/lib/bank-providers/provider-errors";
import { getProviderAdapter } from "../src/lib/bank-providers/provider-service";
import { mockOpenBankingProvider } from "../src/lib/bank-providers/mock-open-banking-provider";
import { ConnectedAccountsManager } from "../src/components/connected-accounts/connected-accounts-manager";
import type { BankConnection } from "../src/lib/domain";

const SENTINEL_TOKEN = "SUPER-SECRET-ACCESS-TOKEN-should-never-be-logged";

// Default (core) config: cards are NOT in scope and NOT enabled.
const config: TrueLayerProviderConfig = {
  provider: "truelayer",
  openBankingEnabled: true,
  clientId: "truelayer-client",
  clientSecret: "truelayer-secret",
  redirectUri: "http://localhost:3000/api/bank-connections/callback",
  webhookSecret: "truelayer-webhook-secret",
  apiBaseUrl: "https://api.truelayer-sandbox.com",
  authBaseUrl: "https://auth.truelayer-sandbox.com",
  scopes: ["info", "accounts", "balance", "transactions", "offline_access"],
  configured: true,
  sandboxMode: true,
  mode: "sandbox",
  cardsEnabled: false,
};

// Explicitly cards-enabled config for the optional-capability tests.
const cardsEnabledConfig: TrueLayerProviderConfig = {
  ...config,
  scopes: [...config.scopes, "cards"],
  cardsEnabled: true,
};

const context = { tokenReference: SENTINEL_TOKEN, providerAccountIds: [] as string[] };

type FetchHandler = (url: string) => { status?: number; body?: unknown };

const calledUrls: string[] = [];
const consoleLines: string[] = [];

function installFetch(handler: FetchHandler) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calledUrls.push(url);
    const { status = 200, body = { results: [] } } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const account = {
  account_id: "acc_1",
  account_type: "TRANSACTION",
  display_name: "Nationwide FlexDirect",
  currency: "GBP",
  account_number: { number: "12345678", sort_code: "010203" },
  provider: { display_name: "Nationwide", provider_id: "nationwide" },
};

function okHandler(url: string) {
  if (url.includes("/data/v1/me")) return { body: { results: [{ full_name: "Sandbox User" }] } };
  if (url.includes("/balance")) return { body: { results: [{ current: 100, available: 90, currency: "GBP" }] } };
  if (url.includes("/transactions")) {
    return { body: { results: [{ transaction_id: "t1", account_id: "acc_1", amount: -5, currency: "GBP", description: "Coffee" }] } };
  }
  if (url.includes("/data/v1/cards")) return { body: { results: [{ card_id: "card_1", currency: "GBP" }] } };
  if (url.includes("/data/v1/accounts")) return { body: { results: [account] } };
  return { body: { results: [] } };
}

beforeEach(() => {
  calledUrls.length = 0;
  consoleLines.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((line: unknown) => {
      consoleLines.push(String(line));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TrueLayer default scopes exclude cards", () => {
  it("getTrueLayerProviderConfig default scopes do not include cards and cards are disabled", () => {
    const resolved = getTrueLayerProviderConfig({} as NodeJS.ProcessEnv);
    expect(resolved.scopes).not.toContain("cards");
    expect(resolved.scopes).toEqual(["info", "accounts", "balance", "transactions", "offline_access"]);
    expect(resolved.cardsEnabled).toBe(false);
  });

  it("enables cards only when TRUELAYER_CARDS_ENABLED=true", () => {
    const resolved = getTrueLayerProviderConfig({
      TRUELAYER_CARDS_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(resolved.cardsEnabled).toBe(true);
  });
});

describe("TrueLayer Data API path building", () => {
  it("builds /data/v1/me and /data/v1/accounts, then per-account /balance", async () => {
    installFetch(okHandler);
    const provider = new TrueLayerProvider(config);
    await provider.getAccounts("conn_tl", context);

    expect(calledUrls.some((u) => u.endsWith("/data/v1/me"))).toBe(true);
    expect(calledUrls.some((u) => u.endsWith("/data/v1/accounts"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/data/v1/accounts/acc_1/balance"))).toBe(true);
  });

  it("builds /data/v1/accounts/{id}/transactions", async () => {
    installFetch(okHandler);
    const provider = new TrueLayerProvider(config);
    await provider.getTransactions("conn_tl", {
      providerAccountId: "acc_1",
      tokenReference: SENTINEL_TOKEN,
      dateFrom: "2026-06-01",
      dateTo: "2026-07-01",
    });

    expect(calledUrls.some((u) => u.includes("/data/v1/accounts/acc_1/transactions"))).toBe(true);
  });

  it("calls /me before /accounts", async () => {
    installFetch(okHandler);
    const provider = new TrueLayerProvider(config);
    await provider.getAccounts("conn_tl", context);

    const meIndex = calledUrls.findIndex((u) => u.endsWith("/data/v1/me"));
    const accountsIndex = calledUrls.findIndex((u) => u.endsWith("/data/v1/accounts"));
    expect(meIndex).toBeGreaterThanOrEqual(0);
    expect(accountsIndex).toBeGreaterThan(meIndex);
  });
});

describe("cards are off by default and optional", () => {
  it("default sync never requests /data/v1/cards and still succeeds with accounts only", async () => {
    installFetch(okHandler);
    const provider = new TrueLayerProvider(config);
    const accounts = await provider.getAccounts("conn_tl", context);

    expect(calledUrls.some((u) => u.includes("/data/v1/cards"))).toBe(false);
    expect(accounts.length).toBe(1); // the single account only, no card
  });

  it("requests /data/v1/cards only when TRUELAYER_CARDS_ENABLED and cards scope are present", async () => {
    installFetch(okHandler);
    const provider = new TrueLayerProvider(cardsEnabledConfig);
    await provider.getAccounts("conn_tl", context);

    expect(calledUrls.some((u) => u.includes("/data/v1/cards"))).toBe(true);
  });

  it("a cards 403 is non-blocking: core sync still succeeds when cards are enabled", async () => {
    installFetch((url) =>
      url.includes("/data/v1/cards")
        ? { status: 403, body: { error: "access_denied" } }
        : okHandler(url),
    );
    const provider = new TrueLayerProvider(cardsEnabledConfig);

    const accounts = await provider.getAccounts("conn_tl", context);
    expect(accounts.length).toBe(1); // account still synced despite the cards 403

    const skipped = consoleLines.some(
      (line) => line.includes("cards sync skipped") && line.includes("truelayer_cards_access_denied"),
    );
    expect(skipped).toBe(true);
  });

  it("classifies a cards 403 as truelayer_cards_access_denied", () => {
    expect(classifyTrueLayerFailure("cards" as TrueLayerEndpoint, 403).reason).toBe(
      "truelayer_cards_access_denied",
    );
  });
});

describe("TrueLayer 403 classification (core endpoints)", () => {
  it("classifies a 403 from /me as truelayer_connection_access_denied", async () => {
    installFetch((url) =>
      url.includes("/data/v1/me")
        ? { status: 403, body: { error: "access_denied", title: "Access Denied" } }
        : okHandler(url),
    );
    const provider = new TrueLayerProvider(config);

    const error = await provider.getAccounts("conn_tl", context).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderSafeError);
    expect((error as ProviderSafeError).safeReason).toBe("truelayer_connection_access_denied");
  });

  it("classifies a 403 from /accounts as truelayer_scope_or_permission_denied", async () => {
    installFetch((url) =>
      url.endsWith("/data/v1/accounts")
        ? { status: 403, body: { error: "access_denied", title: "Access Denied" } }
        : okHandler(url),
    );
    const provider = new TrueLayerProvider(config);

    const error = await provider.getAccounts("conn_tl", context).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderSafeError);
    expect((error as ProviderSafeError).safeReason).toBe("truelayer_scope_or_permission_denied");
    expect((error as ProviderSafeError).userMessage).toBe(
      "TrueLayer denied account access. Check app Data API permissions and scopes.",
    );
  });

  it("maps endpoint/status to reasons deterministically", () => {
    expect(classifyTrueLayerFailure("me", 403).reason).toBe("truelayer_connection_access_denied");
    expect(classifyTrueLayerFailure("accounts", 403).reason).toBe("truelayer_scope_or_permission_denied");
    expect(classifyTrueLayerFailure("balance" as TrueLayerEndpoint, 403).reason).toBe(
      "truelayer_scope_or_permission_denied",
    );
    expect(classifyTrueLayerFailure("accounts", 401).reason).toBe("truelayer_token_rejected");
  });
});

describe("TrueLayer safe logging", () => {
  function tlFailureLogs() {
    return consoleLines
      .map((line) => {
        try {
          return JSON.parse(line) as { message?: string; metadata?: Record<string, unknown> };
        } catch {
          return null;
        }
      })
      .filter((entry) => entry?.message === "TrueLayer fetch failed.");
  }

  it("includes safe endpoint label, status, and path template", async () => {
    installFetch((url) =>
      url.endsWith("/data/v1/accounts")
        ? { status: 403, body: { error: "access_denied", title: "Access Denied" } }
        : okHandler(url),
    );
    const provider = new TrueLayerProvider(config);
    await provider.getAccounts("conn_tl", context).catch(() => undefined);

    const logs = tlFailureLogs();
    expect(logs.length).toBeGreaterThan(0);
    const metadata = logs[0]?.metadata ?? {};
    expect(metadata.endpoint).toBe("accounts");
    expect(metadata.status).toBe(403);
    expect(metadata.pathTemplate).toBe("/data/v1/accounts");
    expect(metadata.tlErrorCode).toBe("access_denied");
    expect(JSON.stringify(metadata)).not.toContain("[redacted-id]");
  });

  it("never logs the access token, secrets, account numbers, or raw transactions", async () => {
    installFetch((url) => {
      if (url.endsWith("/data/v1/accounts")) {
        return { status: 403, body: { error: "access_denied", account_number: "12345678" } };
      }
      return okHandler(url);
    });
    const provider = new TrueLayerProvider(config);
    await provider.getAccounts("conn_tl", context).catch(() => undefined);

    const joined = consoleLines.join("\n");
    expect(joined).not.toContain(SENTINEL_TOKEN);
    expect(joined).not.toContain("truelayer-secret");
    expect(joined).not.toContain("12345678");
  });
});

describe("connected-accounts UI", () => {
  const connectedConnection: BankConnection = {
    id: "conn_tl_ui",
    provider: "truelayer",
    institutionName: "TrueLayer sandbox",
    institutionId: "truelayer_sandbox",
    status: "connected",
    consentStatus: "active",
    consentStartedAt: "2026-06-30T09:00:00.000Z",
    consentExpiresAt: "2026-09-30T09:00:00.000Z",
    lastSyncedAt: "2026-06-30T10:00:00.000Z",
    errorMessage: null,
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T10:00:00.000Z",
  };

  it("does not show 'account access denied' for a healthy connection (cards-only failures are non-blocking)", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectedAccountsManager, {
        connections: [connectedConnection],
        tokenDiagnostics: {
          conn_tl_ui: {
            connectionId: "conn_tl_ui",
            tokenRecordPresent: true,
            tokenDecryptable: "yes",
            tokenLinkedToConnection: "yes",
            syncEligible: "yes",
            reasonCode: null,
          },
        },
        providerState: { provider: "truelayer", configured: true, safeMessage: "" },
      }),
    );

    expect(html).not.toContain("Provider access denied");
    expect(html).not.toContain("denied account access");
  });
});

describe("mock mode still works", () => {
  it("mock provider returns accounts without any network call", async () => {
    installFetch(() => ({ status: 500 }));
    expect(getProviderAdapter("mock")).toBe(mockOpenBankingProvider);
    const accounts = await mockOpenBankingProvider.getAccounts("conn_nationwide");
    expect(accounts.length).toBeGreaterThan(0);
    expect(calledUrls).toHaveLength(0);
  });
});
