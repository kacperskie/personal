import { createHash } from "node:crypto";
import type { ProviderWebhookEventType } from "@/lib/domain";

type UnknownRecord = Record<string, unknown>;

export type ParsedMoneyhubWebhook = {
  providerEventId: string;
  providerEventType: ProviderWebhookEventType;
  rawEventType: string;
  connectionId: string;
  accountIds: string[];
  transactionIds: string[];
  receivedAt: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nestedRecord(record: UnknownRecord, key: string) {
  const value = record[key];

  return isRecord(value) ? value : null;
}

function stringFromPath(record: UnknownRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record;

    for (const segment of path) {
      if (!isRecord(current)) {
        current = null;
        break;
      }

      current = current[segment];
    }

    const value = stringValue(current);

    if (value) {
      return value;
    }
  }

  return null;
}

function stringsFromValue(value: unknown, objectKeys: string[] = ["id"]): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (isRecord(item)) {
          return objectKeys
            .map((key) => stringValue(item[key]))
            .filter((candidate): candidate is string => Boolean(candidate));
        }

        return [];
      })
      .filter(Boolean);
  }

  const single = stringValue(value);

  return single ? [single] : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function accountIdsFromPayload(payload: UnknownRecord) {
  const data = nestedRecord(payload, "data");
  const accountIds = [
    ...stringsFromValue(payload.accountIds),
    ...stringsFromValue(payload.accountId),
    ...stringsFromValue(payload.accounts, ["id", "accountId", "providerAccountId"]),
    ...stringsFromValue(payload.providerAccountIds),
    ...(data
      ? [
          ...stringsFromValue(data.accountIds),
          ...stringsFromValue(data.accountId),
          ...stringsFromValue(data.accounts, ["id", "accountId", "providerAccountId"]),
          ...stringsFromValue(data.providerAccountIds),
          ...stringsFromValue(data.transactions, ["accountId", "providerAccountId"]),
        ]
      : []),
  ];

  return unique(accountIds);
}

function transactionIdsFromPayload(payload: UnknownRecord) {
  const data = nestedRecord(payload, "data");
  const transactionIds = [
    ...stringsFromValue(payload.transactionIds),
    ...stringsFromValue(payload.transactionId),
    ...stringsFromValue(payload.transactions, ["id", "transactionId", "providerTransactionId"]),
    ...(data
      ? [
          ...stringsFromValue(data.transactionIds),
          ...stringsFromValue(data.transactionId),
          ...stringsFromValue(data.transactions, ["id", "transactionId", "providerTransactionId"]),
        ]
      : []),
  ];

  return unique(transactionIds);
}

export function normalizeMoneyhubWebhookEventType(
  rawEventType: string,
): ProviderWebhookEventType | null {
  const normalized = rawEventType.replace(/[\s_.:-]/g, "").toLowerCase();

  if (normalized.includes("newtransactions") || normalized.includes("transactionsnew")) {
    return "newTransactions";
  }

  if (normalized.includes("updatedtransactions") || normalized.includes("transactionsupdated")) {
    return "updatedTransactions";
  }

  if (
    normalized.includes("deletedtransactions") ||
    normalized.includes("removedtransactions") ||
    normalized.includes("transactionsdeleted")
  ) {
    return "deletedTransactions";
  }

  if (normalized.includes("restoredtransactions") || normalized.includes("transactionsrestored")) {
    return "restoredTransactions";
  }

  if (
    normalized.includes("synccompleted") ||
    normalized.includes("synccomplete") ||
    normalized.includes("syncsuccessful") ||
    normalized.includes("syncsuccess")
  ) {
    return "syncCompleted";
  }

  if (
    normalized.includes("syncfailed") ||
    normalized.includes("syncfailure") ||
    normalized.includes("syncerror")
  ) {
    return "syncFailed";
  }

  return null;
}

function stableFallbackEventId(input: {
  rawEventType: string;
  connectionId: string;
  accountIds: string[];
  transactionIds: string[];
}) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        rawEventType: input.rawEventType,
        connectionId: input.connectionId,
        accountIds: input.accountIds,
        transactionIds: input.transactionIds,
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return `moneyhub_evt_${hash}`;
}

export function parseMoneyhubWebhookPayload(
  value: unknown,
  receivedAt = new Date().toISOString(),
): ParsedMoneyhubWebhook | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawEventType = stringFromPath(value, [
    ["eventType"],
    ["type"],
    ["event_type"],
    ["name"],
    ["event", "type"],
    ["data", "eventType"],
    ["data", "type"],
  ]);

  if (!rawEventType) {
    return null;
  }

  const providerEventType = normalizeMoneyhubWebhookEventType(rawEventType);

  if (!providerEventType) {
    return null;
  }

  const connectionId = stringFromPath(value, [
    ["connectionId"],
    ["providerConnectionId"],
    ["userConnectionId"],
    ["connection", "id"],
    ["data", "connectionId"],
    ["data", "providerConnectionId"],
    ["data", "userConnectionId"],
    ["data", "connection", "id"],
  ]);

  if (!connectionId) {
    return null;
  }

  const accountIds = accountIdsFromPayload(value);
  const transactionIds = transactionIdsFromPayload(value);
  const providerEventId =
    stringFromPath(value, [
      ["providerEventId"],
      ["eventId"],
      ["webhookId"],
      ["id"],
      ["event", "id"],
      ["data", "eventId"],
      ["data", "id"],
    ]) ??
    stableFallbackEventId({
      rawEventType,
      connectionId,
      accountIds,
      transactionIds,
    });

  return {
    providerEventId,
    providerEventType,
    rawEventType,
    connectionId,
    accountIds,
    transactionIds,
    receivedAt,
  };
}
