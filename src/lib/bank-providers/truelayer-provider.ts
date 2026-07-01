import type {
  BankConnection,
  ProviderAccount,
  ProviderSyncEvent,
  ProviderTransaction,
} from "@/lib/domain";
import {
  consumeConnectionAttempt,
  createConnectionAttempt,
  getConnectionAttempt,
} from "@/lib/bank-providers/connection-attempt-store";
import {
  getTrueLayerProviderConfig,
  type TrueLayerProviderConfig,
} from "@/lib/bank-providers/provider-config";
import { ProviderSafeError, toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  mapProviderAccountPayload,
  mapProviderTransactionPayload,
  type ProviderAccountPayload,
  type ProviderTransactionPayload,
} from "@/lib/bank-providers/provider-mappers";
import { captureProviderPayloadInspection } from "@/lib/bank-providers/provider-payload-inspection";
import type {
  CreateConnectionInput,
  OpenBankingProviderAdapter,
  ProviderCallbackInput,
  ProviderCallbackResult,
  ProviderConnectionStart,
  ProviderRequestContext,
  TransactionQuery,
} from "@/lib/bank-providers/types";
import { saveProviderToken } from "@/lib/bank-providers/token-store";
import { logServerEvent } from "@/lib/observability/server-logger";

export type TrueLayerBalancePayload = {
  account_id?: string;
  currency?: string;
  current?: number;
  available?: number;
  credit_limit?: number;
};

export type TrueLayerClientLike = {
  exchangeCodeForTokens(input: {
    code: string;
    redirectUri: string;
  }): Promise<unknown>;
  refreshConnection(input: ProviderRequestContext): Promise<void>;
  getAccounts(input: ProviderRequestContext): Promise<unknown[]>;
  getCards?(input: ProviderRequestContext): Promise<unknown[]>;
  getBalances?(input: ProviderRequestContext): Promise<TrueLayerBalancePayload[]>;
  getTransactions(input: TransactionQuery): Promise<unknown[]>;
  revokeConnection(input: ProviderRequestContext): Promise<void>;
};

export type TrueLayerClientFactory = (
  config: TrueLayerProviderConfig,
) => Promise<TrueLayerClientLike>;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function safeConnectionId() {
  return `conn_truelayer_${crypto.randomUUID()}`;
}

function redirectHostname(redirectUri: string | null | undefined) {
  if (!redirectUri) {
    return null;
  }

  try {
    return new URL(redirectUri).hostname;
  } catch {
    return "invalid";
  }
}

function safeMessageForConfig(config: TrueLayerProviderConfig) {
  return config.configured
    ? null
    : "TrueLayer sandbox credentials are not configured.";
}

function tokenExpiry(tokens: unknown) {
  if (!tokens || typeof tokens !== "object") {
    return null;
  }

  const tokenLike = tokens as {
    expires_at?: number;
    expires_in?: number;
  };

  if (typeof tokenLike.expires_at === "number") {
    return new Date(tokenLike.expires_at * 1000).toISOString();
  }

  if (typeof tokenLike.expires_in === "number") {
    return new Date(Date.now() + tokenLike.expires_in * 1000).toISOString();
  }

  return null;
}

function tokenProviderUserId(tokens: unknown, fallback: string) {
  if (!tokens || typeof tokens !== "object") {
    return fallback;
  }

  const tokenLike = tokens as {
    sub?: unknown;
    user_id?: unknown;
    provider_user_id?: unknown;
  };

  return String(tokenLike.sub ?? tokenLike.user_id ?? tokenLike.provider_user_id ?? fallback);
}

function requireProviderContext(context?: ProviderRequestContext | TransactionQuery) {
  if (!context?.tokenReference) {
    throw new ProviderSafeError(
      "provider_sync_failed",
      "TrueLayer token metadata is missing. Reconnect the sandbox account before syncing.",
      400,
    );
  }

  return context;
}

