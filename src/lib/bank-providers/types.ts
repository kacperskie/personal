import type {
  BankConnection,
  ProviderAccount,
  ProviderSyncEvent,
  ProviderTransaction,
} from "@/lib/domain";

export type CreateConnectionInput = {
  institutionId: string;
  institutionName: string;
};

export type TransactionQuery = {
  dateFrom?: string;
  dateTo?: string;
};

export interface OpenBankingProviderAdapter {
  createConnection(input: CreateConnectionInput): Promise<BankConnection>;
  getConnectionStatus(connectionId: string): Promise<BankConnection>;
  getAccounts(connectionId: string): Promise<ProviderAccount[]>;
  getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]>;
  refreshConnection(connectionId: string): Promise<ProviderSyncEvent>;
  revokeConnection(connectionId: string): Promise<BankConnection>;
}
