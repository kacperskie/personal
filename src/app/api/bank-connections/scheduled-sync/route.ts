import { NextResponse } from "next/server";
import type { BankConnection, SyncJob } from "@/lib/domain";
import { runServerConnectionSync } from "@/lib/bank-providers/server-sync-runner";
import {
  enqueueConnectionSync,
  processPendingSyncJobs,
} from "@/lib/bank-providers/sync-queue";
import {
  getServiceActiveBankConnections,
  getServiceBankConnectionById,
  recordServiceAuditEvent,
} from "@/lib/repositories/service-finance-repository";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

const minimumSyncIntervalMs = 30 * 60 * 1000;

function safeIdSuffix(value: string | null | undefined) {
  if (!value) return "unknown";
  const clean = value.replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(-8) || "unknown";
}

function requestCronSecret(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

export function isScheduledSyncRequestAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = requestCronSecret(request);

  return Boolean(expected && provided && provided === expected);
}

export function shouldSkipScheduledConnection(
  connection: BankConnection,
  now = new Date(),
) {
  if (connection.status === "disconnected" || connection.consentStatus === "revoked") {
    return true;
  }

  if (connection.consentStatus === "expired" || connection.status === "needs_reconsent") {
    return true;
  }

  if (
    connection.consentExpiresAt &&
    new Date(connection.consentExpiresAt).getTime() <= now.getTime()
  ) {
    return true;
  }

  if (
    connection.lastSyncedAt &&
    now.getTime() - new Date(connection.lastSyncedAt).getTime() < minimumSyncIntervalMs
  ) {
    return true;
  }

  return false;
}

export function isScheduledLiveTrueLayerConnection(
  connection: BankConnection,
  now = new Date(),
) {
  const liveMode =
    connection.mode === "live" ||
    /live/i.test(`${connection.institutionId} ${connection.institutionName}`);

  return (
    connection.provider === "truelayer" &&
    liveMode &&
    (connection.status === "connected" || connection.status === "syncing") &&
    connection.consentStatus === "active" &&
    !shouldSkipScheduledConnection(connection, now)
  );
}

async function processScheduledJob(job: SyncJob) {
  const record = await getServiceBankConnectionById(job.connectionId);

  if (!record) {
    throw new Error("Connection could not be found for scheduled sync.");
  }

  await runServerConnectionSync({
    userId: record.userId,
    connection: record.connection,
    accountIds: job.accountIds,
    createNotifications: true,
    syncTrigger: "scheduled",
  });
}

export async function POST(request: Request) {
  if (!isScheduledSyncRequestAuthorized(request)) {
    return NextResponse.json(
      { error: { code: "cron_secret_invalid", message: "Scheduled sync is not authorised." } },
      { status: 401 },
    );
  }

  const now = new Date();
  const records = await getServiceActiveBankConnections();
  const eligible = records.filter((record) =>
    isScheduledLiveTrueLayerConnection(record.connection, now),
  );

  await Promise.all(
    eligible.map((record) =>
      recordServiceAuditEvent({
        userId: record.userId,
        eventType: "bank_connection_scheduled_sync_started",
        entity: "bank_connections",
        entityId: record.connection.id,
        metadata: {
          provider: record.connection.provider,
          mode: record.connection.mode ?? "live",
          connectionIdSuffix: safeIdSuffix(record.connection.id),
        },
      }),
    ),
  );

  const jobs = await Promise.all(
    eligible.map((record) =>
      enqueueConnectionSync({
        userId: record.userId,
        provider: record.connection.provider,
        connectionId: record.connection.id,
        reason: "scheduled_fallback",
        idempotencyKey: `scheduled:${record.connection.id}:${now.toISOString().slice(0, 13)}`,
      }),
    ),
  );
  const processedJobs =
    jobs.length > 0
      ? await processPendingSyncJobs({
          limit: jobs.length,
          processor: processScheduledJob,
        })
      : [];

  await Promise.all(
    processedJobs.map(async (job) => {
      const record = await getServiceBankConnectionById(job.connectionId);

      if (!record) {
        return null;
      }

      return recordServiceAuditEvent({
        userId: record.userId,
        eventType:
          job.status === "failed" ? "sync_job_failed" : "bank_connection_scheduled_sync_completed",
        entity: job.status === "failed" ? "sync_jobs" : "bank_connections",
        entityId: job.status === "failed" ? job.id : record.connection.id,
        metadata: {
          reason: job.reason,
          status: job.status,
          connectionIdSuffix: safeIdSuffix(job.connectionId),
        },
      });
    }),
  );

  const succeeded = processedJobs.filter((job) => job.status === "completed").length;
  const failed = processedJobs.filter((job) => job.status === "failed").length;

  return NextResponse.json({
    status: failed > 0 ? "partial" : "success",
    queued: jobs.length,
    processed: processedJobs.length,
    skipped: records.length - eligible.length,
    succeeded,
    failed,
    connections: processedJobs.map((job) => ({
      connectionIdSuffix: safeIdSuffix(job.connectionId),
      provider: job.provider,
      status: job.status,
      resultCode: job.status === "failed" ? "sync_failed" : "sync_completed",
    })),
  });
}

export const GET = POST;
