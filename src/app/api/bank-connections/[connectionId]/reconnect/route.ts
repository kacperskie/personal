import { NextResponse } from "next/server";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createSafeErrorPayload, ProviderSafeError, toProviderSafeError } from "@/lib/bank-providers/provider-errors";
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
      "provider_auth_required",
      "The requested connection could not be found.",
      404,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_auth_required"), {
      status: error.status,
    });
  }

  if (connection.provider !== "truelayer") {
    const error = new ProviderSafeError(
      "provider_not_supported",
      "Reconnect is currently available for TrueLayer connections only.",
      400,
    );
    return NextResponse.json(createSafeErrorPayload(error, "provider_not_supported"), {
      status: error.status,
    });
  }

  try {
    const provider = getProviderAdapter(connection.provider);
    const start = await provider.createConnection({
      userId: auth.user.id,
      institutionId: connection.institutionId,
      institutionName: connection.institutionName,
      reconnectConnectionId: connection.id,
      existingConnection: connection,
    });
    const saved = await updateBankConnectionStatus(
      {
        ...connection,
        ...start.connection,
        id: connection.id,
        createdAt: connection.createdAt,
        lastSyncedAt: connection.lastSyncedAt,
        accountsSyncedCount: connection.accountsSyncedCount,
        cardsSyncedCount: connection.cardsSyncedCount,
        providerName: connection.providerName ?? start.connection.providerName ?? null,
        providerId: connection.providerId ?? start.connection.providerId ?? null,
        displayName: connection.displayName ?? start.connection.displayName ?? null,
      },
      "bank_connection_status_changed",
    );

    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_start_requested",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        reconnect: true,
        providerConfigured: start.providerConfigured,
      },
    });

    if (start.providerConfigured) {
      await createNotification(
        createProviderNotification({
          userId: auth.user.id,
          connection: saved,
          type: "connection_successful",
          title: `${saved.institutionName} reconnect started`,
          body: "The consent flow has been started for this connection.",
          severity: "info",
        }),
      );
    }

    return NextResponse.json({
      connectionId: saved.id,
      provider: saved.provider,
      status: saved.status,
      authorizationUrl: start.authorizationUrl,
      providerConfigured: start.providerConfigured,
      state: start.state,
      message: start.safeMessage,
    });
  } catch (error) {
    const safeError = toProviderSafeError(error, "provider_auth_required");

    return NextResponse.json(createSafeErrorPayload(safeError, "provider_auth_required"), {
      status: safeError.status,
    });
  }
}
