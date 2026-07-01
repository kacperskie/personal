import { NextResponse } from "next/server";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createSafeErrorPayload, ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { syncBankConnection } from "@/lib/bank-providers/sync-workflow";
import {
  getProviderTokenForSync,
  type ProviderTokenSyncReason,
} from "@/lib/bank-providers/token-store";
import { logServerEvent } from "@/lib/observability/server-logger";
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

type SyncReasonCode =
  | "sync_start"
  | "connection_not_found"
  | "connection_not_connected"
  | ProviderTokenSyncReason
  | "truelayer_fetch_start"
  | "truelayer_accounts_fetch_failed"
  | "truelayer_balances_fetch_failed"
  | "truelayer_transactions_fetch_failed"
  | "sync_success";

function logSyncReason(input: {
  level?: "info" | "warn" | "error";
  reason: SyncReasonCode;
  userId: string;
  connectionId: string;
  provider?: string | null;
}) {
  return logServerEvent({
    level: input.level ?? "info",
    event: "provider_sync_event",
    message: "Bank connection sync status.",
    metadata: {
      reason: input.reason,
      userId: input.userId,
      connectionId: input.connectionId,
      provider: input.provider ?? null,
    },
  });
}

function nonSyncableConnection(connection: { provider: string; status: string; consentStatus: string }) {
  return (
    connection.provider !== "mock" &&
    (connection.status === "disconnected" ||
      connection.consentStatus === "revoked" ||
      connection.consentStatus === "expired" ||
      connection.consentStatus !== "active")
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const { connectionId } = await context.params;
  logSyncReason({
    reason: "sync_start",
    userId: auth.user.id,
    connectionId,
  });
  const connection = await getBankConnectionById(connectionId);

  if (!connection) {
    logSyncReason({
      level: "warn",
      reason: "connection_not_found",
      userId: auth.user.id,
      connectionId,
    });
    const error = new ProviderSafeError(
      "provider_sync_failed",
      "The requested connection could not be found.",
      404,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_sync_failed"), {
      status: error.status,
    });
  }

  if (nonSyncableConnection(connection)) {
    logSyncReason({
      level: "warn",
      reason: "connection_not_connected",
      userId: auth.user.id,
      connectionId: connection.id,
      provider: connection.provider,
    });
    const error = new ProviderSafeError(
      "provider_sync_failed",
      "Reconnect required before this bank connection can sync.",
      409,
    );

    return NextResponse.json(
      {
        ...createSafeErrorPayload(error, "provider_sync_failed"),
        reason: "connection_not_connected",
      },
      { status: error.status },
    );
  }

  const tokenPreflight =
    connection.provider === "mock"
      ? null
      : await getProviderTokenForSync(auth.user.id, connection.id);

  if (tokenPreflight && !tokenPreflight.ok) {
    logSyncReason({
      level: "warn",
      reason: tokenPreflight.reason,
      userId: auth.user.id,
      connectionId: connection.id,
      provider: connection.provider,
    });

    const error = new ProviderSafeError(
      "provider_sync_failed",
      tokenPreflight.message,
      tokenPreflight.status,
    );

    return NextResponse.json(
      {
        ...createSafeErrorPayload(error, "provider_sync_failed"),
        reason: tokenPreflight.reason,
      },
      { status: error.status },
    );
  }

  if (connection.provider === "truelayer") {
    logSyncReason({
      reason: "truelayer_fetch_start",
      userId: auth.user.id,
      connectionId: connection.id,
      provider: connection.provider,
    });
  }

  const tokenRecord = tokenPreflight?.ok ? tokenPreflight.record : null;
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
    logSyncReason({
      reason: "sync_success",
      userId: auth.user.id,
      connectionId: result.connection.id,
      provider: result.connection.provider,
    });
  } else if (connection.provider === "truelayer") {
    logSyncReason({
      level: "warn",
      reason: "truelayer_accounts_fetch_failed",
      userId: auth.user.id,
      connectionId: result.connection.id,
      provider: result.connection.provider,
    });
  }

  return NextResponse.json({
    status: result.status,
    connectionId: result.connection.id,
    accountsUpserted: result.accountsUpserted,
    transactionsUpserted: result.transactionsUpserted,
    message: result.safeMessage,
  });
}
