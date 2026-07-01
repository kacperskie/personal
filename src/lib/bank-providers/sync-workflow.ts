import type {
  Account,
  BankConnection,
  ProviderAccount,
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
import { logServerEvent } from "@/lib/observability/server-logger";

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

export type SyncTrigger = "manual" | "sync_all" | "scheduled" | "webhook";

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

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function addDays(date: string, days: number) {
  const timestamp = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime();
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function transactionSyncWindow(connection: BankConnection, syncStartedAt: string) {
  const dateTo = dateOnly(syncStartedAt);
  const lastTransactionSyncedAt = connection.lastTransactionSyncedAt ?? null;
  const dateFrom = lastTransactionSyncedAt
    ? addDays(lastTransactionSyncedAt, -3)
    : addDays(dateTo, -90);

  return { dateFrom, dateTo };
}

function safeIdSuffix(value: string | null | undefined) {
  if (!value) return "unknown";
  const clean = value.replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(-6) || "unknown";
}

function transactionEndpointLabel(account: ProviderAccount) {
  return account.type === "credit_card" ? "card_transactions" : "account_transactions";
}

function transactionPathTemplate(account: ProviderAccount) {
  return account.type === "credit_card"
    ? "/data/v1/cards/{card_id}/transactions"
    : "/data/v1/accounts/{account_id}/transactions";
}

function logTransactionSyncDiagnostics(input: {
  level?: "info" | "warn";
  connection: BankConnection;
  providerAccount: ProviderAccount;
  dateFrom: string;
  dateTo: string;
  status: number | null;
  returnedCount: number;
  storedCount: number;
  skippedCount: number;
  reason?: string | null;
}) {
  logServerEvent({
    level: input.level ?? "info",
    event: "provider_sync_event",
    message: "Provider transaction sync diagnostics.",
    metadata: {
      connectionIdSuffix: safeIdSuffix(input.connection.id),
      provider: input.connection.provider,
      mode: input.connection.mode ?? null,
      endpointLabel: transactionEndpointLabel(input.providerAccount),
      pathTemplate: transactionPathTemplate(input.providerAccount),
      providerAccountIdSuffix: safeIdSuffix(input.providerAccount.providerAccountId),
      responseStatus: input.status,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      returnedCount: input.returnedCount,
      storedCount: input.storedCount,
      skippedCount: input.skippedCount,
      reason: input.reason ?? null,
    },
  });
}

export async function syncBankConnection({
  userId,
  connection,
  provider,
  providerContext,
  dependencies,
  syncTrigger = "manual",
}: {
  userId: string;
  connection: BankConnection;
  provider: OpenBankingProviderAdapter;
  providerContext?: ProviderRequestContext;
  dependencies: SyncWorkflowDependencies;
  syncTrigger?: SyncTrigger;
}): Promise<SyncWorkflowResult> {
  const startedAt = new Date().toISOString();
  const auditEvents: AuditEventInput[] = [
    {
      userId,
      eventType: "bank_connection_sync_started",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: { provider: connection.provider, syncTrigger },
    },
  ];
  const syncEvents: ProviderSyncEvent[] = [];
  const startedEvent = syncEvent(connection, "syncing", "Provider sync started.", startedAt, null);
  syncEvents.push(await dependencies.recordProviderSyncEvent(startedEvent));
  let transactionFailureEndpoint: string | null = null;
  let transactionFailureReason: string | null = null;

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
    let transactionsReturned = 0;
    let transactionsSkipped = 0;
    const transactionWindow = transactionSyncWindow(connection, startedAt);

    for (const providerAccount of providerAccounts) {
      let providerTransactions;
      let storedForAccount = 0;
      let skippedForAccount = 0;

      try {
        providerTransactions = await provider.getTransactions(connection.id, {
          dateFrom: transactionWindow.dateFrom,
          dateTo: transactionWindow.dateTo,
          providerAccountId: providerAccount.providerAccountId,
          providerUserId: providerContext?.providerUserId,
          providerConnectionId: providerContext?.providerConnectionId,
          tokenReference: providerContext?.tokenReference,
          providerAccountType: providerAccount.type,
        });
      } catch (error) {
        const safeError = toProviderSafeError(error, "provider_sync_failed");
        transactionFailureEndpoint = transactionEndpointLabel(providerAccount);
        transactionFailureReason = safeError.safeReason ?? safeError.code;
        logTransactionSyncDiagnostics({
          level: "warn",
          connection,
          providerAccount,
          dateFrom: transactionWindow.dateFrom,
          dateTo: transactionWindow.dateTo,
          status: safeError.status,
          returnedCount: 0,
          storedCount: 0,
          skippedCount: 0,
          reason: transactionFailureReason,
        });
        throw error;
      }

      transactionsReturned += providerTransactions.length;

      for (const providerTransaction of providerTransactions) {
        const accountId = accountIdByProviderAccountId.get(providerTransaction.providerAccountId);

        if (!accountId) {
          skippedForAccount += 1;
          transactionsSkipped += 1;
          continue;
        }

        await dependencies.upsertTransaction(
          providerTransactionToTransaction(providerTransaction, accountId, {
            isCreditCard: providerAccount.type === "credit_card",
          }),
        );
        transactionsUpserted += 1;
        storedForAccount += 1;
      }

      logTransactionSyncDiagnostics({
        connection,
        providerAccount,
        dateFrom: transactionWindow.dateFrom,
        dateTo: transactionWindow.dateTo,
        status: 200,
        returnedCount: providerTransactions.length,
        storedCount: storedForAccount,
        skippedCount: skippedForAccount,
        reason: providerTransactions.length === 0 ? "provider_returned_zero_transactions" : null,
      });
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
      lastManualSyncAt:
        syncTrigger === "manual" || syncTrigger === "sync_all"
          ? completedAt
          : connection.lastManualSyncAt ?? null,
      lastAutomaticSyncAt:
        syncTrigger === "scheduled" || syncTrigger === "webhook"
          ? completedAt
          : connection.lastAutomaticSyncAt ?? null,
      lastSyncTrigger: syncTrigger,
      lastTransactionSyncedAt: completedAt,
      lastTransactionSyncStartedAt: startedAt,
      lastTransactionSyncStatus:
        transactionsReturned === 0 ? "no_transactions" : "success",
      lastTransactionSyncMessage:
        transactionsReturned === 0
          ? "Provider returned zero transactions for the requested date range."
          : `${transactionsUpserted} transaction${transactionsUpserted === 1 ? "" : "s"} stored from ${transactionsReturned} returned.`,
      lastTransactionDateFrom: transactionWindow.dateFrom,
      lastTransactionDateTo: transactionWindow.dateTo,
      lastTransactionReturnedCount: transactionsReturned,
      lastTransactionStoredCount: transactionsUpserted,
      lastTransactionSkippedCount: transactionsSkipped,
      lastTransactionFailedEndpoint: null,
      lastTransactionFailureReason: null,
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
      metadata: { accountsUpserted, transactionsUpserted, syncTrigger },
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
      lastManualSyncAt:
        syncTrigger === "manual" || syncTrigger === "sync_all"
          ? failedAt
          : connection.lastManualSyncAt ?? null,
      lastAutomaticSyncAt:
        syncTrigger === "scheduled" || syncTrigger === "webhook"
          ? failedAt
          : connection.lastAutomaticSyncAt ?? null,
      lastSyncTrigger: syncTrigger,
      lastTransactionSyncStartedAt: startedAt,
      lastTransactionSyncStatus: "failed",
      lastTransactionSyncMessage: safeError.userMessage,
      lastTransactionFailedEndpoint:
        transactionFailureEndpoint ??
        (safeReason === "truelayer_transactions_fetch_failed" ? "transactions" : null),
      lastTransactionFailureReason: transactionFailureReason ?? safeReason ?? null,
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
      metadata: { code: safeError.code, syncTrigger },
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
