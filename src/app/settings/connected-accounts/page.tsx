import { Cable, CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import type { ConnectionLifecycleStatus } from "@/lib/domain";
import { formatDateShort } from "@/lib/format";
import { getConnectionLifecycleStatus } from "@/lib/finance";
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
  const bankConnections = await getBankConnections();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const connectionsWithDisplayStatus = bankConnections.map((connection) => ({
    ...connection,
    displayStatus: getConnectionLifecycleStatus(connection, asOfDate),
  }));
  const connectedInstitutions = connectionsWithDisplayStatus.filter(
    (connection) =>
      connection.displayStatus === "connected" || connection.displayStatus === "syncing",
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
        description="Mock provider connections for American Express, Nationwide, and Revolut. Real API calls and token storage are not enabled."
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

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Provider connections</h2>
            <p className="text-sm text-ink/60">Sandbox placeholders use the mock adapter only.</p>
          </div>
          <Cable className="h-5 w-5 text-teal" aria-hidden="true" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {connectionsWithDisplayStatus.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No provider connections are available yet. Real connection setup remains disabled.
            </div>
          ) : null}

          {connectionsWithDisplayStatus.map((connection) => (
            <article key={connection.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-ink">{connection.institutionName}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    Provider: {connection.provider} - Institution ID: {connection.institutionId}
                  </p>
                </div>
                <StatusPill
                  label={labelStatus(connection.displayStatus)}
                  tone={statusTone[connection.displayStatus]}
                />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/50">Consent</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {labelStatus(connection.consentStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Last synced</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.lastSyncedAt
                      ? formatDateShort(connection.lastSyncedAt.slice(0, 10))
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Consent expires</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.consentExpiresAt
                      ? formatDateShort(connection.consentExpiresAt.slice(0, 10))
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Error</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.errorMessage ?? "None"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

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
