import type {
  Account,
  AccountSubtype,
  AccountType,
  BankConnection,
  CategoryKind,
  CurrencyCode,
  ProviderAccount,
  ProviderTransaction,
  Transaction,
} from "@/lib/domain";
import { suggestAccountPurpose } from "@/lib/bank-providers/account-purpose-suggestions";

export type ProviderAccountPayload = {
  id?: string;
  accountId?: string;
  providerAccountId?: string;
  institution?: {
    id?: string;
    name?: string;
  };
  providerName?: string;
  displayName?: string;
  name?: string;
  officialName?: string;
  accountName?: string;
  type?: string;
  subtype?: string;
  accountType?: string;
  balance?: number | { amount?: number | { value?: number; currency?: string }; value?: number };
  currentBalance?: number;
  availableBalance?: number;
  creditLimit?: number | null;
  currency?: string;
  mask?: string | null;
  number?: string | null;
  dateModified?: string;
  productName?: string;
  details?: {
    creditLimit?: number | null;
  };
};

export type ProviderTransactionPayload = {
  id?: string;
  transactionId?: string;
  accountId?: string;
  providerAccountId?: string;
  date?: string;
  dateModified?: string;
  bookingDate?: string;
  description?: string;
  longDescription?: string;
  merchant?: string;
  counterpartyName?: string;
  amount?: number | { amount?: number | { value?: number; currency?: string }; value?: number; currency?: string };
  value?: number;
  currency?: string;
  status?: string;
  pending?: boolean;
  category?: string | { name?: string };
  categoryId?: string;
  categoryName?: string;
  isTransfer?: boolean;
  proprietaryBankTransactionCode?: string;
  proprietaryTransactionCode?: {
    code?: string;
    issuer?: string;
  };
  transactionCode?: {
    code?: string;
    subCode?: string;
  };
  transactionInformation?: string;
  shortDescription?: string;
  creditorAccount?: {
    name?: string;
  };
  debtorAccount?: {
    name?: string;
  };
  cardInstrument?: {
    name?: string;
    cardSchemeName?: string;
    authorisationType?: string;
  };
  deleted?: boolean;
  restored?: boolean;
};

function numericValue(value: ProviderAccountPayload["balance"] | ProviderTransactionPayload["amount"]) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value?.amount === "number") {
    return value.amount;
  }

  if (typeof value?.amount === "object") {
    return value.amount.value ?? 0;
  }

  return value?.value ?? 0;
}

function currencyValue(
  value: ProviderAccountPayload["balance"] | ProviderTransactionPayload["amount"],
) {
  if (!value || typeof value === "number") {
    return null;
  }

  if (typeof value.amount === "object") {
    return value.amount.currency ?? null;
  }

  return "currency" in value ? value.currency ?? null : null;
}

function mapAccountType(value?: string): AccountType {
  const normalized = value?.toLowerCase() ?? "";

  if (
    normalized.includes("cash:current") ||
    normalized.includes("current")
  ) {
    return "current_account";
  }

  if (normalized.includes("credit") || normalized === "card") {
    return "credit_card";
  }

  if (normalized.includes("saving") || normalized.includes("saver") || normalized === "savings") {
    return "savings";
  }

  if (normalized.includes("isa")) {
    return "isa";
  }

  if (normalized.includes("pension")) {
    return "pension";
  }

  if (normalized.includes("investment")) {
    return "investment";
  }

  if (normalized.includes("loan") || normalized.includes("mortgage")) {
    return "loan";
  }

  return "current_account";
}

function mapAccountSubtype(type: AccountType, value?: string): AccountSubtype {
  const normalized = value?.toLowerCase() ?? "";

  if (type === "credit_card") {
    return normalized.includes("charge") ? "charge_card" : "credit_card";
  }

  if (type === "savings") {
    if (normalized.includes("vault")) {
      return "vault";
    }

    if (normalized.includes("pocket")) {
      return "pocket";
    }

    return "savings";
  }

  if (type === "loan") {
    return "loan";
  }

  if (type === "isa") {
    return "isa";
  }

  if (type === "pension") {
    return "pension";
  }

  if (type === "investment") {
    return "investment";
  }

  return "current";
}

