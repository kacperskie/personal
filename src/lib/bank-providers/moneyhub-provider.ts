import type { BankConnection, ProviderAccount, ProviderSyncEvent, ProviderTransaction } from "@/lib/domain";
import { getMoneyhubProviderConfig, type MoneyhubProviderConfig } from "@/lib/bank-providers/provider-config";
import { ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  mapProviderAccountPayload,
  mapProviderTransactionPayload,
  type ProviderAccountPayload,
  type ProviderTransactionPayload,
} from "@/lib/bank-providers/provider-mappers";
import type {
  CreateConnectionInput,
  OpenBankingProviderAdapter,
  ProviderCallbackInput,
  ProviderCallbackResult,
  ProviderConnectionStart,
  TransactionQuery,
} from "@/lib/bank-providers/types";
import { saveProviderToken } from "@/lib/bank-providers/token-store";

function nowIso() {
  return new Date().toISOString();
}

function connectionIdForState(state: string | null) {
  return state?.startsWith("conn_moneyhub_") ? state : `conn_moneyhub_${Date.now()}`;
}

export class MoneyhubProvider implements OpenBankingProviderAdapter {
  private config: MoneyhubProviderConfig;

  constructor(config = getMoneyhubProviderConfig()) {
    this.config = config;
  }

  async createConnection(input: CreateConnectionInput): Promise<ProviderConnectionStart> {
    const now = nowIso();
    const state = `conn_moneyhub_${crypto.randomUUID()}`;
    const connection: BankConnection = {
      id: state,
      provider: "moneyhub",
      institutionName: input.institutionName || "Moneyhub sandbox",
      institutionId: input.institutionId || "moneyhub_sandbox",
      status: this.config.configured ? "connecting" : "not_connected",
      consentStatus: this.config.configured ? "pending" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
      consentExpiresAt: null,
      lastSyncedAt: null,
      errorMessage: this.config.configured
        ? null
        : "Moneyhub sandbox credentials are not configured.",
      createdAt: now,
      updatedAt: now,
    };

    if (!this.config.configured || !this.config.clientId || !this.config.redirectUri) {
      return {
        connection,
        authorizationUrl: null,
        providerConfigured: false,
        state,
        safeMessage: "Moneyhub sandbox credentials are not configured.",
      };
    }

    const authorizationUrl = new URL("/oidc/auth", this.config.authBaseUrl);
    authorizationUrl.searchParams.set("client_id", this.config.clientId);
    authorizationUrl.searchParams.set("redirect_uri", input.redirectUri ?? this.config.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid offline_access accounts transactions");
    authorizationUrl.searchParams.set("state", state);

    return {
      connection,
      authorizationUrl: authorizationUrl.toString(),
      providerConfigured: true,
      state,
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

    if (!this.config.configured || !input.code) {
      throw new ProviderSafeError(
        "provider_not_configured",
        "Moneyhub sandbox credentials are not configured.",
        400,
      );
    }

    const connectionId = connectionIdForState(input.state);

    await saveProviderToken({
      userId: input.userId ?? "unknown_user",
      connectionId,
      provider: "moneyhub",
      encryptedTokenPlaceholder: `moneyhub-auth-code:${input.code.slice(0, 4)}...`,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      scopes: ["accounts", "transactions"],
    });

    return {
      connection: {
        id: connectionId,
        provider: "moneyhub",
        institutionName: "Moneyhub sandbox",
        institutionId: "moneyhub_sandbox",
        status: "connected",
        consentStatus: "active",
        consentStartedAt: now,
        consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
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

    return {
      id: connectionId,
      provider: "moneyhub",
      institutionName: "Moneyhub sandbox",
      institutionId: "moneyhub_sandbox",
      status: this.config.configured ? "connected" : "not_connected",
      consentStatus: this.config.configured ? "active" : "not_started",
      consentStartedAt: this.config.configured ? now : null,
      consentExpiresAt: this.config.configured
        ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      lastSyncedAt: null,
      errorMessage: this.config.configured
        ? null
        : "Moneyhub sandbox credentials are not configured.",
      createdAt: now,
      updatedAt: now,
    };
  }

  async getAccounts(connectionId: string): Promise<ProviderAccount[]> {
    if (!this.config.configured) {
      throw new ProviderSafeError(
        "provider_not_configured",
        "Moneyhub sandbox credentials are not configured.",
        400,
      );
    }

    const sandboxPayloads: ProviderAccountPayload[] = [
      {
        id: "moneyhub_sandbox_current",
        institution: { id: "moneyhub_sandbox", name: "Moneyhub sandbox" },
        displayName: "Sandbox current account",
        officialName: "Moneyhub Sandbox Current Account",
        type: "current",
        balance: 1250,
        availableBalance: 1250,
        currency: "GBP",
        mask: "0001",
      },
    ];

    return sandboxPayloads.map((payload) =>
      mapProviderAccountPayload(payload, {
        id: connectionId,
        institutionId: "moneyhub_sandbox",
        institutionName: "Moneyhub sandbox",
      }),
    );
  }

  async getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]> {
    if (!this.config.configured) {
      throw new ProviderSafeError(
        "provider_not_configured",
        "Moneyhub sandbox credentials are not configured.",
        400,
      );
    }

    const payloads: ProviderTransactionPayload[] = [
      {
        id: "moneyhub_sandbox_txn_001",
        accountId: "moneyhub_sandbox_current",
        date: query?.dateTo ?? new Date().toISOString().slice(0, 10),
        description: "Sandbox grocery transaction",
        merchant: "Sandbox Grocers",
        amount: -12.5,
        currency: "GBP",
        pending: false,
        category: "Groceries",
      },
    ];

    return payloads.map((payload) => mapProviderTransactionPayload(payload, connectionId));
  }

  async refreshConnection(connectionId: string): Promise<ProviderSyncEvent> {
    return {
      id: `sync_${connectionId}_${Date.now()}`,
      providerConnectionId: connectionId,
      provider: "moneyhub",
      status: "syncing",
      message: this.config.configured
        ? "Moneyhub sandbox sync started."
        : "Moneyhub sandbox credentials are not configured.",
      startedAt: nowIso(),
      finishedAt: null,
    };
  }

  async revokeConnection(connectionId: string): Promise<BankConnection> {
    const now = nowIso();

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
