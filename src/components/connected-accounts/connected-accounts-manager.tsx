"use client";

import { useMemo, useState, useTransition } from "react";
import { Cable, RefreshCw, ShieldAlert, Trash2, Unplug } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { BankConnection, BankProvider, ConnectionLifecycleStatus } from "@/lib/domain";
import type {
  MoneyhubSandboxReadiness,
  ProviderComparisonCapability,
  TrueLayerSandboxReadiness,
} from "@/lib/bank-providers/provider-config";
import type { ProviderTokenDiagnostics } from "@/lib/bank-providers/token-store";
import { isSandboxConnection } from "@/lib/bank-providers/sandbox-data";
import { formatDateShort } from "@/lib/format";
import { getConnectionLifecycleStatus } from "@/lib/finance";

type SandboxCleanupPreview = {
  connections: number;
  accounts: number;
  transactions: number;
  providerTokens: number;
  syncRuns: number;
};

export type ConnectionDisplaySummary = {
  connectionId: string;
  linkedAccountCount: number;
  linkedTransactionCount: number;
  linkedAccountNames: string[];
  linkedInstitutionNames: string[];
};

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

export function connectionMode(connection: BankConnection): "sandbox" | "live" {
  if (connection.mode) {
    return connection.mode;
  }
  return /live/i.test(connection.institutionId) ? "live" : "sandbox";
}

function isGenericConnectionName(value?: string | null) {
  return !value || /^truelayer (live|sandbox)$/i.test(value);
}

export function shortConnectionId(connectionId: string) {
  return connectionId.length > 8 ? connectionId.slice(-8) : connectionId;
}

function formatConnectionTimestamp(value: string | null | undefined) {
  if (!value) {
    return "unknown time";
  }
  const [date = "", time = ""] = value.split("T");
  const hhmm = time.slice(0, 5);
  return `${date ? formatDateShort(date) : "unknown date"}${hhmm ? ` ${hhmm}` : ""}`;
}

/**
 * Best available safe title for a connection so multiple live connections are
 * distinguishable (e.g. Nationwide, Revolut, American Express) instead of three
 * identical "TrueLayer live" cards.
 */
export function connectionDisplayTitle(
  connection: BankConnection,
  summary?: ConnectionDisplaySummary,
): string {
  const candidate = connection.providerName || connection.displayName || connection.institutionName;
  if (!isGenericConnectionName(candidate)) {
    return candidate;
  }
  const linkedInstitution = summary?.linkedInstitutionNames.find(
    (name) => !isGenericConnectionName(name),
  );
  if (linkedInstitution) {
    return linkedInstitution;
  }
  const linkedAccountName = summary?.linkedAccountNames.find(Boolean);
  if (linkedAccountName) {
    return linkedAccountName;
  }
  const created = connection.consentCompletedAt ?? connection.createdAt;
  return `TrueLayer ${connectionMode(connection)} connection created ${formatConnectionTimestamp(created)}`;
}

const cardAccessReasons = new Set([
  "truelayer_accounts_endpoint_not_supported",
]);

export function isDeadPreConsentConnection(connection: BankConnection) {
  const disconnectedOrRevoked =
    connection.status === "disconnected" || connection.consentStatus === "revoked";

  return disconnectedOrRevoked && !connection.lastSyncedAt && !connection.consentCompletedAt;
}

function hasLinkedSummary(summary?: ConnectionDisplaySummary) {
  return Boolean(
    summary &&
      (summary.linkedAccountCount > 0 ||
        summary.linkedTransactionCount > 0 ||
        summary.linkedAccountNames.length > 0 ||
        summary.linkedInstitutionNames.length > 0),
  );
}

function isSyncDisabled(connection: BankConnection, isPending: boolean, isSyncingConnection: boolean) {
  return (
    isPending ||
    isSyncingConnection ||
    connection.status === "disconnected" ||
    connection.consentStatus === "revoked"
  );
}

export function canRemoveFailedConnectionAttempt(
  connection: BankConnection,
  summary?: ConnectionDisplaySummary,
  diagnostics?: ProviderTokenDiagnostics,
) {
  const linkedAccountCount = summary?.linkedAccountCount ?? 0;
  const linkedTransactionCount = summary?.linkedTransactionCount ?? 0;
  const tokenRejectedOrRevoked =
    connection.lastFailureReason === "truelayer_token_rejected" ||
    connection.consentStatus === "revoked" ||
    connection.status === "disconnected" ||
    diagnostics?.reasonCode === "token_record_missing" ||
    diagnostics?.syncEligible === "no";

  return (
    connectionMode(connection) === "live" &&
    !connection.lastSyncedAt &&
    linkedAccountCount === 0 &&
    linkedTransactionCount === 0 &&
    (connection.status === "sync_failed" ||
      connection.status === "disconnected" ||
      connection.consentStatus === "revoked") &&
    tokenRejectedOrRevoked
  );
}

