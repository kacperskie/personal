import type {
  Account,
  BankConnection,
  ProviderSyncEvent,
  Transaction,
} from "@/lib/domain";
import type { OpenBankingProviderAdapter } from "@/lib/bank-providers/types";
import type { ProviderRequestContext } from "@/lib/bank-providers/types";
import { toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  providerAccountToAccount,
  providerTransactionToTransaction,
} from "@/lib/bank-providers/provider-mappers";
import { createAuditEvent, type AuditEventInput } from "@/lib/repositories/audit";

export type SyncWorkflowDependencies = {
  upsertAccount(account: Account): Promise<Account>;
  upsertTransaction(transaction: Transaction): Promise<Transaction>;
  recordProviderSyncEvent(event: ProviderSyncEvent): Promise<ProviderSyncEvent>;
  updateBankConnectionStatus(connection: BankConnection): Promise<BankConnection>;
};

export type SyncWorkflowResult = {
  status: "success" | "failed";
  connection: BankConnection;
  accountsUpserted: number;
  transactionsUpserted: number;
  syncEvents: ProviderSyncEvent[];
  auditEvents: AuditEventInput[];
  safeMessage: string;
  /** Safe, non-secret machine reason for a failure (null on success). */
  reason: string | null;
};

function syncEvent(
  connection: BankConnection,
  status: ProviderSyncEvent["status"],
  message: string,
  startedAt: string,
  finishedAt: string | null,
): ProviderSyncEvent {
  return {
    id: `sync_${connection.id}_${status}_${Date.now()}`,
    providerConnectionId: connection.id,
    provider: connection.provider,
    status,
    message,
    startedAt,
    finishedAt,
  };
}

