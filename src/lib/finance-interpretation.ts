import type {
  Account,
  BudgetPeriod,
  CreditCardBalanceSummary,
  Transaction,
  TransactionBudgetExclusionReason,
  TransactionBudgetOverride,
} from "@/lib/domain";

export type TransactionBudgetTreatment = {
  transactionId: string;
  includeInWeeklyBudget: boolean;
  includeInMonthlyBudget: boolean;
  includeInSpendingSummaries: boolean;
  includeInSafeToSpendImpact: boolean;
  budgetCategory: string | null;
  exclusionReason: TransactionBudgetExclusionReason | null;
  reviewed: boolean;
  source: "deterministic" | "user";
};

export type TransactionQuickAction =
  | "include"
  | "exclude_weekly"
  | "exclude_monthly"
  | "exclude_both"
  | "internal_transfer"
  | "amex_payment"
  | "amex_pocket_transfer"
  | "bill"
  | "savings_transfer"
  | "ignored";

export type TransactionBudgetOverrideChanges = Partial<
  Pick<
    TransactionBudgetOverride,
    | "includeInWeeklyBudget"
    | "includeInMonthlyBudget"
    | "includeInSpendingSummaries"
    | "includeInSafeToSpendImpact"
    | "includeInCreditCardBalanceEstimate"
    | "budgetCategory"
    | "exclusionReason"
    | "userNote"
    | "reviewed"
  >
>;

/**
 * Deterministic change-set for a row/bulk quick action. Pure and exported so the
 * server actions and tests share one source of truth. Marking a role also marks
 * the transaction reviewed (the user made an explicit decision).
 */
export function budgetOverrideChangesForAction(
  action: TransactionQuickAction,
): TransactionBudgetOverrideChanges {
  const map: Record<TransactionQuickAction, TransactionBudgetOverrideChanges> = {
    include: {
      includeInWeeklyBudget: true,
      includeInMonthlyBudget: true,
      includeInSpendingSummaries: true,
      includeInSafeToSpendImpact: true,
      includeInCreditCardBalanceEstimate: true,
      exclusionReason: null,
      reviewed: true,
    },
    exclude_weekly: { includeInWeeklyBudget: false, reviewed: true },
    exclude_monthly: { includeInMonthlyBudget: false, reviewed: true },
    exclude_both: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "ignored",
      reviewed: true,
    },
    internal_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "internal_transfer",
      reviewed: true,
    },
    amex_payment: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      includeInCreditCardBalanceEstimate: true,
      exclusionReason: "credit_card_payment",
      reviewed: true,
    },
    amex_pocket_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "amex_pocket_transfer",
      reviewed: true,
    },
    bill: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: true,
      includeInSpendingSummaries: true,
      includeInSafeToSpendImpact: true,
      exclusionReason: "bill",
      reviewed: true,
    },
    savings_transfer: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "savings_transfer",
      reviewed: true,
    },
    ignored: {
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      exclusionReason: "ignored",
      reviewed: true,
    },
  };
  return map[action];
}

export type CreditCardTransactionEstimateTreatment = {
  transactionId: string;
  includeInEstimate: boolean;
  direction: "increase" | "payment" | "refund" | "fee" | "ignore";
  amount: number;
  reason: string;
  source: "deterministic" | "user";
};

