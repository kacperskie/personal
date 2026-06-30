import { NextResponse } from "next/server";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createSafeErrorPayload, ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { syncBankConnection } from "@/lib/bank-providers/sync-workflow";
import { getProviderToken } from "@/lib/bank-providers/token-store";
import {
  getBankConnectionById,
  recordAuditEvent,
  recordProviderSyncEvent,
  updateBankConnectionStatus,
  upsertAccount,
  upsertTransaction,
} from "@/lib/repositories/finance-repository";
import { createNotification } from "@/lib/repositories/notification-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const { connectionId } = await context.params;
  const connection = await getBankConnectionById(connectionId);

  if (!connection) {
    const error = new ProviderSafeError(
      "provider_sync_failed",
      "The requested connection could not be found.",
      404,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_sync_failed"), {
      status: error.status,
    });
  }

  const tokenRecord =
    connection.provider === "mock" ? null : await getProviderToken(auth.user.id, connection.id);
  const result = await syncBankConnection({
    userId: auth.user.id,
    connection,
    provider: getProviderAdapter(connection.provider),
    providerContext: {
      providerUserId: tokenRecord?.providerUserId,
      providerConnectionId: tokenRecord?.providerConnectionId,
      tokenReference: tokenRecord?.tokenReference,
    },
    dependencies: {
      upsertAccount,
      upsertTransaction,
      recordProviderSyncEvent,
      updateBankConnectionStatus,
    },
  });

  for (const event of result.auditEvents) {
    await recordAuditEvent(event);
  }

  await createNotification(
    createProviderNotification({
      userId: auth.user.id,
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

  return NextResponse.json({
    status: result.status,
    connectionId: result.connection.id,
    accountsUpserted: result.accountsUpserted,
    transactionsUpserted: result.transactionsUpserted,
    message: result.safeMessage,
  });
}
