import { NextResponse } from "next/server";
import { revokeProviderToken } from "@/lib/bank-providers/token-store";
import { createSafeErrorPayload, ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  getBankConnectionById,
  recordAuditEvent,
  updateBankConnectionStatus,
} from "@/lib/repositories/finance-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

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
      "provider_revoke_failed",
      "The requested connection could not be found.",
      404,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_revoke_failed"), {
      status: error.status,
    });
  }

  if (connection.status === "connected" || connection.status === "syncing") {
    const error = new ProviderSafeError(
      "provider_revoke_failed",
      "Disconnect or reconnect this active connection before archiving it.",
      409,
    );
    return NextResponse.json(
      {
        ...createSafeErrorPayload(error, "provider_revoke_failed"),
        reason: "active_connection_not_archivable",
      },
      { status: error.status },
    );
  }

  if (connection.provider !== "mock") {
    await revokeProviderToken(auth.user.id, connection.id);
  }

  const archivedAt = new Date().toISOString();
  const saved = await updateBankConnectionStatus(
    {
      ...connection,
      status: "archived",
      consentStatus:
        connection.consentStatus === "active" ? "revoked" : connection.consentStatus,
      errorMessage: null,
      updatedAt: archivedAt,
    },
    "bank_connection_revoked",
  );
  await recordAuditEvent({
    userId: auth.user.id,
    eventType: "bank_connection_revoked",
    entity: "bank_connections",
    entityId: connection.id,
    metadata: {
      cleanup: "archive_connection_keep_history",
      provider: connection.provider,
    },
  });

  return NextResponse.json({
    connectionId: saved.id,
    status: saved.status,
    message: "Connection record hidden. Linked accounts and transactions were kept.",
  });
}
