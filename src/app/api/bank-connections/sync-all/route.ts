import { NextResponse } from "next/server";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { syncBankConnection } from "@/lib/bank-providers/sync-workflow";
import { getProviderToken } from "@/lib/bank-providers/token-store";
import type { BankConnection } from "@/lib/domain";
import {
  getBankConnections,
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

function isRefreshableConnection(connection: BankConnection) {
  return (
    connection.status !== "disconnected" &&
    connection.consentStatus !== "revoked" &&
    connection.consentStatus !== "expired"
  );
}

export async function POST() {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const connections = (await getBankConnections()).filter(isRefreshableConnection);
  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    const tokenRecord =
      connection.provider === "mock"
        ? null
        : await getProviderToken(auth.user.id, connection.id);
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

    if (result.status === "success") {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    status: failed > 0 ? "partial" : "success",
    refreshed: connections.length,
    succeeded,
    failed,
    message:
      connections.length === 0
        ? "No active connections need refreshing."
        : failed > 0
          ? "Some connections could not be refreshed."
          : "All active connections refreshed.",
  });
}
