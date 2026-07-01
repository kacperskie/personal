"use client";

import { useMemo, useState, useTransition } from "react";
import { Cable, RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { BankConnection, BankProvider, ConnectionLifecycleStatus } from "@/lib/domain";
import type {
  MoneyhubSandboxReadiness,
  ProviderComparisonCapability,
  TrueLayerSandboxReadiness,
} from "@/lib/bank-providers/provider-config";
import type { ProviderTokenDiagnostics } from "@/lib/bank-providers/token-store";
import { formatDateShort } from "@/lib/format";
import { getConnectionLifecycleStatus } from "@/lib/finance";

const statusTone: Record<ConnectionLifecycleStatus, "good" | "neutral" | "warning" | "risk"> = {
  not_connected: "neutral",
  connecting: "neutral",
  connected: "good",
  needs_reconsent: "warning",
  syncing: "neutral",
  sync_failed: "risk",
  disconnected: "neutral",
};

const providerOptions: Array<{ value: BankProvider; label: string }> = [
  { value: "moneyhub", label: "Moneyhub sandbox" },
  { value: "truelayer", label: "TrueLayer sandbox" },
  { value: "mock", label: "Mock provider" },
];

const targetInstitutions = ["American Express", "Nationwide", "Revolut"];

function labelStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function isDeadPreConsentConnection(connection: BankConnection) {
  const disconnectedOrRevoked =
    connection.status === "disconnected" || connection.consentStatus === "revoked";

  return disconnectedOrRevoked && !connection.lastSyncedAt && !connection.consentCompletedAt;
}

function isSyncDisabled(connection: BankConnection, isPending: boolean, isSyncingConnection: boolean) {
  return (
    isPending ||
    isSyncingConnection ||
    connection.status === "disconnected" ||
    connection.consentStatus === "revoked"
  );
}

function needsReconnect(diagnostics?: ProviderTokenDiagnostics) {
  return diagnostics ? diagnostics.syncEligible !== "yes" : false;
}

export function ConnectedAccountsManager({
  connections,
  tokenDiagnostics = {},
  providerState,
}: {
  connections: BankConnection[];
  tokenDiagnostics?: Record<string, ProviderTokenDiagnostics>;
  providerState: {
    provider: BankProvider;
    configured: boolean;
    safeMessage: string;
    moneyhubReadiness?: MoneyhubSandboxReadiness;
    truelayerReadiness?: TrueLayerSandboxReadiness;
    providerComparison?: ProviderComparisonCapability[];
  };
}) {
  const [selectedProvider, setSelectedProvider] = useState<BankProvider>(
    providerState.provider === "mock" ? "moneyhub" : providerState.provider,
  );
  const [message, setMessage] = useState<string | null>(providerState.safeMessage);
  const [syncingConnectionIds, setSyncingConnectionIds] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const connectionsWithDisplayStatus = useMemo(
    () =>
      connections
        .filter((connection) => !isDeadPreConsentConnection(connection))
        .map((connection) => ({
          ...connection,
          tokenDiagnostics: tokenDiagnostics[connection.id],
          displayStatus: getConnectionLifecycleStatus(connection, asOfDate),
        })),
    [connections, asOfDate, tokenDiagnostics],
  );
  const hiddenFailedConsentAttempts = useMemo(
    () => connections.filter(isDeadPreConsentConnection).length,
    [connections],
  );

  async function postJson(url: string, body?: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Provider request failed.");
    }

    return payload;
  }

  function startConnection() {
    setMessage(null);
    startTransition(() => {
      void postJson("/api/bank-connections/start", {
        provider: selectedProvider,
        institutionId:
          selectedProvider === "moneyhub"
            ? "moneyhub_sandbox"
            : selectedProvider === "truelayer"
              ? "truelayer_sandbox"
              : "mock_sandbox",
        institutionName:
          selectedProvider === "moneyhub"
            ? "Moneyhub sandbox"
            : selectedProvider === "truelayer"
              ? "TrueLayer sandbox"
              : "Mock sandbox",
      })
        .then((payload) => {
          if (payload.authorizationUrl) {
            window.location.href = payload.authorizationUrl;
            return;
          }

          setMessage(payload.message ?? "Connection request created.");
        })
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function syncConnection(connectionId: string) {
    setMessage(null);
    setSyncingConnectionIds((current) => Array.from(new Set([...current, connectionId])));
    startTransition(() => {
      void postJson(`/api/bank-connections/${connectionId}/sync`)
        .then((payload) => setMessage(payload.message ?? "Sync completed."))
        .catch((error: Error) => setMessage(error.message))
        .finally(() =>
          setSyncingConnectionIds((current) =>
            current.filter((candidate) => candidate !== connectionId),
          ),
        );
    });
  }

  function syncAllConnections() {
    setMessage(null);
    setIsSyncingAll(true);
    startTransition(() => {
      void postJson("/api/bank-connections/sync-all")
        .then((payload) => setMessage(payload.message ?? "Active connections refreshed."))
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setIsSyncingAll(false));
    });
  }

  function revokeConnection(connectionId: string) {
    setMessage(null);
    startTransition(() => {
      void postJson(`/api/bank-connections/${connectionId}/revoke`)
        .then((payload) => setMessage(payload.message ?? "Connection disconnected."))
        .catch((error: Error) => setMessage(error.message));
    });
  }

  return (
    <div className="space-y-6">
      {providerState.moneyhubReadiness ? (
        <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Moneyhub sandbox readiness</h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {providerState.moneyhubReadiness.safeMessage}
              </p>
            </div>
            <StatusPill
              label={
                providerState.moneyhubReadiness.configured
                  ? "configured"
                  : "not configured"
              }
              tone={providerState.moneyhubReadiness.configured ? "good" : "warning"}
            />
          </div>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Provider selected</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.moneyhubReadiness.providerSelected ? "Moneyhub" : "Mock/other"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Sandbox mode</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.moneyhubReadiness.sandboxModeEnabled ? "Enabled" : "Not enabled"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Supabase</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.moneyhubReadiness.supabaseConfigured ? "Configured" : "Mock fallback"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Token store</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.moneyhubReadiness.tokenStoreAvailable
                  ? "Server-only stub"
                  : "Unavailable"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
              <p className="font-semibold text-ink">Expected redirect URI</p>
              <p className="mt-1 break-all">
                {providerState.moneyhubReadiness.redirectUri ?? "Not configured"}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
              <p className="font-semibold text-ink">Missing environment variables</p>
              <p className="mt-1">
                {providerState.moneyhubReadiness.missingEnvironment.length > 0
                  ? providerState.moneyhubReadiness.missingEnvironment.join(", ")
                  : "None required for sandbox client initialisation are missing."}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {providerState.truelayerReadiness ? (
        <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">TrueLayer sandbox readiness</h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {providerState.truelayerReadiness.safeMessage}
              </p>
            </div>
            <StatusPill
              label={
                providerState.truelayerReadiness.configured
                  ? "configured"
                  : "not configured"
              }
              tone={providerState.truelayerReadiness.configured ? "good" : "warning"}
            />
          </div>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Provider selected</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.providerSelected ? "TrueLayer" : "Mock/other"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Sandbox mode</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.sandboxModeEnabled ? "Enabled" : "Not enabled"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Token encryption</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.tokenEncryptionConfigured
                  ? "Configured"
                  : "Missing"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Token store</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.tokenStoreAvailable
                  ? "Encrypted server-side"
                  : "Unavailable"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
              <p className="font-semibold text-ink">Expected redirect URI</p>
              <p className="mt-1 break-all">
                {providerState.truelayerReadiness.redirectUri ?? "Not configured"}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
              <p className="font-semibold text-ink">Missing environment variables</p>
              <p className="mt-1">
                {providerState.truelayerReadiness.missingEnvironment.length > 0
                  ? providerState.truelayerReadiness.missingEnvironment.join(", ")
                  : "None required for sandbox client initialisation are missing."}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {providerState.providerComparison ? (
        <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div>
            <h2 className="text-lg font-semibold text-ink">Provider comparison</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Capability rows show sandbox adapter readiness only. American Express,
              Nationwide, and Revolut remain target institutions to validate with provider
              sandbox credentials.
            </p>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {providerState.providerComparison.map((provider) => (
              <article key={provider.provider} className="rounded-lg border border-line bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-ink">{provider.label}</h3>
                  <StatusPill
                    label={provider.sandboxReady ? "sandbox ready" : "needs setup"}
                    tone={provider.sandboxReady ? "good" : "warning"}
                  />
                </div>
                <dl className="mt-4 grid gap-2 text-sm text-ink/70">
                  <div className="flex justify-between gap-3">
                    <dt>Accounts</dt>
                    <dd className="font-semibold text-ink">{provider.accountsSupport}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Balances</dt>
                    <dd className="font-semibold text-ink">{provider.balancesSupport}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Transactions</dt>
                    <dd className="font-semibold text-ink">{provider.transactionsSupport}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Credit cards</dt>
                    <dd className="font-semibold text-ink">{provider.creditCardsSupport}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Regular payments</dt>
                    <dd className="font-semibold text-ink">{provider.regularPaymentsSupport}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Webhooks</dt>
                    <dd className="font-semibold text-ink">{provider.webhookSupport}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {provider.targetInstitutions.map((institution) => (
                    <span
                      key={`${provider.provider}-${institution}`}
                      className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/65"
                    >
                      Validate: {institution}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,auto)] lg:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Cable className="h-5 w-5 text-teal" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Start sandbox connection</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Provider-specific work stays behind the adapter. TrueLayer is the read-only
              banking data path, and mock remains available for local fallback when selected.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {targetInstitutions.map((institution) => (
                <span
                  key={institution}
                  className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink/70"
                >
                  Target test: {institution}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <label className="text-sm text-ink/70">
              Provider
              <select
                value={selectedProvider}
                onChange={(event) => setSelectedProvider(event.target.value as BankProvider)}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
              >
                {providerOptions.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={startConnection}
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Cable className="h-4 w-4" aria-hidden="true" />
              Start connection
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
            <ShieldAlert className="h-5 w-5 shrink-0 text-saffron" aria-hidden="true" />
            <p>{message}</p>
          </div>
        ) : null}

        {hiddenFailedConsentAttempts > 0 ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-saffron/30 bg-saffron/10 p-4 text-sm text-ink/75">
            <ShieldAlert className="h-5 w-5 shrink-0 text-saffron" aria-hidden="true" />
            <p>
              One or more previous consent attempts did not complete, so dead pending records are
              hidden from the provider list.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">After first sync</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Review account purposes on the Accounts page so safe-to-spend, cashflow, net worth,
          and savings-goal links use the right accounts.
        </p>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="font-semibold text-ink">American Express</p>
            <p className="mt-1 text-ink/60">Suggested as credit card, excluded from safe-to-spend.</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="font-semibold text-ink">Nationwide</p>
            <p className="mt-1 text-ink/60">Current, bills, savings, and credit-card roles need review.</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="font-semibold text-ink">Revolut</p>
            <p className="mt-1 text-ink/60">Everyday accounts and vault-like balances are suggested separately.</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Provider connections</h2>
            <p className="text-sm text-ink/60">
              Status, consent, manual sync, and disconnect controls use provider-agnostic routes.
            </p>
          </div>
          <button
            type="button"
            onClick={syncAllConnections}
            disabled={isPending || isSyncingAll || connectionsWithDisplayStatus.length === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
          >
            <RefreshCw className={isSyncingAll ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            Sync all active
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {connectionsWithDisplayStatus.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No provider connections are available yet.
            </div>
          ) : null}

          {connectionsWithDisplayStatus.map((connection) => (
            <article key={connection.id} className="rounded-lg border border-line bg-paper p-4">
              {(() => {
                const isSyncingConnection = syncingConnectionIds.includes(connection.id);
                const reconnectRequired = needsReconnect(connection.tokenDiagnostics);
                const displayLabel = reconnectRequired
                  ? "Reconnect required"
                  : isSyncingConnection
                    ? "syncing"
                    : labelStatus(connection.displayStatus);

                return (
                  <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-ink">{connection.institutionName}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    Provider: {connection.provider} - Institution ID: {connection.institutionId}
                  </p>
                </div>
                <StatusPill
                  label={displayLabel}
                  tone={
                    reconnectRequired
                      ? "warning"
                      : isSyncingConnection
                        ? "neutral"
                        : statusTone[connection.displayStatus]
                  }
                />
              </div>
              {reconnectRequired ? (
                <div className="mt-4 rounded-lg border border-saffron/30 bg-saffron/10 p-3 text-sm text-ink/75">
                  Reconnect required before this bank connection can sync.
                </div>
              ) : null}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink/50">Consent</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {labelStatus(connection.consentStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Last successful sync</dt>
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
                  <dt className="text-ink/50">Last failed sync</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.status === "sync_failed"
                      ? formatDateShort(connection.updatedAt.slice(0, 10))
                      : "No failed sync"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Last sync result</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.errorMessage ?? "No provider-safe error"}
                  </dd>
                </div>
                {connection.tokenDiagnostics ? (
                  <>
                    <div>
                      <dt className="text-ink/50">Token record present</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {connection.tokenDiagnostics.tokenRecordPresent ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink/50">Token decryptable</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {connection.tokenDiagnostics.tokenDecryptable}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink/50">Token linked</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {connection.tokenDiagnostics.tokenLinkedToConnection}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink/50">Sync eligible</dt>
                      <dd className="mt-1 font-semibold text-ink">
                        {connection.tokenDiagnostics.syncEligible}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => syncConnection(connection.id)}
                  disabled={
                    reconnectRequired ||
                    isSyncDisabled(connection, isPending, isSyncingConnection)
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <RefreshCw className={isSyncingConnection ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                  {isSyncingConnection ? "Syncing" : "Sync"}
                </button>
                <button
                  type="button"
                  onClick={() => revokeConnection(connection.id)}
                  disabled={isPending || connection.status === "disconnected"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-berry disabled:opacity-50"
                >
                  <Unplug className="h-4 w-4" aria-hidden="true" />
                  Disconnect
                </button>
              </div>
                  </>
                );
              })()}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
