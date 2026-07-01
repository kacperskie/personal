import type {
  Account,
  BudgetPeriod,
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
  if (override) {
    return {
      transactionId: transaction.id,
      includeInWeeklyBudget: override.includeInWeeklyBudget,
      includeInMonthlyBudget: override.includeInMonthlyBudget,
      includeInSpendingSummaries: override.includeInSpendingSummaries,
      includeInSafeToSpendImpact: override.includeInSafeToSpendImpact,
      budgetCategory: override.budgetCategory ?? transaction.categoryId,
      exclusionReason: override.exclusionReason ?? null,
      source: "user",
    };
  }

  const reason = deterministicExclusionReason(transaction, account);
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
    source: "deterministic",
  };
}

export function createTransactionBudgetOverride(input: {
  userId: string;
  transaction: Transaction;
  account?: Account | null;
  changes: Partial<
    Pick<
      TransactionBudgetOverride,
      | "includeInWeeklyBudget"
      | "includeInMonthlyBudget"
      | "includeInSpendingSummaries"
      | "includeInSafeToSpendImpact"
      | "budgetCategory"
      | "exclusionReason"
      | "userNote"
    >
  >;
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
    budgetCategory: input.changes.budgetCategory ?? defaults.budgetCategory,
    exclusionReason: input.changes.exclusionReason ?? defaults.exclusionReason,
    userNote: input.changes.userNote ?? input.existing?.userNote ?? null,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
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

export function amexFundingSummary(accounts: Account[]) {
  const amexLiabilities = accounts.filter((account) => {
    const text = `${account.institutionName} ${account.name} ${account.officialName}`.toLowerCase();
    return account.type === "credit_card" && (text.includes("amex") || text.includes("american express"));
  });
  const amexPockets = accounts.filter(
    (account) =>
      account.purpose === "pocket" &&
      account.reservedFor?.toLowerCase() === "amex" &&
      account.balance > 0,
  );
  const pocketBalance = amexPockets.reduce((total, account) => total + account.balance, 0);
  const liability = amexLiabilities[0] ?? null;
  const balanceKnown = liability ? liability.balanceAvailable !== false : false;
  const liabilityBalance =
    liability && balanceKnown ? Math.abs(Math.min(liability.balance, 0)) : null;
  const balanceSource = liability?.balanceSource ?? (balanceKnown ? "current" : "unavailable");

  return {
    liabilityAccountId: liability?.id ?? null,
    liabilityName: liability?.name ?? "Amex",
    balanceKnown,
    balanceSource,
    liabilityBalance,
    balanceUnavailableReason: liability?.balanceUnavailableReason ?? null,
    paymentDueDate: liability?.paymentDueDate ?? null,
    statementStartDate: liability?.statementStartDate ?? null,
    statementEndDate: liability?.statementEndDate ?? null,
    linkedPocketBalance: pocketBalance,
    fundedAmount: liabilityBalance === null ? null : Math.min(liabilityBalance, pocketBalance),
    unfundedAmount: liabilityBalance === null ? null : Math.max(liabilityBalance - pocketBalance, 0),
    pocketAccountIds: amexPockets.map((account) => account.id),
  };
}
