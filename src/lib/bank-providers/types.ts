import type {
  BankConnection,
  ProviderAccount,
  ProviderSyncEvent,
  ProviderTransaction,
} from "@/lib/domain";

export type CreateConnectionInput = {
  userId?: string;
  institutionId: string;
  institutionName: string;
  redirectUri?: string;
  reconnectConnectionId?: string;
  existingConnection?: BankConnection;
};

export type ProviderConnectionStart = {
  connection: BankConnection;
  authorizationUrl: string | null;
  providerConfigured: boolean;
  state: string;
  safeMessage: string | null;
};

export type ProviderCallbackInput = {
  code: string | null;
  state: string | null;
  error?: string | null;
  userId?: string;
};

export type ProviderCallbackResult = {
  connection: BankConnection;
  reconnectConnectionId?: string;
  safeMessage: string | null;
};

export type TransactionQuery = {
  dateFrom?: string;
  dateTo?: string;
  providerAccountId?: string;
  providerAccountType?: ProviderAccount["type"];
  providerUserId?: string | null;
  providerConnectionId?: string | null;
  tokenReference?: string | null;
};

export type ProviderRequestContext = {
  providerUserId?: string | null;
  providerConnectionId?: string | null;
  tokenReference?: string | null;
  providerAccountIds?: string[];
  /**
   * Scopes granted by the stored connection/consent, when available. Used to gate
   * optional capabilities (e.g. cards) so we never request a scope the consent
   * did not grant. Absent means "unknown" and does not block on its own.
   */
  consentScopes?: string[];
};

export interface OpenBankingProviderAdapter {
  createConnection(input: CreateConnectionInput): Promise<ProviderConnectionStart>;
  handleCallback(input: ProviderCallbackInput): Promise<ProviderCallbackResult>;
  getConnectionStatus(connectionId: string): Promise<BankConnection>;
  getAccounts(connectionId: string, context?: ProviderRequestContext): Promise<ProviderAccount[]>;
  getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]>;
  refreshConnection(connectionId: string, context?: ProviderRequestContext): Promise<ProviderSyncEvent>;
  revokeConnection(connectionId: string, context?: ProviderRequestContext): Promise<BankConnection>;
}
