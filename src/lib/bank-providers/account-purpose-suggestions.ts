import { accountPurposeDefaults } from "@/lib/account-purpose";
import type {
  AccountPurpose,
  AccountRole,
  AccountSubtype,
  AccountType,
  ProviderAccount,
} from "@/lib/domain";

export type AccountPurposeSuggestion = {
  purpose: AccountPurpose;
  accountRole: AccountRole;
  includeInCashflow: boolean;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  isSpendingAccount: boolean;
  isBillsAccount: boolean;
  isSavingsAccount: boolean;
  reservedFor?: string | null;
  linkedLiabilityAccountId?: string | null;
  overdraftLimit?: number | null;
  overdraftRepaymentTarget?: number | null;
  reason: string;
};

function textFor(account: ProviderAccount) {
  return `${account.institutionName} ${account.institutionId} ${account.name} ${account.officialName} ${account.type} ${account.subtype}`.toLowerCase();
}

function defaultRoleForType(type: AccountType): AccountRole {
  if (type === "credit_card") return "credit";
  if (type === "loan") return "loan";
  if (type === "savings") return "savings";
  if (type === "isa" || type === "investment") return "investment";
  if (type === "pension") return "pension";
  if (type === "cash") return "cash";
  return "spending";
}

function defaultPurposeForType(type: AccountType, subtype: AccountSubtype): AccountPurpose {
  if (type === "credit_card") return "credit_card";
  if (type === "loan") return "loan_account";
  if (subtype === "pocket") return "pocket";
  if (type === "savings" || subtype === "vault") return "short_term_savings";
  if (type === "isa" || type === "investment") return "investment";
  if (type === "pension") return "pension";
  if (type === "cash") return "cash";
  return "main_current_account";
}

function baseSuggestion(account: ProviderAccount): AccountPurposeSuggestion {
  const accountRole = defaultRoleForType(account.type);
  const purpose = defaultPurposeForType(account.type, account.subtype);
  const isCurrent = account.type === "current_account";
  const isSavings =
    account.type === "savings" ||
    account.type === "isa" ||
    account.subtype === "pocket" ||
    account.subtype === "vault";

  return {
    purpose,
    accountRole,
    includeInCashflow: isCurrent || account.type === "credit_card" || account.type === "loan",
    includeInNetWorth: true,
    includeInSafeToSpend: isCurrent,
    isSpendingAccount: isCurrent,
    isBillsAccount: false,
    isSavingsAccount: isSavings,
    reason: "Defaulted from provider account type.",
  };
}

function purposeSuggestion(
  purpose: AccountPurpose,
  reason: string,
  extras: Partial<AccountPurposeSuggestion> = {},
): AccountPurposeSuggestion {
  return {
    purpose,
    ...accountPurposeDefaults(purpose),
    reason,
    ...extras,
  };
}

export function suggestAccountPurpose(account: ProviderAccount): AccountPurposeSuggestion {
  const text = textFor(account);
  const base = baseSuggestion(account);

  if (account.subtype === "pocket") {
    return purposeSuggestion("pocket", "Pockets hold reserved money and are excluded from safe-to-spend.", {
      reservedFor: text.includes("amex") || text.includes("american express") ? "amex" : null,
    });
  }

  if (
    account.type === "credit_card" ||
    text.includes("american express") ||
    text.includes("amex")
  ) {
    return purposeSuggestion(
      "credit_card",
      "Card providers and American Express are treated as credit card liabilities by default.",
    );
  }

  if (
    account.type === "current_account" &&
    (account.balance < 0 ||
      text.includes("overdraft") ||
      text.includes("graduate") ||
      text.includes("grad account"))
  ) {
    return purposeSuggestion(
      "overdraft_account",
      "Current accounts with an overdraft signal are excluded from safe-to-spend and tracked as overdraft debt.",
      {
        overdraftLimit: account.creditLimit,
      },
    );
  }

  if (text.includes("nationwide")) {
    if (account.type === "savings") {
      return purposeSuggestion(
        "emergency_fund",
        "Nationwide savings accounts are treated as ringfenced savings by default.",
      );
    }

    if (text.includes("bill")) {
      return purposeSuggestion(
        "bills_account",
        "Nationwide bills-style accounts are excluded from safe-to-spend by default.",
      );
    }

    return purposeSuggestion(
      "main_current_account",
      "Nationwide current accounts are suggested as main current accounts.",
    );
  }

  if (text.includes("revolut")) {
    if (account.type === "savings" || account.subtype === "vault") {
      return purposeSuggestion(
        "short_term_savings",
        "Revolut vault-like balances are treated as short-term savings.",
      );
    }

    return purposeSuggestion(
      "everyday_spending",
      "Revolut current accounts are suggested as everyday spending accounts.",
    );
  }

  return base;
}