export function buildTrueLayerAuthorizationUrl({
  config,
  redirectUri,
  state,
}: {
  config: TrueLayerProviderConfig;
  redirectUri: string;
  state: string;
}) {
  const authorizationUrl = new URL(config.authBaseUrl);
  const providers = config.sandboxMode ? ["uk-cs-mock"] : [];

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", config.clientId ?? "");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);

  if (providers.length > 0) {
    authorizationUrl.searchParams.set("providers", providers.join(" "));
  }

  return {
    authorizationUrl,
    diagnostics: {
      host: authorizationUrl.hostname,
      redirectUriPresent: Boolean(redirectUri),
      redirectUriHostname: redirectHostname(redirectUri),
      hasClientId: Boolean(config.clientId),
      scopesList: config.scopes,
      providersList: providers,
      hasState: Boolean(state),
    },
  };
}

async function fetchJson(
  request: Request,
  failureReason:
    | "truelayer_accounts_fetch_failed"
    | "truelayer_balances_fetch_failed"
    | "truelayer_transactions_fetch_failed",
) {
  const response = await fetch(request);

  if (!response.ok) {
    logServerEvent({
      level: "warn",
      event: "provider_sync_event",
      message: "TrueLayer fetch failed.",
      metadata: {
        reason: failureReason,
        status: response.status,
        host: new URL(request.url).hostname,
      },
    });
    throw new ProviderSafeError(
      "provider_sync_failed",
      "TrueLayer sandbox request failed. No provider credentials were exposed.",
      502,
    );
  }

  const json = (await response.json()) as { results?: unknown[] };
  return Array.isArray(json.results) ? json.results : [];
}

