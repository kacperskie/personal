import { NextResponse } from "next/server";
import {
  deleteProviderTokenForConnection,
  getProviderTokenDiagnostics,
  type ProviderTokenDiagnostics,
} from "@/lib/bank-providers/token-store";
import { createSafeErrorPayload, ProviderSafeError } from "@/lib/bank-providers/provider-errors";
import {
  deleteBankConnection,
  getAccounts,
  getBankConnectionById,
  getTransactions,
  recordAuditEvent,
} from "@/lib/repositories/finance-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";
import type { BankConnection } from "@/lib/domain";

export const runtime = "nodejs";

function connectionMode(connection: BankConnection): "sandbox" | "live" {
  if (connection.mode) {
    return connection.mode;
  }
  return /live/i.test(connection.institutionId) ? "live" : "sandbox";
}

function tokenRejectedOrRevoked(
  connection: BankConnection,
  diagnostics: ProviderTokenDiagnostics | null,
) {
  return (
    connection.lastFailureReason === "truelayer_token_rejected" ||
    connection.consentStatus === "revoked" ||
    connection.status === "disconnected" ||
    diagnostics?.reasonCode === "token_record_missing" ||
    diagnostics?.syncEligible === "no"
  );
}

function canRemoveFailedAttempt(input: {
  connection: BankConnection;
  linkedAccountCount: number;
  linkedTransactionCount: number;
  diagnostics: ProviderTokenDiagnostics | null;
}) {
  return (
    connectionMode(input.connection) === "live" &&
    !input.connection.lastSyncedAt &&
    input.linkedAccountCount === 0 &&
    input.linkedTransactionCount === 0 &&
    (input.connection.status === "sync_failed" ||
      input.connection.status === "disconnected" ||
      input.connection.consentStatus === "revoked") &&
    tokenRejectedOrRevoked(input.connection, input.diagnostics)
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

  const [accounts, transactions, diagnostics] = await Promise.all([
    getAccounts(),
    getTransactions(),
    connection.provider === "mock"
      ? Promise.resolve(null)
      : getProviderTokenDiagnostics(auth.user.id, connection.id),
  ]);
  const linkedAccountIds = new Set(
    accounts
      .filter((account) => account.providerConnectionId === connection.id)
      .map((account) => account.id),
  );
  const linkedTransactionCount = transactions.filter((transaction) =>
    linkedAccountIds.has(transaction.accountId),
  ).length;
  const linkedAccountCount = linkedAccountIds.size;

  if (
    !canRemoveFailedAttempt({
      connection,
      linkedAccountCount,
      linkedTransactionCount,
      diagnostics,
    })
  ) {
    const error = new ProviderSafeError(
      "provider_revoke_failed",
      "This connection is not a removable failed live attempt.",
      409,
    );
    return NextResponse.json(
      {
        ...createSafeErrorPayload(error, "provider_revoke_failed"),
        reason: "not_removable_failed_attempt",
      },
      { status: error.status },
    );
  }

  await deleteProviderTokenForConnection(auth.user.id, connection.id);
  await deleteBankConnection(connection.id);
  await recordAuditEvent({
    userId: auth.user.id,
    eventType: "bank_connection_revoked",
    entity: "bank_connections",
    entityId: connection.id,
    metadata: {
      cleanup: "failed_live_connection_attempt",
      provider: connection.provider,
      linkedAccountCount,
      linkedTransactionCount,
    },
  });

  return NextResponse.json({
    connectionId: connection.id,
    status: "removed",
    message: "Failed connection attempt removed.",
  });
}