function textFor(transaction: Transaction, account?: Account | null) {
  return [
    transaction.merchant,
    transaction.description,
    transaction.categoryId,
    transaction.kind,
    ...(transaction.flags ?? []),
    account?.name,
    account?.officialName,
    account?.institutionName,
    account?.purpose,
    account?.reservedFor,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isExpense(transaction: Transaction) {
  return transaction.amount < 0 && transaction.kind === "expense";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normaliseText(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

export function isCreditCardAccount(account: Account | null | undefined) {
  return Boolean(
    account &&
      (account.type === "credit_card" ||
        account.subtype === "credit_card" ||
        account.subtype === "charge_card" ||
        account.purpose === "credit_card"),
  );
}

export function isAmexAccount(account: Account | null | undefined) {
  if (!account) return false;
  const cardTyped =
    account.type === "credit_card" ||
    account.subtype === "credit_card" ||
    account.subtype === "charge_card";
  const text = normaliseText(
    `${account.institutionName} ${account.name} ${account.officialName} ${account.provider}`,
  );
  return cardTyped && (text.includes("amex") || text.includes("american express"));
}

function isBillLike(text: string) {
  return (
    text.includes("direct debit") ||
    text.includes("standing order") ||
    text.includes("bill") ||
    text.includes("subscription") ||
    text.includes("rent") ||
    text.includes("council tax") ||
    text.includes("utilities") ||
    text.includes("utility") ||
    text.includes("insurance")
  );
}

function deterministicExclusionReason(
  transaction: Transaction,
  account?: Account | null,
): TransactionBudgetExclusionReason | null {
  const text = textFor(transaction, account);

  if (transaction.amount > 0 && text.includes("refund")) {
    return "refund";
  }

  if (text.includes("amex") && text.includes("pocket")) {
    return "amex_pocket_transfer";
  }

  if (transaction.flags.includes("own_account_transfer") || transaction.kind === "transfer") {
    return "internal_transfer";
  }

  if (
    text.includes("american express") ||
    text.includes("amex payment") ||
    text.includes("credit card repayment") ||
    text.includes("card repayment")
  ) {
    return "credit_card_payment";
  }

  if (text.includes("savings") || text.includes("vault") || text.includes("pot transfer")) {
    return "savings_transfer";
  }

  if (text.includes("loan") || text.includes("debt") || text.includes("overdraft repayment")) {
    return "debt_payment";
  }

  if (isBillLike(text)) {
    return text.includes("rent") ? "rent" : "bill";
  }

  return null;
}

export function getTransactionBudgetTreatment(
  transaction: Transaction,
  account?: Account | null,
  override?: TransactionBudgetOverride | null,
): TransactionBudgetTreatment {
  const transactionReviewed = transaction.status === "reviewed";

  if (override) {
    return {
      transactionId: transaction.id,
      includeInWeeklyBudget: override.includeInWeeklyBudget,
      includeInMonthlyBudget: override.includeInMonthlyBudget,
      includeInSpendingSummaries: override.includeInSpendingSummaries,
      includeInSafeToSpendImpact: override.includeInSafeToSpendImpact,
      budgetCategory: override.budgetCategory ?? transaction.categoryId,
      exclusionReason: override.exclusionReason ?? null,
      reviewed: override.reviewed ?? transactionReviewed,
      source: "user",
    };
  }

  const reason = deterministicExclusionReason(transaction, account);
  const pending = transaction.pending || transaction.providerStatus === "pending";
  if (pending) {
    return {
      transactionId: transaction.id,
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: isExpense(transaction),
      budgetCategory: transaction.categoryId,
      exclusionReason: null,
      reviewed: transactionReviewed,
      source: "deterministic",
    };
  }

  const ordinarySpend = isExpense(transaction) && !reason;
  const bill = reason === "bill" || reason === "rent";

  return {
    transactionId: transaction.id,
    includeInWeeklyBudget: ordinarySpend,
    includeInMonthlyBudget: ordinarySpend || bill,
    includeInSpendingSummaries: ordinarySpend || bill,
    includeInSafeToSpendImpact: ordinarySpend || bill,
    budgetCategory: transaction.categoryId,
    exclusionReason: reason,
    reviewed: transactionReviewed,
    source: "deterministic",
  };
}

export function createTransactionBudgetOverride(input: {
  userId: string;
  transaction: Transaction;
  account?: Account | null;
  changes: TransactionBudgetOverrideChanges;
  existing?: TransactionBudgetOverride | null;
  now?: string;
}): TransactionBudgetOverride {
  const now = input.now ?? new Date().toISOString();
  const defaults = getTransactionBudgetTreatment(
    input.transaction,
    input.account,
    input.existing ?? null,
  );

  return {
    id: input.existing?.id ?? `txbo_${input.transaction.id}`,
    userId: input.userId,
    transactionId: input.transaction.id,
    accountId: input.transaction.accountId,
    includeInWeeklyBudget:
      input.changes.includeInWeeklyBudget ?? defaults.includeInWeeklyBudget,
    includeInMonthlyBudget:
      input.changes.includeInMonthlyBudget ?? defaults.includeInMonthlyBudget,
    includeInSpendingSummaries:
      input.changes.includeInSpendingSummaries ?? defaults.includeInSpendingSummaries,
    includeInSafeToSpendImpact:
      input.changes.includeInSafeToSpendImpact ?? defaults.includeInSafeToSpendImpact,
    includeInCreditCardBalanceEstimate:
      input.changes.includeInCreditCardBalanceEstimate ??
      input.existing?.includeInCreditCardBalanceEstimate,
    budgetCategory: input.changes.budgetCategory ?? defaults.budgetCategory,
    exclusionReason: input.changes.exclusionReason ?? defaults.exclusionReason,
    userNote: input.changes.userNote ?? input.existing?.userNote ?? null,
    reviewed: input.changes.reviewed ?? input.existing?.reviewed ?? defaults.reviewed,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function getCreditCardTransactionEstimateTreatment(
  transaction: Transaction,
  account?: Account | null,
  override?: TransactionBudgetOverride | null,
): CreditCardTransactionEstimateTreatment {
  if (!isCreditCardAccount(account)) {
    return {
      transactionId: transaction.id,
      includeInEstimate: false,
      direction: "ignore",
      amount: 0,
      reason: "not_credit_card_account",
      source: override?.includeInCreditCardBalanceEstimate === false ? "user" : "deterministic",
    };
  }

  const text = textFor(transaction, account);
  const pending = transaction.pending || transaction.providerStatus === "pending";
  const deleted = transaction.providerStatus === "deleted";
  const duplicate = text.includes("duplicate") || transaction.flags.includes("duplicate");
  const userExcluded = override?.includeInCreditCardBalanceEstimate === false;

  if (pending || deleted || duplicate || userExcluded) {
    return {
      transactionId: transaction.id,
      includeInEstimate: false,
      direction: "ignore",
      amount: 0,
      reason: userExcluded
        ? "manual_exclusion"
        : pending
          ? "pending"
          : deleted
            ? "provider_deleted"
            : "duplicate",
      source: userExcluded ? "user" : "deterministic",
    };
  }

  const amount = Math.abs(transaction.amount);

  if (transaction.amount < 0) {
    const fee =
      text.includes("fee") ||
      text.includes("interest") ||
      text.includes("cash advance") ||
      text.includes("cash withdrawal");

    return {
      transactionId: transaction.id,
      includeInEstimate: true,
      direction: fee ? "fee" : "increase",
      amount,
      reason: fee ? "fee_or_interest" : "purchase",
      source: override?.includeInCreditCardBalanceEstimate === true ? "user" : "deterministic",
    };
  }

  if (transaction.amount > 0) {
    const refund =
      text.includes("refund") ||
      text.includes("chargeback") ||
      text.includes("statement credit") ||
      (text.includes("credit") && !text.includes("credit card"));

    return {
      transactionId: transaction.id,
      includeInEstimate: true,
      direction: refund ? "refund" : "payment",
      amount,
      reason: refund ? "refund_or_credit" : "payment",
      source: override?.includeInCreditCardBalanceEstimate === true ? "user" : "deterministic",
    };
  }

  return {
    transactionId: transaction.id,
    includeInEstimate: true,
    direction: "ignore",
    amount: 0,
    reason: "zero_amount",
    source: override?.includeInCreditCardBalanceEstimate === true ? "user" : "deterministic",
  };
}

function providerCurrentLiability(account: Account) {
  if (
    account.balanceAvailable === false ||
    account.balanceSource === "statement" ||
    account.balanceSource === "unavailable"
  ) {
    return null;
  }

  if (account.currentBalance !== null && account.currentBalance !== undefined) {
    return Math.abs(Number(account.currentBalance));
  }

  return Math.abs(Math.min(account.balance, 0));
}

function providerStatementLiability(account: Account) {
  if (account.statementBalance !== null && account.statementBalance !== undefined) {
    return Math.abs(Number(account.statementBalance));
  }

  if (account.balanceSource === "statement" && account.balanceAvailable !== false) {
    return Math.abs(account.balance);
  }

  return null;
}

export function calculateCreditCardBalanceSummary(input: {
  account: Account;
  transactions: Transaction[];
  overrides?: TransactionBudgetOverride[];
  calculatedAt?: string;
}): CreditCardBalanceSummary {
  const { account } = input;
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const providerCurrentBalance = providerCurrentLiability(account);
  const providerStatementBalance = providerStatementLiability(account);
  const baseSummary = {
    accountId: account.id,
    providerCurrentBalance,
    providerStatementBalance,
    statementStartDate: account.statementStartDate ?? null,
    statementEndDate: account.statementEndDate ?? null,
    paymentDueDate: account.paymentDueDate ?? null,
    manualAnchorBalance: account.manualAnchorBalance ?? null,
    manualAnchorDate: account.manualAnchorDate ?? null,
    postStatementPurchases: 0,
    postStatementPayments: 0,
    postStatementRefunds: 0,
    postStatementFees: 0,
    transactionsIncludedCount: 0,
    transactionsExcludedCount: 0,
    calculatedAt,
  };

  if (providerCurrentBalance !== null) {
    return {
      ...baseSummary,
      estimatedCurrentBalance: null,
      balanceUsedForPlanning: roundMoney(providerCurrentBalance),
      balanceSource: "provider_current",
      confidence: "confirmed",
    };
  }

  const hasStatementAnchor =
    providerStatementBalance !== null && Boolean(account.statementEndDate);
  const hasManualAnchor =
    !hasStatementAnchor &&
    account.manualAnchorBalance !== null &&
    account.manualAnchorBalance !== undefined &&
    Boolean(account.manualAnchorDate);
  const anchorBalance = hasStatementAnchor
    ? providerStatementBalance
    : hasManualAnchor
      ? Math.abs(Number(account.manualAnchorBalance))
      : null;
  const anchorDate = hasStatementAnchor ? account.statementEndDate : account.manualAnchorDate;

  if (anchorBalance === null || !anchorDate) {
    return {
      ...baseSummary,
      estimatedCurrentBalance: null,
      balanceUsedForPlanning: null,
      balanceSource: "unavailable",
      confidence: "unavailable",
    };
  }

  const overrideByTransactionId = new Map(
    (input.overrides ?? []).map((override) => [override.transactionId, override]),
  );
  let purchases = 0;
  let payments = 0;
  let refunds = 0;
  let fees = 0;
  let included = 0;
  let excluded = 0;

  input.transactions
    .filter((transaction) => transaction.accountId === account.id && transaction.date > anchorDate)
    .forEach((transaction) => {
      const treatment = getCreditCardTransactionEstimateTreatment(
        transaction,
        account,
        overrideByTransactionId.get(transaction.id) ?? null,
      );

      if (!treatment.includeInEstimate) {
        excluded += 1;
        return;
      }

      included += 1;
      if (treatment.direction === "fee") {
        fees += treatment.amount;
      } else if (treatment.direction === "increase") {
        purchases += treatment.amount;
      } else if (treatment.direction === "payment") {
        payments += treatment.amount;
      } else if (treatment.direction === "refund") {
        refunds += treatment.amount;
      }
    });

  const estimated = Math.max(0, roundMoney(anchorBalance + purchases + fees - payments - refunds));

  return {
    ...baseSummary,
    postStatementPurchases: roundMoney(purchases),
    postStatementPayments: roundMoney(payments),
    postStatementRefunds: roundMoney(refunds),
    postStatementFees: roundMoney(fees),
    transactionsIncludedCount: included,
    transactionsExcludedCount: excluded,
    estimatedCurrentBalance: estimated,
    balanceUsedForPlanning: estimated,
    balanceSource: hasStatementAnchor
      ? "provider_statement_estimate"
      : "manual_anchor_estimate",
    confidence: "estimated",
  };
}

export function buildCreditCardBalanceSummaries(
  accounts: Account[],
  transactions: Transaction[],
  overrides: TransactionBudgetOverride[] = [],
  calculatedAt?: string,
) {
  return accounts
    .filter((account) => account.status === "active" && isCreditCardAccount(account))
    .map((account) =>
      calculateCreditCardBalanceSummary({ account, transactions, overrides, calculatedAt }),
    );
}

export function applyCreditCardPlanningBalances(
  accounts: Account[],
  summaries: CreditCardBalanceSummary[],
) {
  const summaryByAccountId = new Map(summaries.map((summary) => [summary.accountId, summary]));

  return accounts.map((account) => {
    const summary = summaryByAccountId.get(account.id);
    if (!summary || summary.balanceUsedForPlanning === null) {
      return account;
    }

    return {
      ...account,
      balance: -summary.balanceUsedForPlanning,
      balanceAvailable: summary.confidence !== "unavailable",
      balanceSource:
        summary.balanceSource === "provider_current"
          ? "current"
          : summary.balanceSource === "unavailable"
            ? "unavailable"
            : "statement",
      currentBalance:
        summary.balanceSource === "provider_current"
          ? summary.balanceUsedForPlanning
          : account.currentBalance ?? null,
    } satisfies Account;
  });
}

export function filterTransactionsForBudget(
  transactions: Transaction[],
  accounts: Account[],
  overrides: TransactionBudgetOverride[],
  mode: "weekly" | "monthly" | "summaries" = "monthly",
) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const overrideByTransactionId = new Map(
    overrides.map((override) => [override.transactionId, override]),
  );

  return transactions.filter((transaction) => {
    const treatment = getTransactionBudgetTreatment(
      transaction,
      accountById.get(transaction.accountId),
      overrideByTransactionId.get(transaction.id),
    );

    if (mode === "weekly") return treatment.includeInWeeklyBudget;
    if (mode === "summaries") return treatment.includeInSpendingSummaries;
    return treatment.includeInMonthlyBudget;
  });
}

export function calculateBudgetTotal(
  transactions: Transaction[],
  accounts: Account[],
  overrides: TransactionBudgetOverride[],
  period: BudgetPeriod,
  mode: "weekly" | "monthly" | "summaries",
) {
  return filterTransactionsForBudget(transactions, accounts, overrides, mode)
    .filter(
      (transaction) =>
        transaction.amount < 0 &&
        transaction.date >= period.startDate &&
        transaction.date <= period.endDate,
    )
    .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
}

export function exclusionCountsByReason(
  transactions: Transaction[],
  accounts: Account[],
  overrides: TransactionBudgetOverride[],
  mode: "weekly" | "monthly" = "weekly",
) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const overrideByTransactionId = new Map(
    overrides.map((override) => [override.transactionId, override]),
  );
  const counts: Record<string, number> = {};

  transactions.forEach((transaction) => {
    const treatment = getTransactionBudgetTreatment(
      transaction,
      accountById.get(transaction.accountId),
      overrideByTransactionId.get(transaction.id),
    );
    const included =
      mode === "weekly" ? treatment.includeInWeeklyBudget : treatment.includeInMonthlyBudget;

    if (!included) {
      const key = treatment.exclusionReason ?? "other";
      counts[key] = (counts[key] ?? 0) + 1;
    }
  });

  return counts;
}

export function amexFundingSummary(
  accounts: Account[],
  transactions: Transaction[] = [],
  overrides: TransactionBudgetOverride[] = [],
  calculatedAt?: string,
) {
  const amexLiabilities = accounts.filter((account) => {
    return isAmexAccount(account);
  });
  const amexPockets = accounts.filter(
    (account) =>
      account.purpose === "pocket" &&
      account.reservedFor?.toLowerCase() === "amex" &&
      account.balance > 0,
  );
  const pocketBalance = amexPockets.reduce((total, account) => total + account.balance, 0);
  const liability = amexLiabilities[0] ?? null;
  const balanceSummary = liability
    ? calculateCreditCardBalanceSummary({
        account: liability,
        transactions,
        overrides,
        calculatedAt,
      })
    : null;
  const liabilityBalance = balanceSummary?.balanceUsedForPlanning ?? null;
  const balanceKnown = liabilityBalance !== null;

  return {
    liabilityAccountId: liability?.id ?? null,
    liabilityName: liability?.name ?? "Amex",
    balanceKnown,
    balanceSource: balanceSummary?.balanceSource ?? "unavailable",
    confidence: balanceSummary?.confidence ?? "unavailable",
    liabilityBalance,
    balanceUnavailableReason: liability?.balanceUnavailableReason ?? null,
    paymentDueDate: liability?.paymentDueDate ?? null,
    statementStartDate: liability?.statementStartDate ?? null,
    statementEndDate: liability?.statementEndDate ?? null,
    balanceSummary,
    linkedPocketBalance: pocketBalance,
    fundedAmount: liabilityBalance === null ? null : Math.min(liabilityBalance, pocketBalance),
    unfundedAmount: liabilityBalance === null ? null : Math.max(liabilityBalance - pocketBalance, 0),
    excessReserved: liabilityBalance === null ? null : Math.max(pocketBalance - liabilityBalance, 0),
    pocketAccountIds: amexPockets.map((account) => account.id),
  };
}
