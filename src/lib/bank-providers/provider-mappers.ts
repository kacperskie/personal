import type {
  Account,
  AccountPurpose,
  AccountRole,
  AccountSubtype,
  AccountType,
  BankConnection,
  CategoryKind,
  CurrencyCode,
  ProviderAccount,
  ProviderTransaction,
  Transaction,
} from "@/lib/domain";

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
  balance?: number | { amount?: number; value?: number };
  currentBalance?: number;
  availableBalance?: number;
  creditLimit?: number | null;
  currency?: string;
  mask?: string | null;
  number?: string | null;
};

export type ProviderTransactionPayload = {
  id?: string;
  transactionId?: string;
  accountId?: string;
  providerAccountId?: string;
  date?: string;
  bookingDate?: string;
  description?: string;
  longDescription?: string;
  merchant?: string;
  counterpartyName?: string;
  amount?: number | { amount?: number; value?: number };
  value?: number;
  currency?: string;
  status?: string;
  pending?: boolean;
  category?: string | { name?: string };
  isTransfer?: boolean;
  proprietaryBankTransactionCode?: string;
};

function numericValue(value: ProviderAccountPayload["balance"] | ProviderTransactionPayload["amount"]) {
  if (typeof value === "number") {
    return value;
  }

  return value?.amount ?? value?.value ?? 0;
}

function mapAccountType(value?: string): AccountType {
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("credit")) {
    return "credit_card";
  }

  if (normalized.includes("saving") || normalized.includes("saver")) {
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

  if (normalized.includes("loan")) {
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

function purposeForType(type: AccountType): AccountPurpose {
  if (type === "credit_card") {
    return "credit_card";
  }

  if (type === "savings") {
    return "short_term_savings";
  }

  if (type === "isa" || type === "investment") {
    return "investment";
  }

  if (type === "pension") {
    return "pension";
  }

  if (type === "loan") {
    return "loan_account";
  }

  return "main_current_account";
}

function roleForType(type: AccountType): AccountRole {
  if (type === "credit_card") {
    return "credit";
  }

  if (type === "savings") {
    return "savings";
  }

  if (type === "isa" || type === "investment") {
    return "investment";
  }

  if (type === "pension") {
    return "pension";
  }

  if (type === "loan") {
    return "loan";
  }

  return "spending";
}

function normalizeBalanceForAccountType(type: AccountType, balance: number) {
  if (type === "credit_card" && balance > 0) {
    return -balance;
  }

  return balance;
}

export function mapProviderAccountPayload(
  payload: ProviderAccountPayload,
  connection: Pick<BankConnection, "id" | "institutionId" | "institutionName">,
): ProviderAccount {
  const accountType = mapAccountType(payload.type ?? payload.accountType);
  const accountSubtype = mapAccountSubtype(accountType, payload.subtype ?? payload.type);
  const rawBalance = numericValue(payload.balance ?? payload.currentBalance ?? 0);

  return {
    providerConnectionId: connection.id,
    providerAccountId:
      payload.providerAccountId ?? payload.accountId ?? payload.id ?? "provider_account_unknown",
    institutionName: payload.institution?.name ?? payload.providerName ?? connection.institutionName,
    institutionId: payload.institution?.id ?? connection.institutionId,
    name: payload.displayName ?? payload.name ?? payload.accountName ?? "Provider account",
    officialName:
      payload.officialName ?? payload.name ?? payload.accountName ?? "Provider account",
    type: accountType,
    subtype: accountSubtype,
    balance: normalizeBalanceForAccountType(accountType, rawBalance),
    availableBalance:
      payload.availableBalance === undefined ? null : Number(payload.availableBalance),
    creditLimit: payload.creditLimit ?? null,
    currency: (payload.currency ?? "GBP") as CurrencyCode,
    mask: payload.mask ?? payload.number?.slice(-4) ?? null,
  };
}

export function mapProviderTransactionPayload(
  payload: ProviderTransactionPayload,
  providerConnectionId: string,
): ProviderTransaction {
  const description = payload.description ?? payload.longDescription ?? "Provider transaction";
  const category =
    typeof payload.category === "string" ? payload.category : payload.category?.name ?? null;
  const transferHint = `${description} ${category ?? ""} ${payload.proprietaryBankTransactionCode ?? ""}`
    .toLowerCase()
    .includes("transfer");

  return {
    id: `ptxn_${payload.id ?? payload.transactionId ?? crypto.randomUUID()}`,
    providerConnectionId,
    providerAccountId: payload.providerAccountId ?? payload.accountId ?? "provider_account_unknown",
    providerTransactionId: payload.transactionId ?? payload.id ?? "provider_transaction_unknown",
    date: (payload.date ?? payload.bookingDate ?? new Date().toISOString()).slice(0, 10),
    merchant: payload.merchant ?? payload.counterpartyName ?? description,
    description,
    amount: numericValue(payload.amount ?? payload.value ?? 0),
    currency: (payload.currency ?? "GBP") as CurrencyCode,
    pending: payload.pending ?? payload.status === "pending",
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
  const role = roleForType(account.type);
  const purpose = purposeForType(account.type);

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
    purpose,
    accountRole: role,
    includeInCashflow: account.type === "current_account" || account.type === "credit_card",
    includeInNetWorth: true,
    includeInSafeToSpend: account.type === "current_account",
    isSpendingAccount: account.type === "current_account",
    isBillsAccount: false,
    isSavingsAccount: account.type === "savings" || account.type === "isa",
    linkedGoalIds: [],
    syncStatus: "connected",
    lastSyncedAt: now,
    consentExpiresAt: null,
    notes: "Mapped from provider sandbox payload.",
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
  return {
    id: `txn_${transaction.providerTransactionId}`.replaceAll(/[^a-zA-Z0-9_]/g, "_"),
    accountId,
    categoryId,
    date: transaction.date,
    merchant: transaction.merchant,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    kind: transactionKind(transaction.amount, transaction.isOwnAccountTransfer),
    status: transaction.pending ? "suggested" : "needs_review",
    flags: transaction.isOwnAccountTransfer ? ["own_account_transfer"] : [],
    createdAt: now,
    updatedAt: now,
  };
}
