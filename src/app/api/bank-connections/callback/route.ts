import { NextResponse } from "next/server";
import type { BankConnection, BankProvider } from "@/lib/domain";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createSafeErrorPayload, toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { getOpenBankingProvider } from "@/lib/bank-providers/provider-config";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import {
  getBankConnectionById,
  recordAuditEvent,
  updateBankConnectionStatus,
  upsertBankConnection,
} from "@/lib/repositories/finance-repository";
import { createNotification } from "@/lib/repositories/notification-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

function preferExistingIdentity(
  existing: BankConnection,
  incoming: BankConnection,
): BankConnection {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    userId: existing.userId ?? incoming.userId,
    institutionName: existing.institutionName || incoming.institutionName,
    institutionId: existing.institutionId || incoming.institutionId,
    providerName: existing.providerName ?? incoming.providerName ?? null,
    providerId: existing.providerId ?? incoming.providerId ?? null,
    displayName: existing.displayName ?? incoming.displayName ?? null,
    createdAt: existing.createdAt,
    lastSyncedAt: existing.lastSyncedAt,
    accountsSyncedCount: existing.accountsSyncedCount,
    cardsSyncedCount: existing.cardsSyncedCount,
    lastFailedSyncAt: null,
    lastFailedEndpoint: null,
    lastFailedStatus: null,
    lastFailureReason: null,
    errorMessage: null,
    status: "connected",
    consentStatus: "active",
  };
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const url = new URL(request.url);
  const providerName = (url.searchParams.get("provider") ?? getOpenBankingProvider()) as BankProvider;

  try {
    const provider = getProviderAdapter(providerName);
    const result = await provider.handleCallback({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      error: url.searchParams.get("error"),
      userId: auth.user.id,
    });

    const savedConnection = result.reconnectConnectionId
      ? await (async () => {
          const existing = await getBankConnectionById(result.reconnectConnectionId!);

          if (!existing) {
            return upsertBankConnection(result.connection);
          }

          return updateBankConnectionStatus(
            preferExistingIdentity(existing, result.connection),
            "bank_connection_status_changed",
          );
        })()
      : await upsertBankConnection(result.connection);
    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_callback_handled",
      entity: "bank_connections",
      entityId: savedConnection.id,
      metadata: { provider: providerName, reconnect: Boolean(result.reconnectConnectionId) },
    });
    await createNotification(
      createProviderNotification({
        userId: auth.user.id,
        connection: savedConnection,
        type: "connection_successful",
        title: `${savedConnection.institutionName} connected`,
        body: "The connection completed successfully.",
        severity: "info",
      }),
    );

    return NextResponse.redirect(
      new URL("/settings/connected-accounts?connection=connected", url.origin),
    );
  } catch (error) {
    const safeError = toProviderSafeError(error, "provider_callback_failed");

    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_callback_failed",
      entity: "bank_connections",
      entityId: url.searchParams.get("state") ?? "unknown",
      metadata: {
        provider: providerName,
        code: safeError.code,
      },
    });

    const redirectUrl = new URL("/settings/connected-accounts", url.origin);
    redirectUrl.searchParams.set("connection", "callback_failed");
    redirectUrl.searchParams.set("reason", safeError.code);

    if (request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json(createSafeErrorPayload(safeError, "provider_callback_failed"), {
        status: safeError.status,
      });
    }

    return NextResponse.redirect(redirectUrl);
  }
}
