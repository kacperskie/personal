import type { JWK } from "jose";
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
  getMoneyhubProviderConfig,
  type MoneyhubProviderConfig,
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

export type MoneyhubClientLike = {
  getAuthorizeUrlForCreatedUser(input: {
    bankId: string;
    userId: string;
    state: string;
    nonce: string;
    permissions?: string[];
    permissionsAction?: "add" | "replace";
    transactionFromDateTime?: string;
    expirationDateTime?: string;
    enableAsync?: boolean;
  }): Promise<string>;
  exchangeCodeForTokens(input: unknown): Promise<unknown>;
  syncUserConnection(input: {
    userId: string;
    connectionId: string;
    enableAsync?: boolean;
  }): Promise<unknown>;
  getAccounts(input: unknown): Promise<{ data?: unknown[] } | unknown[]>;
  getTransactions(input: unknown): Promise<{ data?: unknown[] } | unknown[]>;
  getUserConnections(input: unknown): Promise<{ data?: unknown[] } | unknown[]>;
  registerUser?(input: { clientUserId: string }): Promise<unknown>;
  deleteUserConnection(input: { userId: string; connectionId: string }): Promise<unknown>;
};

export type MoneyhubClientFactory = (
  config: MoneyhubProviderConfig,
) => Promise<MoneyhubClientLike>;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function safeConnectionId() {
  return `conn_moneyhub_${crypto.randomUUID()}`;
}

function parseMoneyhubKeys(config: MoneyhubProviderConfig): JWK[] {
  if (!config.privateKey) {
    return [];
  }

  try {
    const parsed = JSON.parse(config.privateKey) as JWK | { keys?: JWK[] };

    if ("keys" in parsed && Array.isArray(parsed.keys)) {
      return parsed.keys;
    }

    return [parsed as JWK];
  } catch {
    throw new ProviderSafeError(
      "provider_not_configured",
      "Moneyhub signing key configuration could not be parsed.",
      400,
    );
  }
}

async function defaultMoneyhubClientFactory(
  config: MoneyhubProviderConfig,
): Promise<MoneyhubClientLike> {
  const { Moneyhub } = await import("@mft/moneyhub-api-client");

  return Moneyhub({
    resourceServerUrl: config.apiBaseUrl,
    identityServiceUrl: config.authBaseUrl,
    options: {
      timeout: 30000,
      retry: {
        limit: 1,
        methods: ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"],
        statusCodes: [408, 429, 500, 502, 503, 504],
        maxRetryAfter: 3000,
      },
    },
    client: {
      client_id: config.clientId ?? "",
      client_secret: config.clientSecret ?? "",
      token_endpoint_auth_method: "client_secret_basic",
      id_token_signed_response_alg: "RS256",
      request_object_signing_alg: "none",
      redirect_uri: config.redirectUri ?? "",
      response_type: "code",
      keys: parseMoneyhubKeys(config),
    },
  });
}

function apiData<T>(response: { data?: T } | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: T }).data;
  }

  return response as T;
}

function tokenExpiry(tokens: unknown) {
  if (!tokens || typeof tokens !== "object") {
    return null;
  }

  const tokenLike = tokens as {
    expires_at?: number;
    expires_in?: number;
    expired?: () => boolean;
  };

  if (typeof tokenLike.expires_at === "number") {
    return new Date(tokenLike.expires_at * 1000).toISOString();
  }

  if (typeof tokenLike.expires_in === "number") {
    return new Date(Date.now() + tokenLike.expires_in * 1000).toISOString();
  }

  return null;
}

function tokenClaims(tokens: unknown): Record<string, unknown> {
  if (!tokens || typeof tokens !== "object") {
    return {};
  }

  const tokenLike = tokens as { claims?: () => Record<string, unknown> };

  return typeof tokenLike.claims === "function" ? tokenLike.claims() : {};
}

function userIdFromRegisterResponse(response: unknown, fallbackUserId: string) {
  if (!response || typeof response !== "object") {
    return fallbackUserId;
  }

  const value = response as { id?: unknown; userId?: unknown };

  return String(value.id ?? value.userId ?? fallbackUserId);
}

function safeMessageForConfig(config: MoneyhubProviderConfig) {
  return config.configured
    ? null
    : "Moneyhub sandbox credentials are not configured.";
}

function requireProviderUser(context?: ProviderRequestContext | TransactionQuery) {
  if (!context?.providerUserId) {
    throw new ProviderSafeError(
      "provider_sync_failed",
      "Moneyhub token metadata is missing. Reconnect the sandbox account before syncing.",
      400,
    );
  }

  return context.providerUserId;
}

