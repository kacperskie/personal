"use client";

import { useMemo, useState, useTransition } from "react";
import { Cable, RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import type { BankConnection, BankProvider, ConnectionLifecycleStatus } from "@/lib/domain";
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
  { value: "mock", label: "Mock provider" },
];

const targetInstitutions = ["American Express", "Nationwide", "Revolut"];

function labelStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function ConnectedAccountsManager({
  connections,
  providerState,
}: {
  connections: BankConnection[];
  providerState: {
    provider: BankProvider;
    configured: boolean;
    safeMessage: string;
  };
}) {
  const [selectedProvider, setSelectedProvider] = useState<BankProvider>(
    providerState.provider === "mock" ? "moneyhub" : providerState.provider,
  );
  const [message, setMessage] = useState<string | null>(providerState.safeMessage);
  const [isPending, startTransition] = useTransition();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const connectionsWithDisplayStatus = useMemo(
    () =>
      connections.map((connection) => ({
        ...connection,
        displayStatus: getConnectionLifecycleStatus(connection, asOfDate),
      })),
    [connections, asOfDate],
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
          selectedProvider === "moneyhub" ? "moneyhub_sandbox" : "mock_sandbox",
        institutionName:
          selectedProvider === "moneyhub" ? "Moneyhub sandbox" : "Mock sandbox",
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
    startTransition(() => {
      void postJson(`/api/bank-connections/${connectionId}/sync`)
        .then((payload) => setMessage(payload.message ?? "Sync completed."))
        .catch((error: Error) => setMessage(error.message));
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
      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,auto)] lg:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Cable className="h-5 w-5 text-teal" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Start sandbox connection</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Provider-specific work stays behind the adapter. Moneyhub is the first
              sandbox-ready provider skeleton; mock remains available for local fallback.
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
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-ink">Provider connections</h2>
          <p className="text-sm text-ink/60">
            Status, consent, manual sync, and disconnect controls use provider-agnostic routes.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {connectionsWithDisplayStatus.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No provider connections are available yet.
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
                  <dt className="text-ink/50">Last sync result</dt>
                  <dd className="mt-1 font-semibold text-ink">
                    {connection.errorMessage ?? "No provider-safe error"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => syncConnection(connection.id)}
                  disabled={isPending || connection.status === "disconnected"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Sync
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
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
