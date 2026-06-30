import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTrueLayerProviderConfig } from "@/lib/bank-providers/provider-config";
import {
  markProviderWebhookEventQueued,
  recordProviderWebhookEventOnce,
} from "@/lib/bank-providers/provider-webhook-events";
import { parseTrueLayerWebhookPayload } from "@/lib/bank-providers/truelayer-webhooks";
import {
  enqueueAccountSync,
  enqueueConnectionSync,
} from "@/lib/bank-providers/sync-queue";
import {
  getServiceBankConnectionById,
  recordServiceAuditEvent,
  recordServiceProviderSyncEvent,
} from "@/lib/repositories/service-finance-repository";

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

export async function POST(request: Request) {
  const config = getTrueLayerProviderConfig();
  const body = await request.text();
  const signature =
    request.headers.get("x-truelayer-signature") ??
    request.headers.get("truelayer-signature");

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

  const parsed = parseTrueLayerWebhookPayload(parsedBody);

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
    provider: "truelayer",
    parsed,
  });

  if (isDuplicate) {
    return NextResponse.json({
      received: true,
      duplicate: true,
      message: "Duplicate webhook already processed or queued.",
    });
  }

  const now = new Date().toISOString();
  await recordServiceProviderSyncEvent(connectionRecord.userId, {
    id: `sync_webhook_truelayer_${parsed.providerEventId}`.replaceAll(
      /[^a-zA-Z0-9_]/g,
      "_",
    ),
    providerConnectionId: connectionRecord.connection.id,
    provider: "truelayer",
    status: parsed.providerEventType === "syncFailed" ? "sync_failed" : "syncing",
    message: `TrueLayer webhook received: ${parsed.providerEventType}`,
    startedAt: now,
    finishedAt: parsed.providerEventType === "syncFailed" ? now : null,
  });
  await recordServiceAuditEvent({
    userId: connectionRecord.userId,
    eventType: "provider_webhook_event_received",
    entity: "provider_webhook_events",
    entityId: event.id,
    metadata: {
      provider: "truelayer",
      providerEventType: parsed.providerEventType,
      connectionId: parsed.connectionId,
      accountCount: parsed.accountIds.length,
    },
  });

  const job =
    parsed.accountIds.length > 0
      ? await enqueueAccountSync({
          userId: connectionRecord.userId,
          provider: "truelayer",
          connectionId: connectionRecord.connection.id,
          accountIds: parsed.accountIds,
          reason: `webhook:${parsed.providerEventType}`,
          idempotencyKey: `truelayer-webhook:${parsed.providerEventId}`,
        })
      : await enqueueConnectionSync({
          userId: connectionRecord.userId,
          provider: "truelayer",
          connectionId: connectionRecord.connection.id,
          reason: `webhook:${parsed.providerEventType}`,
          idempotencyKey: `truelayer-webhook:${parsed.providerEventId}`,
        });

  await markProviderWebhookEventQueued(event);
  await recordServiceAuditEvent({
    userId: connectionRecord.userId,
    eventType: "sync_job_enqueued",
    entity: "sync_jobs",
    entityId: job.id,
    metadata: {
      provider: "truelayer",
      reason: job.reason,
      scope: job.scope,
      accountCount: job.accountIds.length,
    },
  });

  return NextResponse.json({
    received: true,
    duplicate: false,
    queued: true,
    eventType: parsed.providerEventType,
  });
}
