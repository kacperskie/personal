import { NextResponse } from "next/server";
import type { BankProvider } from "@/lib/domain";
import { getProviderAdapter } from "@/lib/bank-providers/provider-service";
import { createSafeErrorPayload, toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { recordAuditEvent, upsertBankConnection } from "@/lib/repositories/finance-repository";
import { createNotification } from "@/lib/repositories/notification-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const providerName = String(body.provider ?? "moneyhub") as BankProvider;
    const institutionId = String(body.institutionId ?? "moneyhub_sandbox");
    const institutionName = String(body.institutionName ?? "Moneyhub sandbox");
    const provider = getProviderAdapter(providerName);
    const start = await provider.createConnection({
      userId: auth.user.id,
      institutionId,
      institutionName,
    });

    await upsertBankConnection(start.connection);
    await recordAuditEvent({
      userId: auth.user.id,
      eventType: "bank_connection_start_requested",
      entity: "bank_connections",
      entityId: start.connection.id,
      metadata: {
        provider: providerName,
        providerConfigured: start.providerConfigured,
      },
    });

    if (start.providerConfigured) {
      await createNotification(
        createProviderNotification({
          userId: auth.user.id,
          connection: start.connection,
          type: "connection_successful",
          title: `${start.connection.institutionName} connection started`,
          body: "The sandbox consent flow has been started.",
          severity: "info",
        }),
      );
    }

    return NextResponse.json({
      connectionId: start.connection.id,
      provider: start.connection.provider,
      status: start.connection.status,
      authorizationUrl: start.authorizationUrl,
      providerConfigured: start.providerConfigured,
      message: start.safeMessage,
    });
  } catch (error) {
    const safeError = toProviderSafeError(error, "provider_not_configured");

    return NextResponse.json(createSafeErrorPayload(safeError, "provider_not_configured"), {
      status: safeError.status,
    });
  }
}
