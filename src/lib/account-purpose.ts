import type { Account, AccountPurpose, AccountRole } from "@/lib/domain";

export type AccountPurposeDefaults = {
  accountRole: AccountRole;
  includeInCashflow: boolean;
  includeInNetWorth: boolean;
  includeInSafeToSpend: boolean;
  isSpendingAccount: boolean;
  isBillsAccount: boolean;
  isSavingsAccount: boolean;
};

export const accountPurposeLabels: Record<AccountPurpose, string> = {
  main_current_account: "Main current account",
  everyday_spending: "Everyday spending",
  bills_account: "Bills account",
  overdraft_account: "Overdraft/current account",
  credit_card: "Credit card",
  pocket: "Pocket/reserved pot",
  savings: "Savings",
  emergency_fund: "Emergency fund",
  short_term_savings: "Short-term savings",
  holiday_fund: "Holiday fund",
  pet_fund: "Pet fund",
  house_deposit: "House deposit",
  loan_account: "Loan account",
  pension: "Pension",
  investment: "Investment",
  cash: "Cash",
  offline_account: "Offline account",
  ignore: "Ignore/excluded",
  other: "Other",
};

export function accountPurposeDefaults(purpose: AccountPurpose): AccountPurposeDefaults {
  if (purpose === "everyday_spending" || purpose === "main_current_account") {
    return {
      accountRole: "spending",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: true,
      isSpendingAccount: true,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (purpose === "bills_account") {
    return {
      accountRole: "bills",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: true,
      isSavingsAccount: false,
    };
  }

  if (purpose === "overdraft_account" || purpose === "credit_card") {
    return {
      accountRole: "credit",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (
    purpose === "pocket" ||
    purpose === "savings" ||
    purpose === "emergency_fund" ||
    purpose === "short_term_savings" ||
    purpose === "holiday_fund" ||
    purpose === "pet_fund" ||
    purpose === "house_deposit"
  ) {
    return {
      accountRole: "savings",
      includeInCashflow: false,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: true,
    };
  }

  if (purpose === "loan_account") {
    return {
      accountRole: "loan",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (purpose === "pension") {
    return {
      accountRole: "pension",
      includeInCashflow: false,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (purpose === "investment") {
    return {
      accountRole: "investment",
      includeInCashflow: false,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (purpose === "cash") {
    return {
      accountRole: "cash",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: true,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  if (purpose === "offline_account") {
    return {
      accountRole: "offline",
      includeInCashflow: true,
      includeInNetWorth: true,
      includeInSafeToSpend: false,
      isSpendingAccount: false,
      isBillsAccount: false,
      isSavingsAccount: false,
    };
  }

  return {
    accountRole: "other",
    includeInCashflow: false,
    includeInNetWorth: purpose !== "ignore",
    includeInSafeToSpend: false,
    isSpendingAccount: false,
    isBillsAccount: false,
    isSavingsAccount: false,
  };
}

export function applyAccountPurpose(account: Account, purpose: AccountPurpose): Account {
  return {
    ...account,
    purpose,
    ...accountPurposeDefaults(purpose),
  };
}
