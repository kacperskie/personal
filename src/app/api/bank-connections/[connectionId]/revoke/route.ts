import { NextResponse } from "next/server";
import { getProviderToken, revokeProviderToken } from "@/lib/bank-providers/token-store";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import {
  createSafeErrorPayload,
  ProviderSafeError,
  toProviderSafeError,
} from "@/lib/bank-providers/provider-errors";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import {
  getBankConnectionById,
  recordAuditEvent,
  updateBankConnectionStatus,
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
      "provider_revoke_failed",
      "The requested connection could not be found.",
      404,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_revoke_failed"), {
      status: error.status,
    });
  }

  try {
    const provider = getProviderAdapter(connection.provider);
    const tokenRecord =
      connection.provider === "mock"
        ? null
        : await getProviderToken(auth.user.id, connection.id);
    await provider.revokeConnection(connection.id, {
      providerUserId: tokenRecord?.providerUserId,
      providerConnectionId: tokenRecord?.providerConnectionId,
      tokenReference: tokenRecord?.tokenReference,
    });
    await revokeProviderToken(auth.user.id, connection.id);
    const revokedAt = new Date().toISOString();
    const saved = await updateBankConnectionStatus(
      {
        ...connection,
        status: "disconnected",
        consentStatus: "revoked",
        consentExpiresAt: null,
        errorMessage: null,
        updatedAt: revokedAt,
      },
      "bank_connection_revoked",
    );
    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_revoked",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: { provider: connection.provider },
    });
    await createNotification(
      createProviderNotification({
        userId: auth.user.id,
        connection: saved,
        type: "connection_revoked",
        title: `${saved.institutionName} disconnected`,
        body: "The provider connection has been disconnected.",
        severity: "warning",
      }),
    );

    return NextResponse.json({
      connectionId: saved.id,
      status: saved.status,
      consentStatus: saved.consentStatus,
      message: "Connection disconnected.",
    });
  } catch (error) {
    const safeError = toProviderSafeError(error, "provider_revoke_failed");

    return NextResponse.json(createSafeErrorPayload(safeError, "provider_revoke_failed"), {
      status: safeError.status,
    });
  }
}
