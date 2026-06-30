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
  reason: string;
};

function textFor(account: ProviderAccount) {
  return `${account.institutionName} ${account.institutionId} ${account.name} ${account.officialName} ${account.type} ${account.subtype}`.toLowerCase();
}

function defaultRoleForType(type: AccountType): AccountRole {
  if (type === "credit_card") {
    return "credit";
  }

  if (type === "loan") {
    return "loan";
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

  if (type === "cash") {
    return "cash";
  }

  return "spending";
}

function defaultPurposeForType(type: AccountType, subtype: AccountSubtype): AccountPurpose {
  if (type === "credit_card") {
    return "credit_card";
  }

  if (type === "loan") {
    return "loan_account";
  }

  if (type === "savings" || subtype === "pocket" || subtype === "vault") {
    return "short_term_savings";
  }

  if (type === "isa" || type === "investment") {
    return "investment";
  }

  if (type === "pension") {
    return "pension";
  }

  if (type === "cash") {
    return "cash";
  }

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

export function suggestAccountPurpose(account: ProviderAccount): AccountPurposeSuggestion {
  const text = textFor(account);
  const base = baseSuggestion(account);

  if (text.includes("american express") || text.includes("amex")) {
    return {
      ...base,
      purpose: "credit_card",
      accountRole: "credit",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
      reason: "American Express is treated as a credit card liability by default.",
    };
  }

  if (text.includes("nationwide")) {
    if (account.type === "savings") {
      return {
        ...base,
        purpose: "emergency_fund",
        accountRole: "savings",
        includeInCashflow: false,
        includeInSafeToSpend: false,
        isSpendingAccount: false,
        isSavingsAccount: true,
        reason: "Nationwide savings accounts are treated as ringfenced savings by default.",
      };
    }

    if (text.includes("bill")) {
      return {
        ...base,
        purpose: "bills_account",
        accountRole: "bills",
        includeInCashflow: true,
        includeInSafeToSpend: false,
        isSpendingAccount: false,
        isBillsAccount: true,
        reason: "Nationwide bills-style accounts are excluded from safe-to-spend by default.",
      };
    }

    return {
      ...base,
      purpose: "main_current_account",
      accountRole: "spending",
      includeInCashflow: true,
      includeInSafeToSpend: true,
      isSpendingAccount: true,
      reason: "Nationwide current accounts are suggested as main current accounts.",
    };
  }

  if (text.includes("revolut")) {
    if (account.type === "savings" || account.subtype === "pocket" || account.subtype === "vault") {
      return {
        ...base,
        purpose: "short_term_savings",
        accountRole: "savings",
        includeInCashflow: false,
        includeInSafeToSpend: false,
        isSpendingAccount: false,
        isSavingsAccount: true,
        reason: "Revolut pocket or vault-like balances are treated as short-term savings.",
      };
    }

    return {
      ...base,
      purpose: "everyday_spending",
      accountRole: "spending",
      includeInCashflow: true,
      includeInSafeToSpend: true,
      isSpendingAccount: true,
      reason: "Revolut current accounts are suggested as everyday spending accounts.",
    };
  }

  return base;
}
