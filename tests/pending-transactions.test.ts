import { afterEach, describe, expect, it, vi } from "vitest";
import { TrueLayerProvider, type TrueLayerClientLike } from "../src/lib/bank-providers/truelayer-provider";
import type { TrueLayerProviderConfig } from "../src/lib/bank-providers/provider-config";
import { ProviderSafeError } from "../src/lib/bank-providers/provider-errors";
import type { Transaction } from "../src/lib/domain";
import {
  defaultPendingPreferences,
  matchPendingToPosted,
  partitionPendingSettlement,
  pendingPreviewSpend,
} from "../src/lib/transactions/pending";

const cardsEnabledConfig: TrueLayerProviderConfig = {
  provider: "truelayer",
  openBankingEnabled: true,
  clientId: "live-client",
  clientSecret: "live-secret",
  redirectUri: "https://app.example.com/api/bank-connections/callback",
  webhookSecret: "wh",
  apiBaseUrl: "https://api.truelayer.com",
  authBaseUrl: "https://auth.truelayer.com",
  scopes: ["info", "accounts", "balance", "cards", "transactions", "offline_access"],
  configured: true,
  sandboxMode: false,
  mode: "live",
  cardsEnabled: true,
};

const cardsDisabledConfig: TrueLayerProviderConfig = {
  ...cardsEnabledConfig,
  scopes: ["info", "accounts", "balance", "transactions", "offline_access"],
  cardsEnabled: false,
};

const context = { tokenReference: "tok", providerAccountId: "card_1" };

function fakeClient(overrides: Partial<TrueLayerClientLike> = {}): TrueLayerClientLike {
  return {
    exchangeCodeForTokens: vi.fn(async () => ({ access_token: "a" })),
    refreshConnection: vi.fn(async () => undefined),
    getAccounts: vi.fn(async () => []),
    getTransactions: vi.fn(async () => [
      { transaction_id: "posted1", amount: -21.8, currency: "GBP", description: "AMAZON", timestamp: "2026-07-01" },
    ]),
    getCardPendingTransactions: vi.fn(async () => [
      { transaction_id: "pend1", amount: -9.99, currency: "GBP", description: "SPOTIFY", timestamp: "2026-07-02" },
    ]),
    revokeConnection: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TrueLayer card pending sync", () => {
  it("calls the pending endpoint for a card account and marks results pending", async () => {
    const client = fakeClient();
    const provider = new TrueLayerProvider(cardsEnabledConfig, async () => client);
    const txns = await provider.getTransactions("conn", { ...context, providerAccountType: "credit_card" });

    expect(client.getCardPendingTransactions).toHaveBeenCalledTimes(1);
    // No date range is passed to the pending endpoint.
    const pendingArg = (client.getCardPendingTransactions as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(pendingArg.dateFrom).toBeUndefined();
    expect(pendingArg.dateTo).toBeUndefined();

    const pending = txns.filter((t) => t.pending);
    expect(pending).toHaveLength(1);
    expect(pending[0].providerStatus).toBe("pending");
  });

  it("does not call the pending endpoint for a normal bank account", async () => {
    const client = fakeClient();
    const provider = new TrueLayerProvider(cardsEnabledConfig, async () => client);
    await provider.getTransactions("conn", { ...context, providerAccountType: "current_account" });
    expect(client.getCardPendingTransactions).not.toHaveBeenCalled();
  });

  it("does not call the pending endpoint when cards are disabled", async () => {
    const client = fakeClient();
    const provider = new TrueLayerProvider(cardsDisabledConfig, async () => client);
    await provider.getTransactions("conn", { ...context, providerAccountType: "credit_card" });
    expect(client.getCardPendingTransactions).not.toHaveBeenCalled();
  });

  it("is non-fatal when the pending endpoint is unsupported/denied", async () => {
    const client = fakeClient({
      getCardPendingTransactions: vi.fn(async () => {
        throw new ProviderSafeError("provider_sync_failed", "denied", 403, "truelayer_cards_access_denied");
      }),
    });
    const provider = new TrueLayerProvider(cardsEnabledConfig, async () => client);
    const txns = await provider.getTransactions("conn", { ...context, providerAccountType: "credit_card" });
    // Posted transactions still returned; pending failure did not throw.
    expect(txns.filter((t) => !t.pending)).toHaveLength(1);
    expect(txns.filter((t) => t.pending)).toHaveLength(0);
  });
});

describe("pending settlement + preview (pure)", () => {
  function tx(o: Partial<Transaction>): Transaction {
    return {
      id: "t", accountId: "amex", categoryId: "cat_personal", date: "2026-07-01",
      merchant: "AMAZON", description: "AMAZON", amount: -20, currency: "GBP", kind: "expense",
      status: "needs_review", flags: [], pending: false, notes: null,
      createdAt: "x", updatedAt: "x", ...o,
    } as Transaction;
  }

  it("matches a posted transaction to its pending by amount/merchant/date/account", () => {
    const pending = [tx({ id: "p", pending: true, providerStatus: "pending", amount: -20, date: "2026-07-01" })];
    const posted = [tx({ id: "q", amount: -20, date: "2026-07-03" })];
    const matches = matchPendingToPosted(pending, posted);
    expect(matches.get("p")).toBe("q");
  });

  it("does not double count settled pending — only posted + unsettled pending remain", () => {
    const transactions = [
      tx({ id: "posted", amount: -20, date: "2026-07-03" }),
      tx({ id: "settledPending", pending: true, providerStatus: "pending", amount: -20, date: "2026-07-01" }),
      tx({ id: "livePending", pending: true, providerStatus: "pending", amount: -9.99, merchant: "SPOTIFY", description: "SPOTIFY", date: "2026-07-04" }),
    ];
    const { posted, pendingUnsettled, pendingSettled } = partitionPendingSettlement(transactions);
    expect(posted.map((t) => t.id)).toEqual(["posted"]);
    expect(pendingSettled.map((t) => t.id)).toEqual(["settledPending"]);
    expect(pendingUnsettled.map((t) => t.id)).toEqual(["livePending"]);
  });

  it("pending preview spend counts only unsettled pending", () => {
    const transactions = [
      tx({ id: "posted", amount: -20, date: "2026-07-03" }),
      tx({ id: "settledPending", pending: true, providerStatus: "pending", amount: -20, date: "2026-07-01" }),
      tx({ id: "livePending", pending: true, providerStatus: "pending", amount: -9.99, merchant: "SPOTIFY", description: "SPOTIFY", date: "2026-07-04" }),
    ];
    // 9.99 (unsettled) only — the settled £20 is excluded to avoid double counting the posted £20.
    expect(pendingPreviewSpend(transactions)).toBeCloseTo(9.99, 2);
  });

  it("defaults: preview on, budget actuals off", () => {
    expect(defaultPendingPreferences.includePendingInSafeToSpendPreview).toBe(true);
    expect(defaultPendingPreferences.includePendingInBudgetActuals).toBe(false);
  });
});