function normalizeBalanceForAccountType(type: AccountType, balance: number) {
  if (type === "credit_card" && balance > 0) {
    return -balance;
  }

  return balance;
}

function normalizeProviderTransactionStatus(
  payload: ProviderTransactionPayload,
): NonNullable<ProviderTransaction["providerStatus"]> {
  const normalized = payload.status?.toLowerCase() ?? "";

  if (payload.deleted || normalized.includes("deleted") || normalized.includes("removed")) {
    return "deleted";
  }

  if (payload.restored || normalized.includes("restored")) {
    return "restored";
  }

  if (payload.pending || normalized.includes("pending")) {
    return "pending";
  }

  if (normalized.includes("posted") || normalized.includes("booked") || normalized.includes("complete")) {
    return "posted";
  }

  return "unknown";
}

export function mapProviderAccountPayload(
  payload: ProviderAccountPayload,
  connection: Pick<BankConnection, "id" | "institutionId" | "institutionName">,
): ProviderAccount {
  const descriptor = [
    payload.subtype,
    payload.type,
    payload.accountType,
    payload.displayName,
    payload.name,
    payload.accountName,
    payload.productName,
    payload.officialName,
  ]
    .filter(Boolean)
    .join(" ");
  const accountType = mapAccountType(descriptor);
  const accountSubtype = mapAccountSubtype(accountType, descriptor);
  const rawBalance = numericValue(payload.balance ?? payload.currentBalance ?? 0);

  return {
    providerConnectionId: connection.id,
    providerAccountId:
      payload.providerAccountId ?? payload.accountId ?? payload.id ?? "provider_account_unknown",
    institutionName: payload.institution?.name ?? payload.providerName ?? connection.institutionName,
    institutionId: payload.institution?.id ?? connection.institutionId,
    name:
      payload.displayName ??
      payload.name ??
      payload.accountName ??
      payload.productName ??
      "Provider account",
    officialName:
      payload.officialName ??
      payload.name ??
      payload.accountName ??
      payload.productName ??
      "Provider account",
    type: accountType,
    subtype: accountSubtype,
    balance: normalizeBalanceForAccountType(accountType, rawBalance),
    availableBalance:
      payload.availableBalance === undefined ? null : Number(payload.availableBalance),
    creditLimit: payload.creditLimit ?? payload.details?.creditLimit ?? null,
    currency: (payload.currency ?? currencyValue(payload.balance) ?? "GBP") as CurrencyCode,
    mask: payload.mask ?? payload.number?.slice(-4) ?? null,
  };
}