export function connectionRevokePath(connectionId: string) {
  return `/api/bank-connections/${connectionId}/revoke`;
}

export function connectionReconnectPath(connectionId: string) {
  return `/api/bank-connections/${connectionId}/reconnect`;
}

export function failedAttemptRemovalPath(connectionId: string) {
  return `/api/bank-connections/${connectionId}/failed-attempt`;
}

export function requiresReconnect(
  connection: BankConnection,
  diagnostics?: ProviderTokenDiagnostics,
) {
  return (
    connection.consentStatus === "revoked" ||
    connection.consentStatus === "expired" ||
    connection.lastFailureReason === "truelayer_token_rejected" ||
    diagnostics?.syncEligible === "no" ||
    diagnostics?.reasonCode === "token_record_missing" ||
    diagnostics?.reasonCode === "token_decrypt_failed" ||
    diagnostics?.reasonCode === "token_expired_refresh_missing" ||
    diagnostics?.reasonCode === "token_refresh_failed"
  );
}

export function ConnectedAccountsManager({
  connections,
  tokenDiagnostics = {},
  connectionSummaries = {},
  providerState,
  sandboxCleanupPreview,
}: {
  connections: BankConnection[];
  tokenDiagnostics?: Record<string, ProviderTokenDiagnostics>;
  connectionSummaries?: Record<string, ConnectionDisplaySummary>;
  providerState: {
    provider: BankProvider;
    configured: boolean;
    safeMessage: string;
    moneyhubReadiness?: MoneyhubSandboxReadiness;
    truelayerReadiness?: TrueLayerSandboxReadiness;
    providerComparison?: ProviderComparisonCapability[];
  };
  sandboxCleanupPreview?: SandboxCleanupPreview;
}) {
  const [selectedProvider, setSelectedProvider] = useState<BankProvider>(
    providerState.provider === "mock" ? "moneyhub" : providerState.provider,
  );
  const [message, setMessage] = useState<string | null>(providerState.safeMessage);
  const [syncingConnectionIds, setSyncingConnectionIds] = useState<string[]>([]);
  const [removingConnectionIds, setRemovingConnectionIds] = useState<string[]>([]);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isPending, startTransition] = useTransition();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const connectionsWithDisplayStatus = useMemo(
    () =>
      connections
        .filter(
          (connection) =>
            !isDeadPreConsentConnection(connection) ||
            hasLinkedSummary(connectionSummaries[connection.id]),
        )
        .map((connection) => ({
          ...connection,
          tokenDiagnostics: tokenDiagnostics[connection.id],
          summary: connectionSummaries[connection.id],
          displayStatus: getConnectionLifecycleStatus(connection, asOfDate),
        })),
    [connections, asOfDate, tokenDiagnostics, connectionSummaries],
  );
  const hiddenFailedConsentAttempts = useMemo(
    () =>
      connections.filter(
        (connection) =>
          isDeadPreConsentConnection(connection) &&
          !hasLinkedSummary(connectionSummaries[connection.id]),
      ).length,
    [connections, connectionSummaries],
  );
  const truelayerMode = providerState.truelayerReadiness?.mode ?? "sandbox";
  const truelayerLabel = truelayerMode === "live" ? "TrueLayer live" : "TrueLayer sandbox";
  const isTrueLayerProvider = providerState.provider === "truelayer";
  const liveMode = isTrueLayerProvider && truelayerMode === "live";
  // In production live mode only TrueLayer live is offered; Moneyhub sandbox and
  // the mock provider are hidden unless dev/mock mode is active (provider !== truelayer).
  const resolvedProviderOptions = (liveMode
    ? providerOptions.filter((option) => option.value === "truelayer")
    : providerOptions
  ).map((option) => (option.value === "truelayer" ? { ...option, label: truelayerLabel } : option));
  const showMoneyhubReadiness = Boolean(providerState.moneyhubReadiness) && !isTrueLayerProvider;
  const providerComparison = liveMode
    ? providerState.providerComparison?.filter((provider) => provider.provider === "truelayer")
    : providerState.providerComparison;
  // Sandbox connections are only split out of the main list in production live
  // mode; in sandbox/dev mode all connections are shown as before.
  const removableFailedAttempts = liveMode
    ? connectionsWithDisplayStatus.filter((connection) =>
        canRemoveFailedConnectionAttempt(
          connection,
          connection.summary,
          connection.tokenDiagnostics,
        ),
      )
    : [];
  const mainListConnections = (
    liveMode
      ? connectionsWithDisplayStatus.filter((connection) => !isSandboxConnection(connection))
      : connectionsWithDisplayStatus
  ).filter(
    (connection) =>
      !canRemoveFailedConnectionAttempt(
        connection,
        connection.summary,
        connection.tokenDiagnostics,
      ),
  );
  const collapsedSandboxConnections = liveMode
    ? connectionsWithDisplayStatus.filter((connection) => isSandboxConnection(connection))
    : [];
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const cleanup = sandboxCleanupPreview ?? {
    connections: 0,
    accounts: 0,
    transactions: 0,
    providerTokens: 0,
    syncRuns: 0,
  };
  const hasSandboxData =
    cleanup.connections + cleanup.accounts + cleanup.transactions + cleanup.providerTokens + cleanup.syncRuns >
      0 || collapsedSandboxConnections.length > 0;

  function cleanupSandboxData() {
    setMessage(null);
    setIsCleaningUp(true);
    startTransition(() => {
      void postJson("/api/data-cleanup/sandbox")
        .then((payload) => {
          setMessage(payload.message ?? "Sandbox data removed.");
          window.location.assign("/settings/connected-accounts");
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() => setIsCleaningUp(false));
    });
  }

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
              ? truelayerMode === "live"
                ? "truelayer_live"
                : "truelayer_sandbox"
              : "mock_sandbox",
        institutionName:
          selectedProvider === "moneyhub"
            ? "Moneyhub sandbox"
            : selectedProvider === "truelayer"
              ? truelayerLabel
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

  function reconnectConnection(connection: BankConnection) {
    setMessage(null);
    startTransition(() => {
      void postJson(connectionReconnectPath(connection.id))
        .then((payload) => {
          if (payload.authorizationUrl) {
            window.location.href = payload.authorizationUrl;
            return;
          }

          setMessage(payload.message ?? "Reconnect started.");
        })
        .catch((error: Error) => setMessage(error.message));
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

  function connectionIdentityForConfirmation(
    connection: BankConnection,
    summary?: ConnectionDisplaySummary,
  ) {
    const accountNames = summary?.linkedAccountNames.length
      ? `\nAccounts: ${summary.linkedAccountNames.join(", ")}`
      : "";
    return `${connectionDisplayTitle(connection, summary)}\nConnection: ${shortConnectionId(
      connection.id,
    )}\nCreated: ${formatConnectionTimestamp(connection.createdAt)}${accountNames}`;
  }

  function revokeConnection(connection: BankConnection, summary?: ConnectionDisplaySummary) {
    const confirmed = window.confirm(
      `Disconnect this connection only?\n\n${connectionIdentityForConfirmation(connection, summary)}`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    startTransition(() => {
      void postJson(connectionRevokePath(connection.id))
        .then((payload) => setMessage(payload.message ?? "Connection disconnected."))
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function removeFailedAttempt(connection: BankConnection, summary?: ConnectionDisplaySummary) {
    const confirmed = window.confirm(
      `Remove this failed connection attempt only?\n\n${connectionIdentityForConfirmation(
        connection,
        summary,
      )}`,
    );

    if (!confirmed) {
      return;
    }

    setMessage(null);
    setRemovingConnectionIds((current) => Array.from(new Set([...current, connection.id])));
    startTransition(() => {
      void postJson(failedAttemptRemovalPath(connection.id))
        .then((payload) => {
          setMessage(payload.message ?? "Failed connection attempt removed.");
          window.location.assign("/settings/connected-accounts");
        })
        .catch((error: Error) => setMessage(error.message))
        .finally(() =>
          setRemovingConnectionIds((current) =>
            current.filter((candidate) => candidate !== connection.id),
          ),
        );
    });
  }

  return (
    <div className="space-y-6">
      {showMoneyhubReadiness && providerState.moneyhubReadiness ? (
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
              <h2 className="text-lg font-semibold text-ink">
                TrueLayer {providerState.truelayerReadiness.mode} readiness
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                {providerState.truelayerReadiness.safeMessage}
              </p>
            </div>
            <StatusPill
              label={providerState.truelayerReadiness.mode === "live" ? "live mode" : "sandbox mode"}
              tone={providerState.truelayerReadiness.mode === "live" ? "warning" : "neutral"}
            />
          </div>
          {providerState.truelayerReadiness.sandboxClientIdInLiveMode ? (
            <div className="mt-4 flex gap-3 rounded-lg border border-berry/30 bg-berry/10 p-4 text-sm text-ink/80">
              <ShieldAlert className="h-5 w-5 shrink-0 text-berry" aria-hidden="true" />
              <p>
                Live mode is enabled but the TrueLayer client ID still starts with
                &quot;sandbox-&quot;. Set live TrueLayer credentials before connecting real bank
                data.
              </p>
            </div>
          ) : null}
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Mode</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.mode === "live" ? "Live" : "Sandbox"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Client ID</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.clientIdConfigured ? "Present" : "Missing"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Client secret</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.clientSecretConfigured ? "Present" : "Missing"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Redirect URI</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.redirectUriConfigured ? "Present" : "Missing"}
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Scopes</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.requiredScopesPresent ? "Present" : "Missing"}
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
            <div className="rounded-lg border border-line bg-paper p-3">
              <dt className="text-ink/50">Card providers (e.g. Amex)</dt>
              <dd className="mt-1 font-semibold text-ink">
                {providerState.truelayerReadiness.cardSupport === "enabled"
                  ? "Enabled"
                  : providerState.truelayerReadiness.cardSupport === "enabled_scope_missing"
                    ? "Scope missing"
                    : "Disabled"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink/55">
            {providerState.truelayerReadiness.cardSupportMessage}
          </p>
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

      {providerComparison && providerComparison.length > 0 ? (
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
            {providerComparison.map((provider) => (
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
              <h2 className="text-lg font-semibold text-ink">
                Start {selectedProvider === "truelayer" ? (truelayerMode === "live" ? "live" : "sandbox") : "sandbox"} connection
              </h2>
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
                {resolvedProviderOptions.map((provider) => (
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
            disabled={isPending || isSyncingAll || mainListConnections.length === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
          >
            <RefreshCw className={isSyncingAll ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            Sync all active
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {mainListConnections.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No live provider connections are available yet.
            </div>
          ) : null}

          {mainListConnections.map((connection) => (
            <article key={connection.id} className="rounded-lg border border-line bg-paper p-4">
              {(() => {
                const isSyncingConnection = syncingConnectionIds.includes(connection.id);
                const reconnectRequired = requiresReconnect(connection, connection.tokenDiagnostics);
                const summary = connection.summary;
                const title = connectionDisplayTitle(connection, summary);
                const displayLabel = reconnectRequired
                  ? "Reconnect required"
                  : isSyncingConnection
                    ? "syncing"
                    : labelStatus(connection.displayStatus);

                return (
                  <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{title}</h3>
                    {connection.provider === "truelayer" ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          connectionMode(connection) === "live"
                            ? "bg-berry/10 text-berry"
                            : "bg-ink/5 text-ink/60"
                        }`}
                      >
                        {connectionMode(connection)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink/60">
                    Provider: {connection.providerName ?? connection.provider} - Institution ID:{" "}
                    {connection.institutionId} - Connection {shortConnectionId(connection.id)}
                  </p>
                  {summary?.linkedAccountNames.length ? (
                    <p className="mt-1 text-sm text-ink/70">
                      Linked accounts: {summary.linkedAccountNames.join(", ")}
                    </p>
                  ) : null}
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
                  <dt className="text-ink/50">Created</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {formatConnectionTimestamp(connection.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Consent</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {labelStatus(connection.consentStatus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Linked accounts</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {summary?.linkedAccountCount ??
                      connection.accountsSyncedCount ??
                      0}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Linked transactions</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {summary?.linkedTransactionCount ?? 0}
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
              {connection.status === "sync_failed" && connection.errorMessage ? (
                (() => {
                  const tokenHealthy = connection.tokenDiagnostics?.syncEligible === "yes";
                  const cardOnly = connection.lastFailureReason
                    ? cardAccessReasons.has(connection.lastFailureReason)
                    : false;
                  return (
                    <div
                      className={`mt-4 rounded-lg border p-3 text-sm text-ink/80 ${
                        cardOnly
                          ? "border-teal/30 bg-teal/10"
                          : tokenHealthy
                            ? "border-berry/30 bg-berry/10"
                            : "border-saffron/30 bg-saffron/10"
                      }`}
                    >
                      <p className="font-semibold text-ink">
                        {cardOnly
                          ? "This provider may be card-only"
                          : tokenHealthy
                            ? "Provider access denied"
                            : "Connection needs attention"}
                      </p>
                      <p className="mt-1">{connection.errorMessage}</p>
                      {connection.lastFailedEndpoint || connection.lastFailureReason ? (
                        <p className="mt-1 text-xs text-ink/55">
                          {connection.lastFailedEndpoint
                            ? `Failing endpoint: ${connection.lastFailedEndpoint}. `
                            : ""}
                          {connection.lastFailedStatus
                            ? `HTTP status: ${connection.lastFailedStatus}. `
                            : ""}
                          {connection.lastFailureReason
                            ? `Reason: ${connection.lastFailureReason}.`
                            : ""}
                        </p>
                      ) : null}
                      {cardOnly ? (
                        <p className="mt-2 font-semibold text-teal">
                          Reconnect with card access: set TRUELAYER_CARDS_ENABLED=true, add
                          &quot;cards&quot; to TRUELAYER_SCOPES, then reconnect this Amex/card
                          connection.
                        </p>
                      ) : tokenHealthy ? (
                        <p className="mt-1 text-ink/60">
                          Token diagnostics look healthy, so this is a provider
                          access/permission response, not a token problem.
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}
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
                {reconnectRequired ? (
                  <button
                    type="button"
                    onClick={() => reconnectConnection(connection)}
                    disabled={isPending}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Cable className="h-4 w-4" aria-hidden="true" />
                    Reconnect
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => revokeConnection(connection, summary)}
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

      {removableFailedAttempts.length > 0 ? (
        <section className="rounded-lg border border-saffron/30 bg-saffron/5 p-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-saffron" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">Failed live connection attempts</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            These live attempts have no successful sync, no linked accounts, and no linked
            transactions. Removing one only deletes that failed connection record and its linked
            token record.
          </p>
          <div className="mt-4 grid gap-3">
            {removableFailedAttempts.map((connection) => {
              const summary = connection.summary;
              const isRemoving = removingConnectionIds.includes(connection.id);

              return (
                <div
                  key={connection.id}
                  className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {connectionDisplayTitle(connection, summary)}
                    </p>
                    <p className="mt-1 text-ink/60">
                      Connection {shortConnectionId(connection.id)} - Created{" "}
                      {formatConnectionTimestamp(connection.createdAt)} - Reason{" "}
                      {connection.lastFailureReason ?? "token not usable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFailedAttempt(connection, summary)}
                    disabled={isPending || isRemoving}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-berry disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {isRemoving ? "Removing" : "Remove failed connection attempt"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {collapsedSandboxConnections.length > 0 ? (
        <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <h2 className="text-lg font-semibold text-ink">Old sandbox/test data</h2>
          <p className="mt-1 text-sm text-ink/60">
            {collapsedSandboxConnections.length} old sandbox/test connection
            {collapsedSandboxConnections.length === 1 ? " is" : "s are"} hidden from your live
            connections.
          </p>
          <ul className="mt-4 space-y-2">
            {collapsedSandboxConnections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm"
              >
                <span className="font-semibold text-ink">{connection.institutionName}</span>
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                  sandbox
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasSandboxData ? (
        <section className="rounded-lg border border-berry/30 bg-berry/5 p-5">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-berry" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-ink">Clean up sandbox data</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Remove old sandbox/mock records from your account. Live TrueLayer connections,
            tokens, accounts, and transactions are never touched.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-ink/50">Connections</dt>
              <dd className="mt-1 font-semibold text-ink">{cleanup.connections}</dd>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-ink/50">Accounts</dt>
              <dd className="mt-1 font-semibold text-ink">{cleanup.accounts}</dd>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-ink/50">Transactions</dt>
              <dd className="mt-1 font-semibold text-ink">{cleanup.transactions}</dd>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-ink/50">Token records</dt>
              <dd className="mt-1 font-semibold text-ink">{cleanup.providerTokens}</dd>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <dt className="text-ink/50">Sync runs</dt>
              <dd className="mt-1 font-semibold text-ink">{cleanup.syncRuns}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={cleanupSandboxData}
            disabled={isPending || isCleaningUp}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-berry px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isCleaningUp ? "Removing" : "Remove sandbox/mock data"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
