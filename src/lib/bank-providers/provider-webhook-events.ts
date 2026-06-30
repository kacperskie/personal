import type {
  BankProvider,
  ProviderWebhookEvent,
  ProviderWebhookProcessingStatus,
} from "@/lib/domain";
import type { ParsedMoneyhubWebhook } from "@/lib/bank-providers/moneyhub-webhooks";
import type { ParsedTrueLayerWebhook } from "@/lib/bank-providers/truelayer-webhooks";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

type ProviderWebhookEventRow =
  Database["public"]["Tables"]["provider_webhook_events"]["Row"];

const fallbackWebhookEvents = new Map<string, ProviderWebhookEvent>();

type ParsedProviderWebhook = ParsedMoneyhubWebhook | ParsedTrueLayerWebhook;

function eventKey(provider: BankProvider, providerEventId: string) {
  return `${provider}:${providerEventId}`;
}

function providerWebhookEventFromRow(row: ProviderWebhookEventRow): ProviderWebhookEvent {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    providerEventType: row.provider_event_type,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    processingStatus: row.processing_status,
    connectionId: row.connection_id,
    accountIds: row.account_ids,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createWebhookEvent(input: {
  userId: string;
  provider: BankProvider;
  parsed: ParsedProviderWebhook;
  processingStatus?: ProviderWebhookProcessingStatus;
}): ProviderWebhookEvent {
  const now = input.parsed.receivedAt;

  return {
    id: `webhook_${input.provider}_${input.parsed.providerEventId}`.replaceAll(
      /[^a-zA-Z0-9_]/g,
      "_",
    ),
    userId: input.userId,
    provider: input.provider,
    providerEventId: input.parsed.providerEventId,
    providerEventType: input.parsed.providerEventType,
    receivedAt: input.parsed.receivedAt,
    processedAt: null,
    processingStatus: input.processingStatus ?? "received",
    connectionId: input.parsed.connectionId,
    accountIds: input.parsed.accountIds,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function recordProviderWebhookEventOnce(input: {
  userId: string;
  provider: BankProvider;
  parsed: ParsedProviderWebhook;
}): Promise<{ event: ProviderWebhookEvent; isDuplicate: boolean }> {
  const supabase = createSupabaseServiceRoleClient();
  const key = eventKey(input.provider, input.parsed.providerEventId);

  if (!supabase) {
    const existing = fallbackWebhookEvents.get(key);

    if (existing) {
      return { event: existing, isDuplicate: true };
    }

    const event = createWebhookEvent(input);
    fallbackWebhookEvents.set(key, event);

    return { event, isDuplicate: false };
  }

  const { data: existing, error: existingError } = await supabase
    .from("provider_webhook_events")
    .select("*")
    .eq("provider", input.provider)
    .eq("provider_event_id", input.parsed.providerEventId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return { event: providerWebhookEventFromRow(existing), isDuplicate: true };
  }

  const event = createWebhookEvent(input);
  const { data, error } = await supabase
    .from("provider_webhook_events")
    .insert({
      id: event.id,
      user_id: input.userId,
      provider: input.provider,
      provider_event_id: input.parsed.providerEventId,
      provider_event_type: input.parsed.providerEventType,
      received_at: input.parsed.receivedAt,
      processed_at: null,
      processing_status: event.processingStatus,
      connection_id: input.parsed.connectionId,
      account_ids: input.parsed.accountIds,
      error_message: null,
      raw_payload: {
        rawEventType: input.parsed.rawEventType,
        transactionIds: input.parsed.transactionIds,
      },
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { event: providerWebhookEventFromRow(data), isDuplicate: false };
}

async function updateWebhookEventStatus(
  event: ProviderWebhookEvent,
  processingStatus: ProviderWebhookProcessingStatus,
  errorMessage: string | null,
) {
  const now = new Date().toISOString();
  const updated: ProviderWebhookEvent = {
    ...event,
    processingStatus,
    errorMessage,
    processedAt:
      processingStatus === "processed" || processingStatus === "failed" ? now : event.processedAt,
    updatedAt: now,
  };
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    fallbackWebhookEvents.set(eventKey(event.provider, event.providerEventId), updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("provider_webhook_events")
    .update({
      processing_status: updated.processingStatus,
      processed_at: updated.processedAt,
      error_message: updated.errorMessage,
      updated_at: updated.updatedAt,
    })
    .eq("id", event.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return providerWebhookEventFromRow(data);
}

export function clearFallbackWebhookEventsForTests() {
  fallbackWebhookEvents.clear();
}

export function listFallbackWebhookEventsForTests() {
  return Array.from(fallbackWebhookEvents.values());
}

export function markProviderWebhookEventQueued(event: ProviderWebhookEvent) {
  return updateWebhookEventStatus(event, "queued", null);
}

export function markProviderWebhookEventProcessed(event: ProviderWebhookEvent) {
  return updateWebhookEventStatus(event, "processed", null);
}

export function markProviderWebhookEventFailed(
  event: ProviderWebhookEvent,
  errorMessage: string,
) {
  return updateWebhookEventStatus(event, "failed", errorMessage);
}