export function mapProviderTransactionPayload(
  payload: ProviderTransactionPayload,
  providerConnectionId: string,
): ProviderTransaction {
  const description =
    payload.description ??
    payload.longDescription ??
    payload.transactionInformation ??
    payload.shortDescription ??
    "Provider transaction";
  const category =
    typeof payload.category === "string"
      ? payload.category
      : payload.category?.name ?? payload.categoryName ?? payload.categoryId ?? null;
  const providerStatus = normalizeProviderTransactionStatus(payload);
  const transferText =
    `${description} ${payload.merchant ?? ""} ${payload.counterpartyName ?? ""} ${category ?? ""} ${payload.proprietaryBankTransactionCode ?? ""} ${payload.proprietaryTransactionCode?.code ?? ""} ${payload.transactionCode?.code ?? ""} ${payload.transactionCode?.subCode ?? ""}`
      .toLowerCase();
  const transferHint =
    transferText.includes("transfer") ||
    transferText.includes("own account") ||
    transferText.includes("internal") ||
    transferText.includes("credit card repayment") ||
    transferText.includes("card repayment") ||
    transferText.includes("payment to credit card");

  return {
    id: `ptxn_${payload.id ?? payload.transactionId ?? crypto.randomUUID()}`,
    providerConnectionId,
    providerAccountId: payload.providerAccountId ?? payload.accountId ?? "provider_account_unknown",
    providerTransactionId: payload.transactionId ?? payload.id ?? "provider_transaction_unknown",
    date: (payload.date ?? payload.bookingDate ?? new Date().toISOString()).slice(0, 10),
    providerUpdatedAt: payload.dateModified ?? null,
    providerStatus,
    merchant: payload.merchant ?? payload.counterpartyName ?? payload.shortDescription ?? description,
    description,
    amount: numericValue(payload.amount ?? payload.value ?? 0),
    currency: (payload.currency ?? currencyValue(payload.amount) ?? "GBP") as CurrencyCode,
    pending: providerStatus === "pending",
    category,
    isOwnAccountTransfer: payload.isTransfer ?? transferHint,
  };
}

