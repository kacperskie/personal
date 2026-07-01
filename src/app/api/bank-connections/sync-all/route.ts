import { NextResponse } from "next/server";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { isLiveTrueLayerMode, isSandboxConnection } from "@/lib/bank-providers/sandbox-data";
import { syncBankConnection } from "@/lib/bank-providers/sync-workflow";
import { getProviderTokenForSync } from "@/lib/bank-providers/token-store";
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
    connection.status !== "archived" &&
    connection.status !== "disconnected" &&
    connection.consentStatus !== "revoked" &&
    connection.consentStatus !== "expired" &&
    connection.consentStatus === "active"
  );
}

function isSyncAllEligibleConnection(connection: BankConnection) {
  if (!isRefreshableConnection(connection)) {
    return false;
  }

  if (!isLiveTrueLayerMode()) {
    return true;
  }

  return connection.provider === "truelayer" && !isSandboxConnection(connection);
}

export async function POST() {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const allConnections = await getBankConnections();
  const connections = allConnections.filter(isSyncAllEligibleConnection);
  let succeeded = 0;
  let failed = 0;
  let skipped = allConnections.length - connections.length;
  let attempted = 0;

  for (const connection of connections) {
    const tokenPreflight =
      connection.provider === "mock"
        ? null
        : await getProviderTokenForSync(auth.user.id, connection.id);

    if (tokenPreflight && !tokenPreflight.ok) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    const tokenRecord = tokenPreflight?.ok ? tokenPreflight.record : null;
    const result = await syncBankConnection({
      userId: auth.user.id,
      connection,
      provider: getProviderAdapter(connection.provider),
      providerContext: {
        providerUserId: tokenRecord?.providerUserId,
        providerConnectionId: tokenRecord?.providerConnectionId,
        tokenReference: tokenRecord?.tokenReference,
        consentScopes: tokenRecord?.scopes,
      },
      dependencies: {
        upsertAccount,
        upsertTransaction,
        recordProviderSyncEvent,
        updateBankConnectionStatus,
      },
      syncTrigger: "sync_all",
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
    refreshed: attempted,
    attempted,
    succeeded,
    failed,
    skipped,
    message:
      connections.length === 0
        ? "No active connections need refreshing."
        : failed > 0
          ? "Some connections could not be refreshed."
          : "All active connections refreshed.",
  });
}
