import { NextResponse } from "next/server";
import type { BankProvider } from "@/lib/domain";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createSafeErrorPayload, toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { getOpenBankingProvider } from "@/lib/bank-providers/provider-config";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { recordAuditEvent, upsertBankConnection } from "@/lib/repositories/finance-repository";
import { createNotification } from "@/lib/repositories/notification-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

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

    await upsertBankConnection(result.connection);
    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_callback_handled",
      entity: "bank_connections",
      entityId: result.connection.id,
      metadata: { provider: providerName },
    });
    await createNotification(
      createProviderNotification({
        userId: auth.user.id,
        connection: result.connection,
        type: "connection_successful",
        title: `${result.connection.institutionName} connected`,
        body: "The sandbox connection completed successfully.",
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
