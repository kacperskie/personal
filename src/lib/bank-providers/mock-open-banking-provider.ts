import type {
  BankConnection,
  ProviderAccount,
  ProviderSyncEvent,
  ProviderTransaction,
} from "@/lib/domain";
import type {
  CreateConnectionInput,
  OpenBankingProviderAdapter,
  ProviderCallbackInput,
  ProviderCallbackResult,
  ProviderConnectionStart,
  TransactionQuery,
} from "@/lib/bank-providers/types";

const now = "2026-06-30T09:00:00.000Z";

const connections: BankConnection[] = [
  {
    id: "conn_amex",
    provider: "mock",
    institutionName: "American Express",
    institutionId: "amex",
    status: "connected",
    consentStatus: "active",
    consentStartedAt: "2026-06-01T09:00:00.000Z",
    consentExpiresAt: "2026-09-01T09:00:00.000Z",
    lastSyncedAt: now,
    errorMessage: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: now,
  },
  {
    id: "conn_nationwide",
    provider: "mock",
    institutionName: "Nationwide",
    institutionId: "nationwide",
    status: "syncing",
    consentStatus: "active",
    consentStartedAt: "2026-06-01T09:00:00.000Z",
    consentExpiresAt: "2026-09-01T09:00:00.000Z",
    lastSyncedAt: "2026-06-30T08:58:00.000Z",
    errorMessage: null,
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: now,
  },
  {
    id: "conn_revolut",
    provider: "mock",
    institutionName: "Revolut",
    institutionId: "revolut",
    status: "connected",
    consentStatus: "expired",
    consentStartedAt: "2026-03-01T09:00:00.000Z",
    consentExpiresAt: "2026-06-20T09:00:00.000Z",
    lastSyncedAt: "2026-06-20T08:45:00.000Z",
    errorMessage: null,
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-06-20T08:45:00.000Z",
  },
  {
    id: "conn_mock_failed",
    provider: "mock",
    institutionName: "Mock Sandbox Failure",
    institutionId: "mock_failed",
    status: "sync_failed",
    consentStatus: "active",
    consentStartedAt: "2026-06-10T09:00:00.000Z",
    consentExpiresAt: "2026-09-10T09:00:00.000Z",
    lastSyncedAt: "2026-06-29T07:30:00.000Z",
    errorMessage: "Mock sync error for lifecycle display.",
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-29T07:30:00.000Z",
  },
];

const accountsByConnectionId: Record<string, ProviderAccount[]> = {
  conn_amex: [
    {
      providerConnectionId: "conn_amex",
      providerAccountId: "amex_card_001",
      institutionName: "American Express",
      institutionId: "amex",
      name: "Amex Preferred Rewards",
      officialName: "American Express Preferred Rewards Credit Card",
      type: "credit_card",
      subtype: "charge_card",
      balance: -640,
      availableBalance: 4360,
      creditLimit: 5000,
      currency: "GBP",
      mask: "3005",
    },
  ],
  conn_nationwide: [
    {
      providerConnectionId: "conn_nationwide",
      providerAccountId: "nw_current_001",
      institutionName: "Nationwide",
      institutionId: "nationwide",
      name: "FlexDirect",
      officialName: "Nationwide FlexDirect Current Account",
      type: "current_account",
      subtype: "current",
      balance: 3420.7,
      availableBalance: 3420.7,
      creditLimit: null,
      currency: "GBP",
      mask: "1122",
    },
    {
      providerConnectionId: "conn_nationwide",
      providerAccountId: "nw_bills_001",
      institutionName: "Nationwide",
      institutionId: "nationwide",
      name: "Bills pot",
      officialName: "Nationwide FlexDirect Bills Account",
      type: "current_account",
      subtype: "current",
      balance: 900,
      availableBalance: 900,
      creditLimit: null,
      currency: "GBP",
      mask: "2211",
    },
    {
      providerConnectionId: "conn_nationwide",
      providerAccountId: "nw_savings_001",
      institutionName: "Nationwide",
      institutionId: "nationwide",
      name: "Emergency fund",
      officialName: "Nationwide Instant Access Saver",
      type: "savings",
      subtype: "savings",
      balance: 2140,
      availableBalance: 2140,
      creditLimit: null,
      currency: "GBP",
      mask: "7788",
    },
  ],
  conn_revolut: [
    {
      providerConnectionId: "conn_revolut",
      providerAccountId: "revolut_current_001",
      institutionName: "Revolut",
      institutionId: "revolut",
      name: "Revolut Everyday",
      officialName: "Revolut Current Account",
      type: "current_account",
      subtype: "current",
      balance: 485,
      availableBalance: 485,
      creditLimit: null,
      currency: "GBP",
      mask: "4400",
    },
    {
      providerConnectionId: "conn_revolut",
      providerAccountId: "revolut_holiday_001",
      institutionName: "Revolut",
      institutionId: "revolut",
      name: "Holiday vault",
      officialName: "Revolut Holiday Vault",
      type: "savings",
      subtype: "vault",
      balance: 520,
      availableBalance: 520,
      creditLimit: null,
      currency: "GBP",
      mask: "8800",
    },
  ],
};

