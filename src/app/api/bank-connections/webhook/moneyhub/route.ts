import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { BankConnection, SyncJob } from "@/lib/domain";
import { parseMoneyhubWebhookPayload } from "@/lib/bank-providers/moneyhub-webhooks";
import {
  markProviderWebhookEventFailed,
  markProviderWebhookEventProcessed,
  markProviderWebhookEventQueued,
  recordProviderWebhookEventOnce,
} from "@/lib/bank-providers/provider-webhook-events";
import { getMoneyhubProviderConfig } from "@/lib/bank-providers/provider-config";
import { runServerConnectionSync } from "@/lib/bank-providers/server-sync-runner";
import {
  enqueueAccountSync,
  enqueueConnectionSync,
  processPendingSyncJobs,
} from "@/lib/bank-providers/sync-queue";
import { createProviderNotification } from "@/lib/bank-providers/provider-notifications";
import { createTransactionNotification } from "@/lib/bank-providers/transaction-notifications";
import {
  createServiceNotification,
  getServiceBankConnectionById,
  recordServiceAuditEvent,
  recordServiceProviderSyncEvent,
} from "@/lib/repositories/service-finance-repository";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

function safeWebhookError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function verifySignature(body: string, signature: string | null, secret: string | null) {
  if (!signature) {
    return false;
  }

  if (!secret) {
    return signature === "stub";
  }

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

function createWebhookSyncEvent(connection: BankConnection, eventType: string) {
  const now = new Date().toISOString();

  return {
    id: `sync_webhook_${connection.id}_${eventType}_${Date.now()}`.replaceAll(
      /[^a-zA-Z0-9_]/g,
      "_",
    ),
    providerConnectionId: connection.id,
    provider: connection.provider,
    status: eventType === "syncFailed" ? "sync_failed" : "syncing",
    message: `Moneyhub webhook received: ${eventType}`,
    startedAt: now,
    finishedAt: eventType === "syncFailed" ? now : null,
  } as const;
}

async function createWebhookNotification(input: {
  userId: string;
  connection: BankConnection;
  providerEventId: string;
  eventType: string;
}) {
  if (input.eventType === "syncFailed") {
    await createServiceNotification(
      createProviderNotification({
        userId: input.userId,
        connection: input.connection,
        type: "account_sync_failure",
        title: `${input.connection.institutionName} sync failed`,
        body: "A provider webhook reported a sync failure.",
        severity: "urgent",
      }),
    );
    return;
  }

  if (input.eventType === "syncCompleted") {
    await createServiceNotification(
      createProviderNotification({
        userId: input.userId,
        connection: input.connection,
        type: "sync_successful",
        title: `${input.connection.institutionName} sync completed`,
        body: "A provider webhook reported a completed sync.",
        severity: "info",
      }),
    );
    return;
  }

  await createServiceNotification(
    createTransactionNotification({
      userId: input.userId,
      type: input.eventType === "newTransactions" ? "new_transaction" : "transaction_updated",
      entityId: input.providerEventId,
      title:
        input.eventType === "newTransactions"
          ? "New transaction detected"
          : "Transaction update detected",
      body:
        input.eventType === "newTransactions"
          ? "Provider activity is ready to review."
          : "Provider activity changed and is ready to review.",
      severity: input.eventType === "deletedTransactions" ? "warning" : "info",
    }),
  );
}

async function processJob(job: SyncJob) {
  const record = await getServiceBankConnectionById(job.connectionId);

  if (!record) {
    throw new Error("Connection could not be found for queued sync.");
  }

  await runServerConnectionSync({
    userId: record.userId,
    connection: record.connection,
    accountIds: job.accountIds,
    createNotifications: false,
    syncTrigger: "webhook",
  });
}

export async function POST(request: Request) {
  const config = getMoneyhubProviderConfig();
  const body = await request.text();
  const signature =
    request.headers.get("x-moneyhub-signature") ??
    request.headers.get("moneyhub-signature");

  if (!verifySignature(body, signature, config.webhookSecret)) {
    return safeWebhookError(
      "webhook_signature_invalid",
      "Webhook signature could not be verified.",
      401,
    );
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(body);
  } catch {
    return safeWebhookError("webhook_payload_invalid", "Webhook payload is invalid.", 400);
  }

  const parsed = parseMoneyhubWebhookPayload(parsedBody);

  if (!parsed) {
    return safeWebhookError("webhook_payload_invalid", "Webhook payload is invalid.", 400);
  }

  const connectionRecord = await getServiceBankConnectionById(parsed.connectionId);

  if (!connectionRecord) {
    return NextResponse.json(
      {
        received: true,
        queued: false,
        message: "Webhook accepted, but no matching sandbox connection was found.",
      },
      { status: 202 },
    );
  }

  const { event, isDuplicate } = await recordProviderWebhookEventOnce({
    userId: connectionRecord.userId,
    provider: "moneyhub",
    parsed,
  });

  if (isDuplicate) {
    return NextResponse.json({
      received: true,
      duplicate: true,
      message: "Duplicate webhook already processed or queued.",
    });
  }

  await recordServiceProviderSyncEvent(
    connectionRecord.userId,
    createWebhookSyncEvent(connectionRecord.connection, parsed.providerEventType),
  );
  await recordServiceAuditEvent({
    userId: connectionRecord.userId,
    eventType: "provider_webhook_event_received",
    entity: "provider_webhook_events",
    entityId: event.id,
    metadata: {
      providerEventType: parsed.providerEventType,
      connectionId: parsed.connectionId,
      accountCount: parsed.accountIds.length,
    },
  });

  const job =
    parsed.accountIds.length > 0
      ? await enqueueAccountSync({
          userId: connectionRecord.userId,
          provider: "moneyhub",
          connectionId: connectionRecord.connection.id,
          accountIds: parsed.accountIds,
          reason: `webhook:${parsed.providerEventType}`,
          idempotencyKey: `webhook:${parsed.providerEventId}`,
        })
      : await enqueueConnectionSync({
          userId: connectionRecord.userId,
          provider: "moneyhub",
          connectionId: connectionRecord.connection.id,
          reason: `webhook:${parsed.providerEventType}`,
          idempotencyKey: `webhook:${parsed.providerEventId}`,
        });

  await markProviderWebhookEventQueued(event);
  await recordServiceAuditEvent({
    userId: connectionRecord.userId,
    eventType: "sync_job_enqueued",
    entity: "sync_jobs",
    entityId: job.id,
    metadata: {
      reason: job.reason,
      scope: job.scope,
      accountCount: job.accountIds.length,
    },
  });

  const processedJobs = await processPendingSyncJobs({
    limit: 5,
    processor: processJob,
  });
  const failedJob = processedJobs.find((processed) => processed.status === "failed");

  if (failedJob) {
    await markProviderWebhookEventFailed(
      event,
      failedJob.errorMessage ?? "Queued sync failed.",
    );
    await recordServiceAuditEvent({
      userId: connectionRecord.userId,
      eventType: "sync_job_failed",
      entity: "sync_jobs",
      entityId: failedJob.id,
      metadata: { reason: failedJob.reason },
    });
  } else {
    await markProviderWebhookEventProcessed(event);
    await recordServiceAuditEvent({
      userId: connectionRecord.userId,
      eventType: "provider_webhook_event_processed",
      entity: "provider_webhook_events",
      entityId: event.id,
      metadata: { providerEventType: parsed.providerEventType },
    });
    await recordServiceAuditEvent({
      userId: connectionRecord.userId,
      eventType: "sync_job_completed",
      entity: "sync_jobs",
      entityId: job.id,
      metadata: { reason: job.reason },
    });
    await createWebhookNotification({
      userId: connectionRecord.userId,
      connection: connectionRecord.connection,
      providerEventId: parsed.providerEventId,
      eventType: parsed.providerEventType,
    });
  }

  return NextResponse.json({
    received: true,
    duplicate: false,
    queued: true,
    processedJobs: processedJobs.length,
    eventType: parsed.providerEventType,
  });
}