export function moneyhubAccountPayload(account: unknown): ProviderAccountPayload {
  const payload = account as {
    id?: string;
    providerAccountId?: string;
    providerName?: string;
    providerId?: string;
    connectionId?: string;
    accountName?: string;
    productName?: string;
    type?: string;
    balance?: { amount?: { value?: number; currency?: string } };
    details?: { creditLimit?: number | null };
    currency?: string;
    accountReference?: string | null;
  };

  return {
    id: payload.id,
    providerAccountId: payload.providerAccountId ?? payload.id,
    institution: {
      id: payload.providerId ?? payload.connectionId,
      name: payload.providerName,
    },
    displayName: payload.accountName ?? payload.productName,
    officialName: payload.productName ?? payload.accountName,
    type: payload.type,
    accountType: payload.type,
    balance: payload.balance,
    currency: payload.currency ?? payload.balance?.amount?.currency,
    mask: payload.accountReference?.slice(-4) ?? null,
    details: payload.details,
  };
}

export function moneyhubTransactionPayload(transaction: unknown): ProviderTransactionPayload {
  const payload = transaction as {
    id?: string;
    accountId?: string;
    amount?: { value?: number; currency?: string };
    date?: string;
    dateModified?: string;
    longDescription?: string;
    shortDescription?: string;
    counterpartyId?: string;
    status?: string;
    categoryId?: string;
    proprietaryTransactionCode?: {
      code?: string;
      issuer?: string;
    };
    transactionCode?: {
      code?: string;
      subCode?: string;
    };
    transactionInformation?: string;
  };

  return {
    id: payload.id,
    accountId: payload.accountId,
    amount: payload.amount,
    date: payload.date,
    dateModified: payload.dateModified,
    description:
      payload.longDescription ??
      payload.transactionInformation ??
      payload.shortDescription ??
      "Moneyhub transaction",
    merchant: payload.shortDescription ?? payload.counterpartyId,
    currency: payload.amount?.currency,
    pending: payload.status === "pending",
    status: payload.status,
    category: payload.categoryId,
    proprietaryTransactionCode: payload.proprietaryTransactionCode,
    transactionCode: payload.transactionCode,
    transactionInformation: payload.transactionInformation,
  };
}

export class MoneyhubProvider implements OpenBankingProviderAdapter {
  private config: MoneyhubProviderConfig;
  private clientFactory: MoneyhubClientFactory;
  private clientPromise: Promise<MoneyhubClientLike> | null = null;

  constructor(
    config = getMoneyhubProviderConfig(),
    clientFactory: MoneyhubClientFactory = defaultMoneyhubClientFactory,
  ) {
    this.config = config;
    this.clientFactory = clientFactory;
  }

