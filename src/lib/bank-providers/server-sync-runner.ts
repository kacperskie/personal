import "server-only";

import type { BankConnection } from "@/lib/domain";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import {
  syncBankConnection,
  type SyncTrigger,
  type SyncWorkflowResult,
} from "@/lib/bank-providers/sync-workflow";
import {
  createTransactionChangeNotification,
  findPotentialDuplicatePayments,
  isLargeTransaction,
} from "@/lib/bank-providers/transaction-notifications";
import { getProviderTokenForSync } from "@/lib/bank-providers/token-store";
import {
  createServiceNotification,
  getServiceFinanceSnapshot,
  recordServiceAuditEvent,
  recordServiceProviderSyncEvent,
  updateServiceBankConnectionStatus,
  upsertServiceAccount,
  upsertServiceTransaction,
} from "@/lib/repositories/service-finance-repository";

export async function runServerConnectionSync({
  userId,
  connection,
  accountIds = [],
  createNotifications = true,
  syncTrigger = "scheduled",
}: {
  userId: string;
  connection: BankConnection;
  accountIds?: string[];
  createNotifications?: boolean;
  syncTrigger?: SyncTrigger;
}): Promise<SyncWorkflowResult> {
  const tokenPreflight =
    connection.provider === "mock"
      ? null
      : await getProviderTokenForSync(userId, connection.id);

  if (tokenPreflight && !tokenPreflight.ok) {
    throw new ProviderSafeError(
      "provider_sync_failed",
      tokenPreflight.message,
      tokenPreflight.status,
      tokenPreflight.reason,
    );
  }

  const tokenRecord = tokenPreflight?.ok ? tokenPreflight.record : null;
  const providerAccountIds = accountIds.length > 0 ? accountIds : undefined;
  const snapshotBefore = createNotifications
    ? await getServiceFinanceSnapshot(userId).catch(() => null)
    : null;
  const existingTransactionIds = new Set(
    snapshotBefore?.transactions.map((transaction) => transaction.id) ?? [],
  );
  const newTransactions: Awaited<ReturnType<typeof upsertServiceTransaction>>[] = [];
  const result = await syncBankConnection({
    userId,
    connection,
    provider: getProviderAdapter(connection.provider),
    providerContext: {
      providerUserId: tokenRecord?.providerUserId,
      providerConnectionId: tokenRecord?.providerConnectionId,
      tokenReference: tokenRecord?.tokenReference,
      providerAccountIds,
      consentScopes: tokenRecord?.scopes,
    },
    dependencies: {
      upsertAccount: (account) => upsertServiceAccount(userId, account),
      upsertTransaction: async (transaction) => {
        const saved = await upsertServiceTransaction(userId, transaction);

        if (!existingTransactionIds.has(saved.id)) {
          newTransactions.push(saved);
        }

        return saved;
      },
      recordProviderSyncEvent: (event) => recordServiceProviderSyncEvent(userId, event),
      updateBankConnectionStatus: (updatedConnection) =>
        updateServiceBankConnectionStatus(userId, updatedConnection),
    },
    syncTrigger,
  });

  for (const event of result.auditEvents) {
    await recordServiceAuditEvent(event);
  }

  if (createNotifications) {
    const meaningfulSuccess =
      result.status === "success" &&
      (result.accountsUpserted > 0 || result.transactionsUpserted > 0);

    if (meaningfulSuccess || result.status === "failed") {
      await createServiceNotification(
        createProviderNotification({
          userId,
          connection: result.connection,
          type: result.status === "success" ? "sync_successful" : "account_sync_failure",
          title:
            result.status === "success"
              ? `${result.connection.institutionName} sync complete`
              : `${result.connection.institutionName} sync failed`,
          body: result.safeMessage,
          severity: result.status === "success" ? "info" : "urgent",
        }),
      );
    }

    if (result.status === "success" && newTransactions.length > 0) {
      const now = new Date().toISOString();
      const allTransactions = [...(snapshotBefore?.transactions ?? []), ...newTransactions];
      const duplicateTransactionIds = new Set(
        findPotentialDuplicatePayments(allTransactions).map(({ duplicate }) => duplicate.id),
      );

      await Promise.all(
        newTransactions.flatMap((transaction) => {
          const notifications = [
            createTransactionChangeNotification({
              userId,
              transaction,
              changeType: "new",
              now,
            }),
          ];

          if (isLargeTransaction(transaction)) {
            notifications.push(
              createTransactionChangeNotification({
                userId,
                transaction,
                changeType: "large",
                now,
              }),
            );
          }

          if (duplicateTransactionIds.has(transaction.id)) {
            notifications.push(
              createTransactionChangeNotification({
                userId,
                transaction,
                changeType: "duplicate",
                now,
              }),
            );
          }

          return notifications.map((notification) => createServiceNotification(notification));
        }),
      );
    }
  }

  return result;
}
