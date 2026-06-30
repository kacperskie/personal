import "server-only";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type ProviderPayloadKind = "account" | "transaction";

export type ProviderPayloadValidationReport = {
  provider: string;
  kind: ProviderPayloadKind;
  payloadCount: number;
  generatedAt: string;
  unmappedFields: string[];
  missingRequiredFields: Array<{
    payloadIndex: number;
    fields: string[];
  }>;
  optionalFieldsPresent: string[];
  unknownAccountSubtypes: string[];
  unknownTransactionCategories: string[];
};

export type ProviderPayloadInspectionInput = {
  provider: string;
  connectionId: string;
  kind: ProviderPayloadKind;
  payloads: unknown[];
};

const accountRequiredFieldGroups = [
  ["id", "accountId", "providerAccountId"],
  ["type", "accountType"],
  ["balance", "currentBalance"],
  ["accountName", "name", "displayName", "productName", "officialName"],
];

const transactionRequiredFieldGroups = [
  ["id", "transactionId"],
  ["accountId", "providerAccountId"],
  ["date", "bookingDate"],
  ["amount", "value"],
  ["description", "longDescription", "shortDescription", "transactionInformation"],
];

const accountMappedFields = new Set([
  "id",
  "accountId",
  "providerAccountId",
  "institution.id",
  "institution.name",
  "providerName",
  "displayName",
  "name",
  "officialName",
  "accountName",
  "type",
  "subtype",
  "accountType",
  "balance.amount",
  "balance.amount.value",
  "balance.amount.currency",
  "balance.value",
  "balance.date",
  "currentBalance",
  "availableBalance",
  "creditLimit",
  "currency",
  "mask",
  "number",
  "dateModified",
  "productName",
  "details.creditLimit",
]);

const transactionMappedFields = new Set([
  "id",
  "transactionId",
  "accountId",
  "providerAccountId",
  "date",
  "dateModified",
  "bookingDate",
  "description",
  "longDescription",
  "merchant",
  "counterpartyName",
  "amount.amount",
  "amount.amount.value",
  "amount.amount.currency",
  "amount.value",
  "amount.currency",
  "value",
  "currency",
  "status",
  "pending",
  "category",
  "category.name",
  "categoryId",
  "isTransfer",
  "proprietaryBankTransactionCode",
  "proprietaryTransactionCode.code",
  "proprietaryTransactionCode.issuer",
  "transactionCode.code",
  "transactionCode.subCode",
  "transactionInformation",
  "shortDescription",
]);

const accountOptionalFields = [
  "availableBalance",
  "creditLimit",
  "currency",
  "mask",
  "number",
  "dateModified",
  "productName",
  "details.creditLimit",
  "accountReference",
  "providerId",
  "providerName",
];

const transactionOptionalFields = [
  "dateModified",
  "merchant",
  "counterpartyName",
  "status",
  "pending",
  "category",
  "categoryId",
  "isTransfer",
  "proprietaryBankTransactionCode",
  "proprietaryTransactionCode.code",
  "transactionCode.code",
  "transactionCode.subCode",
  "transactionInformation",
  "cardInstrument.cardSchemeName",
  "creditorAccount.name",
  "debtorAccount.name",
];

const knownAccountTypeHints = [
  "cash:current",
  "current",
  "card",
  "credit",
  "saving",
  "savings",
  "saver",
  "pocket",
  "vault",
  "isa",
  "pension",
  "investment",
  "loan",
  "mortgage",
  "asset",
  "property",
  "crypto",
];

const knownTransactionCategories = new Set([
  "cat_income",
  "cat_groceries",
  "cat_eating_out",
  "cat_transport",
  "cat_home_bills",
  "cat_personal",
  "cat_savings",
  "cat_debt",
  "income",
  "groceries",
  "eating out",
  "transport",
  "home bills",
  "personal",
  "savings",
  "debt",
  "transfer",
]);

const secretPathPattern =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|client[_-]?secret|secret|password|credential|private[_-]?key|jwks)/i;
const identifierPathPattern =
  /(^id$|[_-]?id$|connectionid|userid|clientuserid|provideraccountid|providerid|counterpartyid|accountreference|transactionreference|statementreference|sortcode|accountnumber|iban|pan)/i;
const namePathPattern =
  /(accountholder|givenname|familyname|fullname|creditoraccount\.name|debtoraccount\.name)/i;
const addressPathPattern = /(address|postcode|postalcode)/i;

function sha(value: unknown) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function redactIdentifier(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  return `[redacted-id:${sha(value)}]`;
}

function looksLikeSensitiveString(value: string) {
  const compact = value.replaceAll(/\s|-/g, "");

  return (
    /^GB[0-9A-Z]{14,32}$/i.test(compact) ||
    /^\d{12,19}$/.test(compact) ||
    /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)
  );
}

export function redactProviderPayload(value: unknown, pathParts: string[] = []): unknown {
  const fullPath = pathParts.join(".").toLowerCase();
  const key = pathParts.at(-1) ?? "";

  if (secretPathPattern.test(fullPath)) {
    return "[redacted-secret]";
  }

  if (namePathPattern.test(fullPath)) {
    return "[redacted-name]";
  }

  if (addressPathPattern.test(fullPath)) {
    return "[redacted-address]";
  }

  if (identifierPathPattern.test(key) || identifierPathPattern.test(fullPath)) {
    return redactIdentifier(value);
  }

  if (typeof value === "string" && looksLikeSensitiveString(value)) {
    return redactIdentifier(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactProviderPayload(item, [...pathParts, String(index)]));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactProviderPayload(childValue, [...pathParts, childKey]),
      ]),
    );
  }

  return value;
}

function flattenLeafPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  const entries = Object.entries(value);

  if (entries.length === 0) {
    return prefix ? [prefix] : [];
  }

  return entries.flatMap(([key, child]) => {
    const childPath = prefix ? `${prefix}.${key}` : key;
    return flattenLeafPaths(child, childPath);
  });
}

function hasPath(payload: unknown, fieldPath: string) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  let cursor: unknown = payload;

  for (const segment of fieldPath.split(".")) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
      return false;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor !== undefined && cursor !== null && cursor !== "";
}

function valueAtPath(payload: unknown, fieldPath: string) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  let cursor: unknown = payload;

  for (const segment of fieldPath.split(".")) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function missingRequiredFields(
  payload: unknown,
  groups: string[][],
): string[] {
  return groups
    .filter((group) => !group.some((fieldPath) => hasPath(payload, fieldPath)))
    .map((group) => group.join("|"));
}

function optionalFieldsPresent(payloads: unknown[], optionalFields: string[]) {
  return optionalFields.filter((fieldPath) =>
    payloads.some((payload) => hasPath(payload, fieldPath)),
  );
}

function unmappedFields(payloads: unknown[], mappedFields: Set<string>) {
  return Array.from(
    new Set(
      payloads
        .flatMap((payload) => flattenLeafPaths(payload))
        .filter((fieldPath) => !mappedFields.has(fieldPath)),
    ),
  ).sort();
}

function unknownAccountSubtypes(payloads: unknown[]) {
  return Array.from(
    new Set(
      payloads
        .flatMap((payload) => [
          valueAtPath(payload, "type"),
          valueAtPath(payload, "subtype"),
          valueAtPath(payload, "accountType"),
        ])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .filter((value) => {
          const normalized = value.toLowerCase();
          return !knownAccountTypeHints.some((hint) => normalized.includes(hint));
        }),
    ),
  ).sort();
}

function unknownTransactionCategories(payloads: unknown[]) {
  return Array.from(
    new Set(
      payloads
        .map((payload) => {
          const category = valueAtPath(payload, "category");
          const categoryId = valueAtPath(payload, "categoryId");

          if (typeof category === "string") {
            return category;
          }

          if (category && typeof category === "object") {
            const categoryName = (category as Record<string, unknown>).name;
            return typeof categoryName === "string" ? categoryName : undefined;
          }

          return typeof categoryId === "string" ? categoryId : undefined;
        })
        .filter((value): value is string => Boolean(value))
        .filter((value) => !knownTransactionCategories.has(value.toLowerCase())),
    ),
  ).sort();
}

export function createProviderPayloadValidationReport({
  provider,
  kind,
  payloads,
}: Omit<ProviderPayloadInspectionInput, "connectionId">): ProviderPayloadValidationReport {
  const requiredGroups =
    kind === "account" ? accountRequiredFieldGroups : transactionRequiredFieldGroups;
  const mappedFields = kind === "account" ? accountMappedFields : transactionMappedFields;
  const optionalFields = kind === "account" ? accountOptionalFields : transactionOptionalFields;

  return {
    provider,
    kind,
    payloadCount: payloads.length,
    generatedAt: new Date().toISOString(),
    unmappedFields: unmappedFields(payloads, mappedFields),
    missingRequiredFields: payloads
      .map((payload, payloadIndex) => ({
        payloadIndex,
        fields: missingRequiredFields(payload, requiredGroups),
      }))
      .filter((item) => item.fields.length > 0),
    optionalFieldsPresent: optionalFieldsPresent(payloads, optionalFields),
    unknownAccountSubtypes: kind === "account" ? unknownAccountSubtypes(payloads) : [],
    unknownTransactionCategories:
      kind === "transaction" ? unknownTransactionCategories(payloads) : [],
  };
}

export function isProviderPayloadInspectionEnabled() {
  return (
    process.env.OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG === "true" ||
    process.env.MONEYHUB_PAYLOAD_DEBUG === "true"
  );
}

function inspectionDirectory() {
  const configured = process.env.PROVIDER_PAYLOAD_DEBUG_DIR || ".debug/provider-payloads";
  const safeRelativeDir = configured.startsWith(".debug")
    ? configured
    : ".debug/provider-payloads";

  return path.resolve(/* turbopackIgnore: true */ process.cwd(), safeRelativeDir);
}

function safeFilePart(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export async function captureProviderPayloadInspection(
  input: ProviderPayloadInspectionInput,
): Promise<{ filePath: string; report: ProviderPayloadValidationReport } | null> {
  if (!isProviderPayloadInspectionEnabled()) {
    return null;
  }

  try {
    const report = createProviderPayloadValidationReport(input);
    const connectionRef = sha(input.connectionId);
    const capturedAt = new Date().toISOString();
    const dir = inspectionDirectory();
    const filename = `${safeFilePart(input.provider)}-${input.kind}-${connectionRef}-${capturedAt.replaceAll(/[:.]/g, "-")}.json`;
    const filePath = path.join(dir, filename);
    const redactedPayloads = input.payloads.map((payload) => redactProviderPayload(payload));

    await mkdir(dir, { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          provider: input.provider,
          kind: input.kind,
          capturedAt,
          connectionRef,
          payloadCount: input.payloads.length,
          validationReport: report,
          redactedPayloads,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    return { filePath, report };
  } catch {
    return null;
  }
}