export function providerAccountToAccount(
  account: ProviderAccount,
  userId: string,
  provider: Account["provider"],
  now = new Date().toISOString(),
): Account {
  const suggestion = suggestAccountPurpose(account);

  return {
    id: `acct_${provider}_${account.providerAccountId}`.replaceAll(/[^a-zA-Z0-9_]/g, "_"),
    userId,
    providerConnectionId: account.providerConnectionId,
    providerAccountId: account.providerAccountId,
    institutionName: account.institutionName,
    institutionId: account.institutionId,
    name: account.name,
    officialName: account.officialName,
    type: account.type,
    subtype: account.subtype,
    currency: account.currency,
    balance: account.balance,
    availableBalance: account.availableBalance,
    creditLimit: account.creditLimit,
    mask: account.mask,
    purpose: suggestion.purpose,
    accountRole: suggestion.accountRole,
    includeInCashflow: suggestion.includeInCashflow,
    includeInNetWorth: suggestion.includeInNetWorth,
    includeInSafeToSpend: suggestion.includeInSafeToSpend,
    isSpendingAccount: suggestion.isSpendingAccount,
    isBillsAccount: suggestion.isBillsAccount,
    isSavingsAccount: suggestion.isSavingsAccount,
    linkedGoalIds: [],
    syncStatus: "connected",
    lastSyncedAt: now,
    consentExpiresAt: null,
    notes: `Mapped from provider sandbox payload. ${suggestion.reason}`,
    provider,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function transactionKind(amount: number, isOwnAccountTransfer: boolean): CategoryKind {
  if (isOwnAccountTransfer) {
    return "transfer";
  }

  return amount >= 0 ? "income" : "expense";
}

export function providerTransactionToTransaction(
  transaction: ProviderTransaction,
  accountId: string,
  categoryId = "cat_uncategorised",
  now = new Date().toISOString(),
): Transaction {
  const stableTransactionId = `txn_${transaction.providerConnectionId}_${accountId}_${transaction.providerTransactionId}`.replaceAll(
    /[^a-zA-Z0-9_]/g,
    "_",
  );

  return {
    id: stableTransactionId,
    accountId,
    categoryId,
    providerConnectionId: transaction.providerConnectionId,
    providerTransactionId: transaction.providerTransactionId,
    providerUpdatedAt: transaction.providerUpdatedAt,
    providerStatus: transaction.providerStatus ?? (transaction.pending ? "pending" : "posted"),
    providerDeletedAt: transaction.providerStatus === "deleted" ? now : null,
    providerRestoredAt: transaction.providerStatus === "restored" ? now : null,
    date: transaction.date,
    merchant: transaction.merchant,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    kind: transactionKind(transaction.amount, transaction.isOwnAccountTransfer),
    status: transaction.providerStatus === "deleted" ? "excluded" : transaction.pending ? "suggested" : "needs_review",
    flags: [
      ...(transaction.isOwnAccountTransfer ? ["own_account_transfer"] : []),
      ...(transaction.providerStatus === "deleted" ? ["provider_deleted"] : []),
    ],
    pending: transaction.pending,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function markProviderTransactionDeleted(
  existing: Transaction,
  now = new Date().toISOString(),
): Transaction {
  return {
    ...existing,
    providerStatus: "deleted",
    providerDeletedAt: now,
    providerRestoredAt: existing.providerRestoredAt ?? null,
    status: "excluded",
    flags: Array.from(
      new Set([
        ...existing.flags,
        "provider_deleted",
        ...(existing.status === "reviewed" ? ["provider_deleted_from_reviewed"] : []),
      ]),
    ),
    pending: false,
    updatedAt: now,
  };
}

export function markProviderTransactionRestored(
  existing: Transaction,
  incoming?: Transaction,
  now = new Date().toISOString(),
): Transaction {
  const restored = mergeSyncedTransaction(existing, {
    ...(incoming ?? existing),
    providerStatus: incoming?.providerStatus ?? "restored",
    providerDeletedAt: null,
    providerRestoredAt: now,
    flags: (incoming?.flags ?? existing.flags).filter(
      (flag) => flag !== "provider_deleted" && flag !== "provider_deleted_from_reviewed",
    ),
    status:
      existing.status === "reviewed" || existing.flags.includes("provider_deleted_from_reviewed")
        ? "reviewed"
        : incoming?.status ?? "needs_review",
    pending: false,
    updatedAt: now,
  });

  return {
    ...restored,
    providerStatus: "restored",
    providerDeletedAt: null,
    providerRestoredAt: now,
    flags: restored.flags.filter(
      (flag) => flag !== "provider_deleted" && flag !== "provider_deleted_from_reviewed",
    ),
    pending: false,
    updatedAt: now,
  };
}

export function mergeSyncedTransaction(
  existing: Transaction | null | undefined,
  incoming: Transaction,
): Transaction {
  if (!existing) {
    return incoming;
  }

  if (incoming.providerStatus === "deleted") {
    return markProviderTransactionDeleted(existing, incoming.updatedAt);
  }

  const hadReviewedOverride =
    existing.status === "reviewed" || existing.flags.includes("provider_deleted_from_reviewed");
  const preserveUserCategory =
    hadReviewedOverride &&
    existing.categoryId !== "cat_uncategorised" &&
    existing.categoryId !== incoming.categoryId;
  const preserveReviewedFields = hadReviewedOverride;
  const flags = Array.from(
    new Set([
      ...incoming.flags,
      ...existing.flags.filter((flag) => flag !== "provider_deleted" || incoming.providerStatus !== "restored"),
    ]),
  ).filter((flag) => !(incoming.providerStatus === "restored" && flag === "provider_deleted"));

  return {
    ...incoming,
    categoryId: preserveUserCategory ? existing.categoryId : incoming.categoryId,
    merchant: preserveReviewedFields ? existing.merchant : incoming.merchant,
    notes: preserveReviewedFields ? existing.notes ?? null : incoming.notes ?? null,
    status: hadReviewedOverride ? "reviewed" : incoming.status,
    flags,
    providerDeletedAt:
      incoming.providerStatus === "restored" ? null : incoming.providerDeletedAt ?? existing.providerDeletedAt ?? null,
    providerRestoredAt:
      incoming.providerStatus === "restored"
        ? incoming.providerRestoredAt ?? incoming.updatedAt
        : incoming.providerRestoredAt ?? existing.providerRestoredAt ?? null,
    pending: incoming.providerStatus === "posted" || incoming.providerStatus === "restored" ? false : incoming.pending,
    createdAt: existing.createdAt,
    updatedAt: incoming.updatedAt,
  };
}