const transactionsByConnectionId: Record<string, ProviderTransaction[]> = {
  conn_amex: [
    {
      id: "ptxn_amex_001",
      providerConnectionId: "conn_amex",
      providerAccountId: "amex_card_001",
      providerTransactionId: "amex_txn_001",
      date: "2026-06-27",
      merchant: "City Lunch Bar",
      description: "Lunch and coffee",
      amount: -18.5,
      currency: "GBP",
      pending: false,
      category: "Eating out",
      isOwnAccountTransfer: false,
    },
  ],
  conn_nationwide: [
    {
      id: "ptxn_nw_001",
      providerConnectionId: "conn_nationwide",
      providerAccountId: "nw_current_001",
      providerTransactionId: "nw_txn_001",
      date: "2026-06-28",
      merchant: "Northside Grocers",
      description: "Weekly food shop",
      amount: -64.2,
      currency: "GBP",
      pending: false,
      category: "Groceries",
      isOwnAccountTransfer: false,
    },
    {
      id: "ptxn_nw_transfer_001",
      providerConnectionId: "conn_nationwide",
      providerAccountId: "nw_current_001",
      providerTransactionId: "nw_txn_transfer_001",
      date: "2026-06-26",
      merchant: "Own account transfer",
      description: "Transfer to emergency fund",
      amount: -300,
      currency: "GBP",
      pending: false,
      category: "Transfer",
      isOwnAccountTransfer: true,
    },
  ],
  conn_revolut: [
    {
      id: "ptxn_rev_001",
      providerConnectionId: "conn_revolut",
      providerAccountId: "revolut_current_001",
      providerTransactionId: "rev_txn_001",
      date: "2026-06-24",
      merchant: "Online Homeware",
      description: "Household items",
      amount: -42.9,
      currency: "GBP",
      pending: false,
      category: "Personal",
      isOwnAccountTransfer: false,
    },
  ],
};

function cloneConnection(connection: BankConnection): BankConnection {
  return { ...connection };
}

function connectionForId(connectionId: string): BankConnection {
  const connection = connections.find((candidate) => candidate.id === connectionId);

  if (!connection) {
    throw new Error(`Unknown mock connection: ${connectionId}`);
  }

  return cloneConnection(connection);
}

export class MockOpenBankingProvider implements OpenBankingProviderAdapter {
  async createConnection(input: CreateConnectionInput): Promise<ProviderConnectionStart> {
    const state = `conn_mock_${input.institutionId}_${Date.now()}`;
    const connection: BankConnection = {
      id: `conn_${input.institutionId}_new`,
      provider: "mock",
      institutionName: input.institutionName,
      institutionId: input.institutionId,
      status: "connecting",
      consentStatus: "pending",
      consentStartedAt: now,
      consentExpiresAt: null,
      lastSyncedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    return {
      connection,
      authorizationUrl: null,
      providerConfigured: true,
      state,
      safeMessage: "Mock provider connection created without external API calls.",
    };
  }

  async handleCallback(input: ProviderCallbackInput): Promise<ProviderCallbackResult> {
    const connectionId = input.state?.startsWith("conn_") ? input.state : "conn_mock_callback";

    return {
      connection: {
        id: connectionId,
        provider: "mock",
        institutionName: "Mock sandbox",
        institutionId: "mock",
        status: "connected",
        consentStatus: "active",
        consentStartedAt: now,
        consentExpiresAt: "2026-09-30T09:00:00.000Z",
        lastSyncedAt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
      safeMessage: "Mock callback handled.",
    };
  }

  async getConnectionStatus(connectionId: string): Promise<BankConnection> {
    return connectionForId(connectionId);
  }

  async getAccounts(connectionId: string): Promise<ProviderAccount[]> {
    return [...(accountsByConnectionId[connectionId] ?? [])];
  }

  async getTransactions(
    connectionId: string,
    query?: TransactionQuery,
  ): Promise<ProviderTransaction[]> {
    return (transactionsByConnectionId[connectionId] ?? []).filter((transaction) => {
      const afterStart = !query?.dateFrom || transaction.date >= query.dateFrom;
      const beforeEnd = !query?.dateTo || transaction.date <= query.dateTo;
      return afterStart && beforeEnd;
    });
  }

  async refreshConnection(connectionId: string): Promise<ProviderSyncEvent> {
    const connection = connectionForId(connectionId);

    return {
      id: `sync_${connectionId}_001`,
      providerConnectionId: connectionId,
      provider: connection.provider,
      status: "syncing",
      message: "Mock refresh queued.",
      startedAt: now,
      finishedAt: null,
    };
  }

  async revokeConnection(connectionId: string): Promise<BankConnection> {
    const connection = connectionForId(connectionId);

    return {
      ...connection,
      status: "disconnected",
      consentStatus: "revoked",
      updatedAt: now,
    };
  }
}

export const mockOpenBankingProvider = new MockOpenBankingProvider();
