import "server-only";

import type { BankConnection } from "@/lib/domain";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { syncBankConnection, type SyncWorkflowResult } from "@/lib/bank-providers/sync-workflow";
import { getProviderToken } from "@/lib/bank-providers/token-store";
import {
  createServiceNotification,
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
}: {
  userId: string;
  connection: BankConnection;
  accountIds?: string[];
  createNotifications?: boolean;
}): Promise<SyncWorkflowResult> {
  const tokenRecord =
    connection.provider === "mock" ? null : await getProviderToken(userId, connection.id);
  const providerAccountIds = accountIds.length > 0 ? accountIds : undefined;
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
      upsertTransaction: (transaction) => upsertServiceTransaction(userId, transaction),
      recordProviderSyncEvent: (event) => recordServiceProviderSyncEvent(userId, event),
      updateBankConnectionStatus: (updatedConnection) =>
        updateServiceBankConnectionStatus(userId, updatedConnection),
    },
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
  }

  return result;
}