export async function syncBankConnection({
  userId,
  connection,
  provider,
  providerContext,
  dependencies,
}: {
  userId: string;
  connection: BankConnection;
  provider: OpenBankingProviderAdapter;
  providerContext?: ProviderRequestContext;
  dependencies: SyncWorkflowDependencies;
}): Promise<SyncWorkflowResult> {
  const startedAt = new Date().toISOString();
  const auditEvents: AuditEventInput[] = [
    {
      userId,
      eventType: "bank_connection_sync_started",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: { provider: connection.provider },
    },
  ];
  const syncEvents: ProviderSyncEvent[] = [];
  const startedEvent = syncEvent(connection, "syncing", "Provider sync started.", startedAt, null);
  syncEvents.push(await dependencies.recordProviderSyncEvent(startedEvent));

  try {
    const refreshEvent = await provider.refreshConnection(connection.id, providerContext);
    syncEvents.push(await dependencies.recordProviderSyncEvent(refreshEvent));
    const fetchedProviderAccounts = await provider.getAccounts(connection.id, providerContext);
    const scopedProviderAccountIds = new Set(providerContext?.providerAccountIds ?? []);
    const providerAccounts =
      scopedProviderAccountIds.size === 0
        ? fetchedProviderAccounts
        : fetchedProviderAccounts.filter((account) =>
            scopedProviderAccountIds.has(account.providerAccountId),
          );
    const accountIdByProviderAccountId = new Map<string, string>();
    let accountsUpserted = 0;

    for (const providerAccount of providerAccounts) {
      const account = providerAccountToAccount(
        providerAccount,
        userId,
        connection.provider,
        startedAt,
      );
      const upserted = await dependencies.upsertAccount(account);
      accountIdByProviderAccountId.set(providerAccount.providerAccountId, upserted.id);
      accountsUpserted += 1;
    }

    let transactionsUpserted = 0;

    for (const providerAccount of providerAccounts) {
      const providerTransactions = await provider.getTransactions(connection.id, {
        dateFrom: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        dateTo: startedAt.slice(0, 10),
        providerAccountId: providerAccount.providerAccountId,
        providerUserId: providerContext?.providerUserId,
        providerConnectionId: providerContext?.providerConnectionId,
        tokenReference: providerContext?.tokenReference,
        providerAccountType: providerAccount.type,
      });

      for (const providerTransaction of providerTransactions) {
        const accountId = accountIdByProviderAccountId.get(providerTransaction.providerAccountId);

        if (!accountId) {
          continue;
        }

        await dependencies.upsertTransaction(
          providerTransactionToTransaction(providerTransaction, accountId),
        );
        transactionsUpserted += 1;
      }
    }

    const completedAt = new Date().toISOString();
    // Derive a safe provider display name from the synced accounts (e.g. Nationwide,
    // Revolut, American Express) so multiple live connections are distinguishable.
    const derivedProviderName = providerAccounts
      .map((account) => account.institutionName ?? null)
      .find((name): name is string => Boolean(name && !/^truelayer (live|sandbox)$/i.test(name)));
    const updatedConnection: BankConnection = {
      ...connection,
      status: "connected",
      lastSyncedAt: completedAt,
      errorMessage: null,
      updatedAt: completedAt,
      providerName: derivedProviderName ?? connection.providerName ?? null,
      displayName: derivedProviderName ?? connection.displayName ?? null,
      accountsSyncedCount: accountsUpserted,
      cardsSyncedCount: providerAccounts.filter((account) => account.type === "credit_card").length,
      lastFailedEndpoint: null,
      lastFailureReason: null,
    };
    const completedEvent = syncEvent(
      updatedConnection,
      "connected",
      "Provider sync completed.",
      startedAt,
      completedAt,
    );

    syncEvents.push(await dependencies.recordProviderSyncEvent(completedEvent));
    const savedConnection = await dependencies.updateBankConnectionStatus(updatedConnection);
    auditEvents.push({
      userId,
      eventType: "bank_connection_sync_completed",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: { accountsUpserted, transactionsUpserted },
    });

    return {
      status: "success",
      connection: savedConnection,
      accountsUpserted,
      transactionsUpserted,
      syncEvents,
      auditEvents,
      safeMessage: "Connection synced successfully.",
      reason: null,
    };
  } catch (error) {
    const safeError = toProviderSafeError(error, "provider_sync_failed");
    const failedAt = new Date().toISOString();
    const safeReason = safeError.safeReason ?? safeError.code;
    // Derive the failing endpoint from the safe reason (never from any payload):
    // e.g. truelayer_accounts_endpoint_not_supported -> accounts.
    const endpointMatch = /^truelayer_(me|accounts|cards|balance|transactions)_/.exec(safeReason ?? "");
    const lastFailedEndpoint =
      endpointMatch?.[1] ??
      (safeReason === "truelayer_accounts_endpoint_not_supported" ? "accounts" : null);
    const failedConnection: BankConnection = {
      ...connection,
      status: "sync_failed",
      errorMessage: safeError.userMessage,
      updatedAt: failedAt,
      lastFailedSyncAt: failedAt,
      lastFailedEndpoint,
      lastFailedStatus: safeError.status,
      lastFailureReason: safeReason ?? null,
    };
    const failedEvent = syncEvent(
      failedConnection,
      "sync_failed",
      safeError.userMessage,
      startedAt,
      failedAt,
    );

    syncEvents.push(await dependencies.recordProviderSyncEvent(failedEvent));
    const savedConnection = await dependencies.updateBankConnectionStatus(failedConnection);
    auditEvents.push({
      userId,
      eventType: "bank_connection_sync_failed",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: { code: safeError.code },
    });

    return {
      status: "failed",
      connection: savedConnection,
      accountsUpserted: 0,
      transactionsUpserted: 0,
      syncEvents,
      auditEvents,
      safeMessage: safeError.userMessage,
      reason: safeError.safeReason ?? safeError.code,
    };
  }
}

export function auditEventsToRows(events: AuditEventInput[]) {
  return events.map(createAuditEvent);
}