async function defaultTrueLayerClientFactory(
  config: TrueLayerProviderConfig,
): Promise<TrueLayerClientLike> {
  return {
    async exchangeCodeForTokens(input) {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId ?? "",
        client_secret: config.clientSecret ?? "",
        redirect_uri: input.redirectUri,
        code: input.code,
      });
      const response = await fetch(`${config.authBaseUrl}/connect/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });

      if (!response.ok) {
        throw new ProviderSafeError(
          "provider_callback_failed",
          "TrueLayer callback token exchange failed.",
          400,
        );
      }

      return response.json();
    },
    async refreshConnection() {
      return undefined;
    },
    async getAccounts(input) {
      const context = requireProviderContext(input);
      return fetchJson(
        new Request(`${config.apiBaseUrl}/data/v1/accounts`, {
          headers: { authorization: `Bearer ${context.tokenReference}` },
        }),
        "truelayer_accounts_fetch_failed",
      );
    },
    async getCards(input) {
      const context = requireProviderContext(input);
      return fetchJson(
        new Request(`${config.apiBaseUrl}/data/v1/cards`, {
          headers: { authorization: `Bearer ${context.tokenReference}` },
        }),
        "truelayer_accounts_fetch_failed",
      );
    },
    async getBalances(input) {
      const context = requireProviderContext(input) as ProviderRequestContext;
      const accountIds = context.providerAccountIds ?? [];
      const balances = await Promise.all(
        accountIds.map(async (accountId: string) => {
          const rows = await fetchJson(
            new Request(`${config.apiBaseUrl}/data/v1/accounts/${accountId}/balance`, {
              headers: { authorization: `Bearer ${context.tokenReference}` },
            }),
            "truelayer_balances_fetch_failed",
          );

          return rows.map((row) => ({
            ...(row as TrueLayerBalancePayload),
            account_id: accountId,
          }));
        }),
      );

      return balances.flat();
    },
    async getTransactions(input) {
      const context = requireProviderContext(input);
      const accountId = input.providerAccountId;

      if (!accountId) {
        return [];
      }

      const url = new URL(`${config.apiBaseUrl}/data/v1/accounts/${accountId}/transactions`);

      if (input.dateFrom) {
        url.searchParams.set("from", input.dateFrom);
      }

      if (input.dateTo) {
        url.searchParams.set("to", input.dateTo);
      }

      return fetchJson(
        new Request(url, {
          headers: { authorization: `Bearer ${context.tokenReference}` },
        }),
        "truelayer_transactions_fetch_failed",
      );
    },
    async revokeConnection() {
      return undefined;
    },
  };
}

function balanceForAccount(
  accountId: string | undefined,
  balances: TrueLayerBalancePayload[],
): TrueLayerBalancePayload | null {
  return balances.find((balance) => balance.account_id === accountId) ?? null;
}

export function truelayerAccountPayload(
  account: unknown,
  balances: TrueLayerBalancePayload[] = [],
): ProviderAccountPayload {
  const payload = account as {
    account_id?: string;
    card_id?: string;
    account_type?: string;
    account_number?: { number?: string };
    card_network?: string;
    display_name?: string;
    provider?: { display_name?: string; provider_id?: string };
    currency?: string;
  };
  const providerAccountId = payload.account_id ?? payload.card_id;
  const balance = balanceForAccount(providerAccountId, balances);
  const isCard = Boolean(payload.card_id) || payload.account_type === "CREDIT_CARD";

  return {
    id: providerAccountId,
    providerAccountId,
    institution: {
      id: payload.provider?.provider_id,
      name: payload.provider?.display_name,
    },
    displayName: payload.display_name,
    officialName: payload.display_name,
    type: isCard ? "credit_card" : payload.account_type,
    accountType: isCard ? "credit_card" : payload.account_type,
    balance: balance?.current ?? 0,
    availableBalance: balance?.available,
    creditLimit: balance?.credit_limit ?? null,
    currency: payload.currency ?? balance?.currency,
    mask: payload.account_number?.number?.slice(-4) ?? null,
  };
}

export function truelayerTransactionPayload(transaction: unknown): ProviderTransactionPayload {
  const payload = transaction as {
    transaction_id?: string;
    normalised_provider_transaction_id?: string;
    account_id?: string;
    timestamp?: string;
    booking_datetime?: string;
    description?: string;
    merchant_name?: string;
    amount?: number;
    currency?: string;
    transaction_category?: string;
    transaction_classification?: string[];
    transaction_type?: string;
    meta?: {
      provider_transaction_category?: string;
      provider_id?: string;
    };
    running_balance?: {
      amount?: number;
      currency?: string;
    };
    status?: string;
  };
  const category =
    payload.transaction_category ??
    payload.meta?.provider_transaction_category ??
    payload.transaction_classification?.join(":");
  const transferText = `${payload.description ?? ""} ${category ?? ""}`.toLowerCase();

  return {
    id: payload.transaction_id ?? payload.normalised_provider_transaction_id,
    transactionId: payload.transaction_id ?? payload.normalised_provider_transaction_id,
    accountId: payload.account_id,
    date: payload.timestamp ?? payload.booking_datetime,
    description: payload.description ?? "TrueLayer transaction",
    merchant: payload.merchant_name ?? payload.description,
    amount: payload.amount,
    currency: payload.currency ?? payload.running_balance?.currency,
    status: payload.status ?? payload.transaction_type,
    pending: payload.status?.toLowerCase() === "pending",
    category,
    isTransfer:
      transferText.includes("transfer") ||
      transferText.includes("repayment") ||
      transferText.includes("credit card payment"),
  };
}

export class TrueLayerProvider implements OpenBankingProviderAdapter {
  private config: TrueLayerProviderConfig;
  private clientFactory: TrueLayerClientFactory;
  private clientPromise: Promise<TrueLayerClientLike> | null = null;

  constructor(
    config = getTrueLayerProviderConfig(),
    clientFactory: TrueLayerClientFactory = defaultTrueLayerClientFactory,
  ) {
    this.config = config;
    this.clientFactory = clientFactory;
  }

  private ensureConfigured() {
    if (!this.config.configured) {
      throw new ProviderSafeError(
        "provider_not_configured",
        "TrueLayer sandbox credentials are not configured.",
        400,
      );
    }
  }

  private async getClient() {
    this.ensureConfigured();

    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory(this.config).catch((error) => {
        this.clientPromise = null;
        throw toProviderSafeError(error, "provider_not_configured");
      });
    }

    return this.clientPromise;
  }

  async createConnection(input: CreateConnectionInput): Promise<ProviderConnectionStart> {
    const now = nowIso();
    const connectionId = safeConnectionId();
    const redirectUri = input.redirectUri ?? this.config.redirectUri;
    const connection: BankConnection = {
      id: connectionId,
      userId: input.userId,
      provider: "truelayer",
      providerUserId: input.userId ?? null,
      institutionName: input.institutionName || "TrueLayer sandbox",
      institutionId: input.institutionId || "truelayer_sandbox",
      status: this.config.configured ? "connecting" : "not_connected",
      consentStatus: this.config.configured ? "pending" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
      consentCompletedAt: null,
      consentExpiresAt: null,
      lastSyncedAt: null,
      errorMessage: safeMessageForConfig(this.config),
      createdAt: now,
      updatedAt: now,
    };

    if (!this.config.configured || !redirectUri || !input.userId) {
      return {
        connection,
        authorizationUrl: null,
        providerConfigured: false,
        state: connectionId,
        safeMessage: "TrueLayer sandbox credentials are not configured.",
      };
    }

    const attempt = createConnectionAttempt({
      userId: input.userId,
      providerUserId: input.userId,
      provider: "truelayer",
      connectionId,
      institutionId: input.institutionId || "truelayer_sandbox",
      institutionName: input.institutionName || "TrueLayer sandbox",
      redirectUri,
    });
    const { authorizationUrl, diagnostics } = buildTrueLayerAuthorizationUrl({
      config: this.config,
      redirectUri,
      state: attempt.state,
    });

    logServerEvent({
      level: "info",
      event: "provider_sync_event",
      message: "TrueLayer auth URL diagnostics.",
      metadata: diagnostics,
    });

    return {
      connection,
      authorizationUrl: authorizationUrl.toString(),
      providerConfigured: true,
      state: attempt.state,
      safeMessage: null,
    };
  }

  async handleCallback(input: ProviderCallbackInput): Promise<ProviderCallbackResult> {
    const now = nowIso();

    if (input.error) {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "The TrueLayer consent flow was cancelled or failed.",
        400,
      );
    }

    if (!this.config.configured || !input.code || !input.state || !input.userId) {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "TrueLayer callback details were incomplete.",
        400,
      );
    }

    const attempt = consumeConnectionAttempt(input.state);

    if (!attempt || attempt.userId !== input.userId || attempt.provider !== "truelayer") {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "TrueLayer callback state could not be verified.",
        400,
      );
    }

    const client = await this.getClient();
    const tokens = await client.exchangeCodeForTokens({
      code: input.code,
      redirectUri: attempt.redirectUri,
    });
    const expiresAt = tokenExpiry(tokens) ?? futureIso(90);
    const providerUserId = tokenProviderUserId(tokens, input.userId);

    await saveProviderToken({
      userId: input.userId,
      connectionId: attempt.connectionId,
      provider: "truelayer",
      tokenPayload: tokens,
      providerUserId,
      providerConnectionId: attempt.connectionId,
      expiresAt,
      accessTokenExpiresAt: expiresAt,
      refreshTokenExpiresAt: futureIso(90),
      scopes: this.config.scopes,
    });

    return {
      connection: {
        id: attempt.connectionId,
        userId: input.userId,
        provider: "truelayer",
        providerUserId,
        institutionName: attempt.institutionName,
        institutionId: attempt.institutionId,
        status: "connected",
        consentStatus: "active",
        consentStartedAt: now,
        consentCompletedAt: now,
        consentExpiresAt: futureIso(90),
        lastSyncedAt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      safeMessage: "TrueLayer sandbox callback handled.",
    };
  }

  async getConnectionStatus(connectionId: string): Promise<BankConnection> {
    const now = nowIso();
    const attempt = getConnectionAttempt(connectionId);

    return {
      id: connectionId,
      provider: "truelayer",
      providerUserId: attempt?.providerUserId ?? null,
      institutionName: attempt?.institutionName ?? "TrueLayer sandbox",
      institutionId: attempt?.institutionId ?? "truelayer_sandbox",
      status: this.config.configured ? "connected" : "not_connected",
      consentStatus: this.config.configured ? "active" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
      consentCompletedAt: this.config.configured ? now : null,
      consentExpiresAt: this.config.configured ? futureIso(90) : null,
      lastSyncedAt: null,
      errorMessage: safeMessageForConfig(this.config),
      createdAt: now,
      updatedAt: now,
    };
  }

  async getAccounts(
    connectionId: string,
    context?: ProviderRequestContext,
  ): Promise<ProviderAccount[]> {
    const providerContext = requireProviderContext(context);
    const client = await this.getClient();
    const rawAccounts = await client.getAccounts(providerContext);
    const rawCards = client.getCards ? await client.getCards(providerContext) : [];
    const accountIds = [...rawAccounts, ...rawCards]
      .map((account) => (account as { account_id?: string; card_id?: string }).account_id ?? (account as { card_id?: string }).card_id)
      .filter(Boolean) as string[];
    const balances = client.getBalances
      ? await client.getBalances({
          ...providerContext,
          providerAccountIds: accountIds,
        })
      : [];
    const allAccounts = [...rawAccounts, ...rawCards];

    await captureProviderPayloadInspection({
      provider: "truelayer",
      connectionId,
      kind: "account",
      payloads: allAccounts,
    });

    return allAccounts.map((account) =>
      mapProviderAccountPayload(truelayerAccountPayload(account, balances), {
        id: connectionId,
        institutionId:
          (account as { provider?: { provider_id?: string } }).provider?.provider_id ??
          "truelayer_sandbox",
        institutionName:
          (account as { provider?: { display_name?: string } }).provider?.display_name ??
          "TrueLayer sandbox",
      }),
    );
  }

  async getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]> {
    const providerContext = requireProviderContext(query);
    const client = await this.getClient();
    const rawTransactions = await client.getTransactions({
      ...query,
      tokenReference: providerContext.tokenReference,
    });

    await captureProviderPayloadInspection({
      provider: "truelayer",
      connectionId,
      kind: "transaction",
      payloads: rawTransactions,
    });

    return rawTransactions.map((payload) =>
      mapProviderTransactionPayload(truelayerTransactionPayload(payload), connectionId),
    );
  }

  async refreshConnection(
    connectionId: string,
    context?: ProviderRequestContext,
  ): Promise<ProviderSyncEvent> {
    const startedAt = nowIso();

    if (!this.config.configured) {
      return {
        id: `sync_${connectionId}_${Date.now()}`,
        providerConnectionId: connectionId,
        provider: "truelayer",
        status: "sync_failed",
        message: "TrueLayer sandbox credentials are not configured.",
        startedAt,
        finishedAt: nowIso(),
      };
    }

    const providerContext = requireProviderContext(context);
    const client = await this.getClient();

    await client.refreshConnection(providerContext);

    return {
      id: `sync_${connectionId}_${Date.now()}`,
      providerConnectionId: connectionId,
      provider: "truelayer",
      status: "syncing",
      message: "TrueLayer sandbox sync requested.",
      startedAt,
      finishedAt: null,
    };
  }

  async revokeConnection(
    connectionId: string,
    context?: ProviderRequestContext,
  ): Promise<BankConnection> {
    const now = nowIso();

    if (this.config.configured && context?.tokenReference) {
      const client = await this.getClient();
      await client.revokeConnection(context);
    }

    return {
      id: connectionId,
      provider: "truelayer",
      providerUserId: null,
      institutionName: "TrueLayer sandbox",
      institutionId: "truelayer_sandbox",
      status: "disconnected",
      consentStatus: "revoked",
      consentStartedAt: null,
      consentExpiresAt: null,
      lastSyncedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

export const truelayerProvider = new TrueLayerProvider();
