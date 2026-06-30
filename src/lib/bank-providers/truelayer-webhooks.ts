import type { ProviderWebhookEventType } from "@/lib/domain";

export type ParsedTrueLayerWebhook = {
  providerEventId: string;
  providerEventType: ProviderWebhookEventType;
  rawEventType: string;
  connectionId: string;
  accountIds: string[];
  transactionIds: string[];
  receivedAt: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function mapTrueLayerEventType(rawEventType: string): ProviderWebhookEventType | null {
  const normalized = rawEventType.toLowerCase();

  if (normalized.includes("transaction") && normalized.includes("delete")) {
    return "deletedTransactions";
  }

  if (normalized.includes("transaction") && normalized.includes("restore")) {
    return "restoredTransactions";
  }

  if (normalized.includes("transaction") && normalized.includes("update")) {
    return "updatedTransactions";
  }

  if (normalized.includes("transaction")) {
    return "newTransactions";
  }

  if (normalized.includes("sync") && normalized.includes("fail")) {
    return "syncFailed";
  }

  if (normalized.includes("sync")) {
    return "syncCompleted";
  }

  return null;
}

export function parseTrueLayerWebhookPayload(payload: unknown): ParsedTrueLayerWebhook | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as {
    event_id?: unknown;
    id?: unknown;
    event_type?: unknown;
    type?: unknown;
    connection_id?: unknown;
    provider_connection_id?: unknown;
    account_id?: unknown;
    account_ids?: unknown;
    transaction_id?: unknown;
    transaction_ids?: unknown;
    data?: {
      connection_id?: unknown;
      account_id?: unknown;
      account_ids?: unknown;
      transaction_id?: unknown;
      transaction_ids?: unknown;
    };
  };
  const rawEventType = stringValue(event.event_type) ?? stringValue(event.type);
  const providerEventType = rawEventType ? mapTrueLayerEventType(rawEventType) : null;
  const providerEventId = stringValue(event.event_id) ?? stringValue(event.id);
  const connectionId =
    stringValue(event.connection_id) ??
    stringValue(event.provider_connection_id) ??
    stringValue(event.data?.connection_id);
  const accountIds = [
    ...stringArray(event.account_ids),
    ...stringArray(event.data?.account_ids),
    stringValue(event.account_id),
    stringValue(event.data?.account_id),
  ].filter((item): item is string => Boolean(item));
  const transactionIds = [
    ...stringArray(event.transaction_ids),
    ...stringArray(event.data?.transaction_ids),
    stringValue(event.transaction_id),
    stringValue(event.data?.transaction_id),
  ].filter((item): item is string => Boolean(item));

  if (!rawEventType || !providerEventType || !providerEventId || !connectionId) {
    return null;
  }

  return {
    providerEventId,
    providerEventType,
    rawEventType,
    connectionId,
    accountIds: Array.from(new Set(accountIds)),
    transactionIds: Array.from(new Set(transactionIds)),
    receivedAt: new Date().toISOString(),
  };
}
