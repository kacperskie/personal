import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { ConnectedAccountsManager } from "@/components/connected-accounts/connected-accounts-manager";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import type { ConnectionLifecycleStatus } from "@/lib/domain";
import { getConnectionLifecycleStatus } from "@/lib/finance";
import { getProviderConfiguredState } from "@/lib/bank-providers/provider-config";
import { getProviderTokenDiagnostics } from "@/lib/bank-providers/token-store";
import { getFirebaseSessionUser } from "@/lib/firebase/session";
import { getBankConnections } from "@/lib/repositories/finance-repository";

export const dynamic = "force-dynamic";

const statusTone: Record<ConnectionLifecycleStatus, "good" | "neutral" | "warning" | "risk"> = {
  not_connected: "neutral",
  connecting: "neutral",
  connected: "good",
  needs_reconsent: "warning",
  syncing: "neutral",
  sync_failed: "risk",
  disconnected: "neutral",
};

const connectionLifecycleStates: ConnectionLifecycleStatus[] = [
  "not_connected",
  "connecting",
  "connected",
  "needs_reconsent",
  "syncing",
  "sync_failed",
  "disconnected",
];

function labelStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ConnectedAccountsPage() {
  const [bankConnections, user] = await Promise.all([
    getBankConnections(),
    getFirebaseSessionUser(),
  ]);
  const tokenDiagnosticsEntries = user
    ? await Promise.all(
        bankConnections
          .filter((connection) => connection.provider !== "mock")
          .map(async (connection) => [
            connection.id,
            await getProviderTokenDiagnostics(user.uid, connection.id),
          ] as const),
      )
    : [];
  const tokenDiagnostics = Object.fromEntries(tokenDiagnosticsEntries);
  const providerState = getProviderConfiguredState();
  const truelayerMode = providerState.truelayerReadiness?.mode ?? "sandbox";
  const asOfDate = new Date().toISOString().slice(0, 10);
  const connectionsWithDisplayStatus = bankConnections.map((connection) => ({
    ...connection,
    tokenDiagnostics: tokenDiagnostics[connection.id],
    displayStatus: getConnectionLifecycleStatus(connection, asOfDate),
  }));
  const connectedInstitutions = connectionsWithDisplayStatus.filter(
    (connection) =>
      (connection.displayStatus === "connected" || connection.displayStatus === "syncing") &&
      connection.tokenDiagnostics?.syncEligible !== "no",
  ).length;
  const needsReconsent = connectionsWithDisplayStatus.filter(
    (connection) => connection.displayStatus === "needs_reconsent",
  ).length;
  const syncFailed = connectionsWithDisplayStatus.filter(
    (connection) => connection.displayStatus === "sync_failed",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Open Banking foundation"
        title="Connected Accounts"
        description={`Read-only TrueLayer ${truelayerMode} connections with provider-agnostic routes, mock fallback, and server-only encrypted token handling.`}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CheckCircle2 className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Active or syncing</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {connectedInstitutions}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CircleDashed className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Needs re-consent</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{needsReconsent}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CircleAlert className="h-5 w-5 text-berry" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Sync failed</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{syncFailed}</p>
        </div>
      </section>

      <ConnectedAccountsManager
        connections={bankConnections}
        tokenDiagnostics={tokenDiagnostics}
        providerState={providerState}
      />

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Connection lifecycle states</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {connectionLifecycleStates.map((status) => (
            <StatusPill key={status} label={labelStatus(status)} tone={statusTone[status]} />
          ))}
        </div>
      </section>
    </div>
  );
}