  private ensureConfigured() {
    if (!this.config.configured) {
      throw new ProviderSafeError(
        "provider_not_configured",
        "Moneyhub sandbox credentials are not configured.",
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

  private async getOrCreateProviderUserId(client: MoneyhubClientLike, appUserId: string) {
    if (!client.registerUser) {
      return appUserId;
    }

    try {
      const registered = await client.registerUser({
        clientUserId: appUserId,
      });

      return userIdFromRegisterResponse(registered, appUserId);
    } catch {
      return appUserId;
    }
  }

  async createConnection(input: CreateConnectionInput): Promise<ProviderConnectionStart> {
    const now = nowIso();
    const connectionId = safeConnectionId();
    const redirectUri = input.redirectUri ?? this.config.redirectUri;
    const connection: BankConnection = {
      id: connectionId,
      provider: "moneyhub",
      institutionName: input.institutionName || "Moneyhub sandbox",
      institutionId: input.institutionId || "moneyhub_sandbox",
      status: this.config.configured ? "connecting" : "not_connected",
      consentStatus: this.config.configured ? "pending" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
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
        safeMessage: "Moneyhub sandbox credentials are not configured.",
      };
    }

    const client = await this.getClient();
    const providerUserId = await this.getOrCreateProviderUserId(client, input.userId);
    const attempt = createConnectionAttempt({
      userId: input.userId,
      providerUserId,
      provider: "moneyhub",
      connectionId,
      institutionId: input.institutionId || "moneyhub_sandbox",
      institutionName: input.institutionName || "Moneyhub sandbox",
      redirectUri,
    });
    const authorizationUrl = await client.getAuthorizeUrlForCreatedUser({
      bankId: attempt.institutionId,
      userId: providerUserId,
      state: attempt.state,
      nonce: attempt.nonce,
      permissions: [
        "ReadAccountsBasic",
        "ReadAccountsDetail",
        "ReadBalances",
        "ReadTransactionsCredits",
        "ReadTransactionsDebits",
        "ReadTransactionsDetail",
      ],
      permissionsAction: "add",
      transactionFromDateTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      expirationDateTime: futureIso(90),
      enableAsync: false,
    });

    return {
      connection,
      authorizationUrl,
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
        "The Moneyhub consent flow was cancelled or failed.",
        400,
      );
    }

    if (!this.config.configured || !input.code || !input.state || !input.userId) {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "Moneyhub callback details were incomplete.",
        400,
      );
    }

    const attempt = consumeConnectionAttempt(input.state);

    if (!attempt || attempt.userId !== input.userId) {
      throw new ProviderSafeError(
        "provider_callback_failed",
        "Moneyhub callback state could not be verified.",
        400,
      );
    }

    const client = await this.getClient();
    const tokens = await client.exchangeCodeForTokens({
      paramsFromCallback: {
        code: input.code,
        state: input.state,
      },
      localParams: {
        state: attempt.state,
        nonce: attempt.nonce,
        sub: attempt.providerUserId,
        response_type: "code",
      },
    });
    const claims = tokenClaims(tokens);
    const providerUserId = String(claims.sub ?? attempt.providerUserId);
    const providerConnectionId = String(claims["mh:con_id"] ?? attempt.connectionId);
    const expiresAt = tokenExpiry(tokens) ?? futureIso(90);

    await saveProviderToken({
      userId: input.userId,
      connectionId: attempt.connectionId,
      provider: "moneyhub",
      encryptedTokenPlaceholder: "moneyhub-token-placeholder",
      providerUserId,
      providerConnectionId,
      expiresAt,
      accessTokenExpiresAt: expiresAt,
      refreshTokenExpiresAt: futureIso(90),
      scopes: ["accounts:read", "transactions:read:all"],
    });

    return {
      connection: {
        id: attempt.connectionId,
        provider: "moneyhub",
        institutionName: attempt.institutionName,
        institutionId: attempt.institutionId,
        status: "connected",
        consentStatus: "active",
        consentStartedAt: now,
        consentExpiresAt: futureIso(90),
        lastSyncedAt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      safeMessage: "Moneyhub sandbox callback handled.",
    };
  }

  async getConnectionStatus(connectionId: string): Promise<BankConnection> {
    const now = nowIso();
    const attempt = getConnectionAttempt(connectionId);

    return {
      id: connectionId,
      provider: "moneyhub",
      institutionName: attempt?.institutionName ?? "Moneyhub sandbox",
      institutionId: attempt?.institutionId ?? "moneyhub_sandbox",
      status: this.config.configured ? "connected" : "not_connected",
      consentStatus: this.config.configured ? "active" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
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
    const providerUserId = requireProviderUser(context);
    const client = await this.getClient();
    const response = await client.getAccounts({
      userId: providerUserId,
      params: {
        limit: 100,
        offset: 0,
        showTransactionData: false,
        showPerformanceScore: false,
      },
    });
    const providerConnectionId = context?.providerConnectionId;
    const rawAccounts = apiData<unknown[]>(response).filter((account) => {
        if (!providerConnectionId) {
          return true;
        }

        return (account as { connectionId?: string }).connectionId === providerConnectionId;
      });
    await captureProviderPayloadInspection({
      provider: "moneyhub",
      connectionId,
      kind: "account",
      payloads: rawAccounts,
    });
    const payloads = rawAccounts.map(moneyhubAccountPayload);

    return payloads.map((payload) =>
      mapProviderAccountPayload(payload, {
        id: connectionId,
        institutionId: payload.institution?.id ?? "moneyhub_sandbox",
        institutionName: payload.institution?.name ?? "Moneyhub sandbox",
      }),
    );
  }

  async getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]> {
    const providerUserId = requireProviderUser(query);
    const client = await this.getClient();
    const response = await client.getTransactions({
      userId: providerUserId,
      params: {
        limit: 500,
        offset: 0,
        startDate: query?.dateFrom,
        endDate: query?.dateTo,
        accountId: query?.providerAccountId,
      },
    });
    const rawTransactions = apiData<unknown[]>(response);
    await captureProviderPayloadInspection({
      provider: "moneyhub",
      connectionId,
      kind: "transaction",
      payloads: rawTransactions,
    });
    const payloads = rawTransactions.map(moneyhubTransactionPayload);

    return payloads.map((payload) => mapProviderTransactionPayload(payload, connectionId));
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
        provider: "moneyhub",
        status: "sync_failed",
        message: "Moneyhub sandbox credentials are not configured.",
        startedAt,
        finishedAt: nowIso(),
      };
    }

    const providerUserId = requireProviderUser(context);
    const client = await this.getClient();

    await client.syncUserConnection({
      userId: providerUserId,
      connectionId: context?.providerConnectionId ?? connectionId,
      enableAsync: false,
    });

    return {
      id: `sync_${connectionId}_${Date.now()}`,
      providerConnectionId: connectionId,
      provider: "moneyhub",
      status: "syncing",
      message: "Moneyhub sandbox sync requested.",
      startedAt,
      finishedAt: null,
    };
  }

  async revokeConnection(
    connectionId: string,
    context?: ProviderRequestContext,
  ): Promise<BankConnection> {
    const now = nowIso();

    if (this.config.configured && context?.providerUserId) {
      const client = await this.getClient();
      await client.deleteUserConnection({
        userId: context.providerUserId,
        connectionId: context.providerConnectionId ?? connectionId,
      });
    }

    return {
      id: connectionId,
      provider: "moneyhub",
      institutionName: "Moneyhub sandbox",
      institutionId: "moneyhub_sandbox",
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

export const moneyhubProvider = new MoneyhubProvider();
