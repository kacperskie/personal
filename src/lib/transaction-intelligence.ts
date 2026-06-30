import type {
  Account,
  AppNotification,
  Bill,
  BudgetPeriod,
  CashflowEvent,
  DetectedBill,
  DetectedSubscription,
  FinanceCategory,
  ManualFinanceItem,
  MerchantRule,
  RecurringPaymentCandidate,
  RecurringPaymentCandidateType,
  RecurrenceFrequency,
  SpendingAnomaly,
  Subscription,
  Transaction,
  TransactionEnrichment,
} from "@/lib/domain";
import { calculateSafeToSpendAmount } from "@/lib/finance";
import { formatCurrency } from "@/lib/format";
import { getPrivacySafeNotificationCopy } from "@/lib/notifications";

export const financeCategories: FinanceCategory[] = [
  "income",
  "rent_or_mortgage",
  "council_tax",
  "utilities",
  "groceries",
  "eating_out",
  "transport",
  "subscriptions",
  "entertainment",
  "shopping",
  "pets",
  "health",
  "insurance",
  "savings",
  "debt_repayment",
  "transfers",
  "cash_withdrawal",
  "fees",
  "other",
];

const subscriptionMerchants = [
  "spotify",
  "netflix",
  "disney",
  "prime",
  "amazon prime",
  "apple",
  "google",
  "icloud",
  "dropbox",
  "xbox",
  "playstation",
  "gym",
  "membership",
  "magazine",
];

const billKeywords = [
  "rent",
  "mortgage",
  "council",
  "tax",
  "energy",
  "water",
  "broadband",
  "mobile",
  "insurance",
  "loan",
  "direct debit",
  "standing order",
];

const transferKeywords = [
  "transfer",
  "own account",
  "internal",
  "revolut transfer",
  "amex payment",
  "american express payment",
  "credit card repayment",
  "payment to credit card",
  "savings",
];

export const defaultMerchantRules: MerchantRule[] = [
  {
    id: "rule_amazon_marketplace",
    userId: "user_mock_001",
    matchPattern: "amznmktplace",
    normalisedMerchantName: "Amazon",
    merchantGroup: "Amazon",
    category: "shopping",
    subcategory: "marketplace",
    priority: 10,
    status: "active",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  },
  {
    id: "rule_amazon_prime",
    userId: "user_mock_001",
    matchPattern: "amazon prime",
    normalisedMerchantName: "Amazon Prime",
    merchantGroup: "Amazon",
    category: "subscriptions",
    subcategory: "streaming",
    priority: 5,
    status: "active",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  },
  {
    id: "rule_spotify_paypal",
    userId: "user_mock_001",
    matchPattern: "spotify",
    normalisedMerchantName: "Spotify",
    merchantGroup: "Spotify",
    category: "subscriptions",
    subcategory: "streaming",
    priority: 10,
    status: "active",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  },
];

function compactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactNoSpace(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function normaliseMerchantName(description: string) {
  const cleaned = compactText(description);
  const noSpace = compactNoSpace(description);

  if (noSpace.includes("amznmktplace")) {
    return "Amazon";
  }

  if (cleaned.includes("amazon prime")) {
    return "Amazon Prime";
  }

  if (cleaned.includes("apple com bill") || cleaned.includes("apple bill")) {
    return "Apple";
  }

  if (cleaned.includes("paypal") && cleaned.includes("spotify")) {
    return "Spotify";
  }

  if (cleaned.includes("tesco")) {
    return "Tesco";
  }

  if (cleaned.includes("sainsburys") || cleaned.includes("sainsbury")) {
    return "Sainsbury's";
  }

  if (cleaned.includes("revolut transfer")) {
    return "Revolut Transfer";
  }

  if (cleaned.includes("amex payment")) {
    return "American Express Payment";
  }

  return titleCase(cleaned || description);
}

export function applyMerchantRules(description: string, rules: MerchantRule[] = []) {
  const cleaned = compactText(description);
  const orderedRules = [...rules, ...defaultMerchantRules]
    .filter((rule) => rule.status === "active")
    .sort((a, b) => a.priority - b.priority);

  return orderedRules.find((rule) => cleaned.includes(compactText(rule.matchPattern))) ?? null;
}

export function assignCategory(
  merchant: string,
  transaction?: Pick<Transaction, "amount" | "description" | "kind">,
): { category: FinanceCategory; subcategory: string | null; confidenceScore: number } {
  const text = compactText(`${merchant} ${transaction?.description ?? ""}`);

  if ((transaction?.amount ?? 0) > 0 || transaction?.kind === "income") {
    return { category: "income", subcategory: null, confidenceScore: 0.9 };
  }

  if (transferKeywords.some((keyword) => text.includes(keyword))) {
    return { category: "transfers", subcategory: null, confidenceScore: 0.95 };
  }

  if (text.includes("rent") || text.includes("mortgage") || text.includes("landlord")) {
    return { category: "rent_or_mortgage", subcategory: null, confidenceScore: 0.95 };
  }

  if (text.includes("council tax") || text.includes("city council")) {
    return { category: "council_tax", subcategory: null, confidenceScore: 0.95 };
  }

  if (text.includes("energy") || text.includes("water") || text.includes("utility")) {
    return { category: "utilities", subcategory: null, confidenceScore: 0.9 };
  }

  if (text.includes("tesco") || text.includes("sainsbury") || text.includes("grocer") || text.includes("market")) {
    return { category: "groceries", subcategory: null, confidenceScore: 0.9 };
  }

  if (text.includes("lunch") || text.includes("coffee") || text.includes("bistro") || text.includes("restaurant")) {
    return { category: "eating_out", subcategory: null, confidenceScore: 0.85 };
  }

  if (text.includes("tfl") || text.includes("train") || text.includes("uber") || text.includes("travel")) {
    return { category: "transport", subcategory: null, confidenceScore: 0.85 };
  }

  if (subscriptionMerchants.some((keyword) => text.includes(keyword))) {
    return { category: "subscriptions", subcategory: null, confidenceScore: 0.85 };
  }

  if (text.includes("cinema") || text.includes("theatre") || text.includes("gaming")) {
    return { category: "entertainment", subcategory: null, confidenceScore: 0.8 };
  }

  if (text.includes("pet") || text.includes("vet")) {
    return { category: "pets", subcategory: null, confidenceScore: 0.8 };
  }

  if (text.includes("pharmacy") || text.includes("health") || text.includes("dentist")) {
    return { category: "health", subcategory: null, confidenceScore: 0.8 };
  }

  if (text.includes("insurance")) {
    return { category: "insurance", subcategory: null, confidenceScore: 0.9 };
  }

  if (text.includes("cash withdrawal") || text.includes("atm")) {
    return { category: "cash_withdrawal", subcategory: null, confidenceScore: 0.9 };
  }

  if (text.includes("fee") || text.includes("charge")) {
    return { category: "fees", subcategory: null, confidenceScore: 0.8 };
  }

  if (text.includes("amazon") || text.includes("homeware") || text.includes("shop")) {
    return { category: "shopping", subcategory: null, confidenceScore: 0.75 };
  }

  return { category: "other", subcategory: null, confidenceScore: 0.55 };
}

function dateMs(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime();
}

function daysBetween(a: string, b: string) {
  return Math.round((dateMs(b) - dateMs(a)) / 86_400_000);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const next = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
}

function addYears(date: string, years: number) {
  const next = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function amountClose(a: number, b: number, toleranceRatio = 0.1) {
  const baseline = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(Math.abs(a) - Math.abs(b)) / baseline <= toleranceRatio;
}

export function isLikelyOwnAccountTransfer(
  transaction: Transaction,
  transactions: Transaction[],
  accounts: Account[],
) {
  const text = compactText(`${transaction.merchant} ${transaction.description}`);

  if (transaction.kind === "transfer" || transaction.flags.includes("own_account_transfer")) {
    return true;
  }

  if (transferKeywords.some((keyword) => text.includes(keyword))) {
    return true;
  }

  const account = accounts.find((candidate) => candidate.id === transaction.accountId);

  if (
    account?.type === "credit_card" &&
    (text.includes("payment") || text.includes("repayment"))
  ) {
    return true;
  }

  return transactions.some((candidate) => {
    if (candidate.id === transaction.id || candidate.accountId === transaction.accountId) {
      return false;
    }

    return (
      Math.sign(candidate.amount) !== Math.sign(transaction.amount) &&
      amountClose(candidate.amount, transaction.amount, 0.02) &&
      Math.abs(daysBetween(transaction.date, candidate.date)) <= 3
    );
  });
}

export function enrichTransaction(
  transaction: Transaction,
  accounts: Account[],
  rules: MerchantRule[] = [],
  allTransactions: Transaction[] = [transaction],
  now = new Date().toISOString(),
): TransactionEnrichment {
  const rule = applyMerchantRules(`${transaction.merchant} ${transaction.description}`, rules);
  const normalisedMerchantName =
    rule?.normalisedMerchantName ??
    normaliseMerchantName(transaction.merchant || transaction.description);
  const categoryResult = rule
    ? {
        category: rule.category,
        subcategory: rule.subcategory,
        confidenceScore: 0.98,
      }
    : assignCategory(normalisedMerchantName, transaction);
  const internalTransfer = isLikelyOwnAccountTransfer(transaction, allTransactions, accounts);
  const recurringCandidate =
    transaction.flags.includes("recurring") ||
    ["rent_or_mortgage", "council_tax", "utilities", "subscriptions", "insurance"].includes(
      categoryResult.category,
    );
  const billCandidate = billKeywords.some((keyword) =>
    compactText(`${normalisedMerchantName} ${transaction.description}`).includes(keyword),
  );
  const subscriptionCandidate =
    categoryResult.category === "subscriptions" ||
    subscriptionMerchants.some((keyword) =>
      compactText(normalisedMerchantName).includes(keyword),
    );

  return {
    id: `enrichment_${transaction.id}`,
    userId: "user_mock_001",
    transactionId: transaction.id,
    normalisedMerchantName,
    merchantGroup: rule?.merchantGroup ?? normalisedMerchantName,
    category: internalTransfer ? "transfers" : categoryResult.category,
    subcategory: categoryResult.subcategory,
    confidenceScore: internalTransfer ? 0.97 : categoryResult.confidenceScore,
    enrichmentSource: rule ? "rule" : "deterministic",
    userReviewed: transaction.status === "reviewed",
    excludedFromSpending: internalTransfer || transaction.status === "excluded",
    internalTransfer,
    billCandidate: billCandidate && !internalTransfer,
    subscriptionCandidate: subscriptionCandidate && !internalTransfer,
    recurringCandidate: recurringCandidate && !internalTransfer,
    reviewStatus: transaction.status === "reviewed" ? "reviewed" : "needs_review",
    createdAt: now,
    updatedAt: now,
  };
}

export function enrichTransactionSet(
  transactions: Transaction[],
  accounts: Account[],
  rules: MerchantRule[] = [],
  now = new Date().toISOString(),
) {
  return transactions.map((transaction) =>
    enrichTransaction(transaction, accounts, rules, transactions, now),
  );
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function detectFrequency(dates: string[]): RecurrenceFrequency | null {
  if (dates.length < 2) {
    return null;
  }

  const sorted = [...dates].sort();
  const gaps = sorted.slice(1).map((date, index) => Math.abs(daysBetween(sorted[index], date)));
  const avgGap = average(gaps);

  if (dates.length >= 3 && avgGap >= 5 && avgGap <= 9) {
    return "weekly";
  }

  if (avgGap >= 26 && avgGap <= 35) {
    return "monthly";
  }

  if (avgGap >= 330 && avgGap <= 400) {
    return "annual";
  }

  return null;
}

function nextDateFromFrequency(latestDate: string, frequency: RecurrenceFrequency) {
  if (frequency === "weekly") {
    return addDays(latestDate, 7);
  }

  if (frequency === "monthly") {
    return addMonths(latestDate, 1);
  }

  if (frequency === "annual") {
    return addYears(latestDate, 1);
  }

  return latestDate;
}

function candidateTypeForEnrichment(enrichment: TransactionEnrichment): RecurringPaymentCandidateType {
  if (enrichment.internalTransfer) {
    return "transfer";
  }

  if (enrichment.category === "income") {
    return "income";
  }

  if (enrichment.subscriptionCandidate || enrichment.category === "subscriptions") {
    return "subscription";
  }

  if (enrichment.billCandidate || ["rent_or_mortgage", "council_tax", "utilities", "insurance", "debt_repayment"].includes(enrichment.category)) {
    return "bill";
  }

  return "unknown";
}

export function detectRecurringPaymentCandidates(
  transactions: Transaction[],
  enrichments: TransactionEnrichment[],
  now = new Date().toISOString(),
): RecurringPaymentCandidate[] {
  const enrichmentByTransactionId = new Map(
    enrichments.map((enrichment) => [enrichment.transactionId, enrichment]),
  );
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const enrichment = enrichmentByTransactionId.get(transaction.id);

    if (!enrichment || enrichment.internalTransfer || transaction.status === "excluded") {
      continue;
    }

    const key = [
      enrichment.normalisedMerchantName,
      transaction.accountId,
      transaction.amount > 0 ? "income" : "outflow",
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.entries()).flatMap(([key, group]) => {
    const [merchant, linkedAccountId] = key.split("|");
    const sorted = group.sort((a, b) => a.date.localeCompare(b.date));
    const frequency = detectFrequency(sorted.map((transaction) => transaction.date));

    if (!frequency) {
      return [];
    }

    const amounts = sorted.map((transaction) => Math.abs(transaction.amount));
    const amountEstimate = Number(average(amounts).toFixed(2));
    const amountStable = amounts.every((amount) => amountClose(amount, amountEstimate, 0.15));

    if (!amountStable) {
      return [];
    }

    const latest = sorted[sorted.length - 1];
    const enrichment = enrichmentByTransactionId.get(latest.id);

    return [
      {
        id: `recurring_${compactNoSpace(merchant)}_${linkedAccountId}_${frequency}`,
        userId: "user_mock_001",
        merchant,
        amountEstimate,
        frequency,
        nextExpectedDate: nextDateFromFrequency(latest.date, frequency),
        confidence: Math.min(0.98, 0.6 + sorted.length * 0.1 + (amountStable ? 0.1 : 0)),
        linkedAccountId,
        latestTransactionDate: latest.date,
        transactionIds: sorted.map((transaction) => transaction.id),
        candidateType: enrichment ? candidateTypeForEnrichment(enrichment) : "unknown",
        status: "needs_review",
        reviewed: false,
        createdAt: now,
        updatedAt: now,
      } satisfies RecurringPaymentCandidate,
    ];
  });
}

export function detectBillsFromCandidates(
  candidates: RecurringPaymentCandidate[],
  enrichments: TransactionEnrichment[],
  now = new Date().toISOString(),
): DetectedBill[] {
  const enrichmentByTransactionId = new Map(
    enrichments.map((enrichment) => [enrichment.transactionId, enrichment]),
  );

  return candidates
    .filter((candidate) => candidate.candidateType === "bill")
    .map((candidate) => {
      const enrichment = enrichmentByTransactionId.get(candidate.transactionIds.at(-1) ?? "");
      return {
        id: `detected_bill_${candidate.id}`,
        userId: candidate.userId,
        name: candidate.merchant,
        merchant: candidate.merchant,
        amountEstimate: candidate.amountEstimate,
        frequency: candidate.frequency,
        nextDueDate: candidate.nextExpectedDate,
        paymentAccountId: candidate.linkedAccountId,
        category: enrichment?.category ?? "other",
        confidence: candidate.confidence,
        source: "recurring_detection",
        status: "needs_review",
        reviewed: false,
        createdAt: now,
        updatedAt: now,
      };
    });
}

export function detectSubscriptionsFromCandidates(
  candidates: RecurringPaymentCandidate[],
  transactions: Transaction[],
  enrichments: TransactionEnrichment[],
  now = new Date().toISOString(),
): DetectedSubscription[] {
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const enrichmentByTransactionId = new Map(
    enrichments.map((enrichment) => [enrichment.transactionId, enrichment]),
  );

  return candidates
    .filter((candidate) => candidate.candidateType === "subscription")
    .map((candidate) => {
      const candidateTransactions = candidate.transactionIds
        .map((id) => transactionById.get(id))
        .filter((transaction): transaction is Transaction => Boolean(transaction));
      const recent = candidateTransactions.at(-1);
      const previousAverage = average(
        candidateTransactions.slice(0, -1).map((transaction) => Math.abs(transaction.amount)),
      );
      const latestAmount = recent ? Math.abs(recent.amount) : candidate.amountEstimate;
      const priceChangeDetected =
        previousAverage > 0 && Math.abs(latestAmount - previousAverage) / previousAverage >= 0.1;
      const enrichment = enrichmentByTransactionId.get(candidate.transactionIds.at(-1) ?? "");

      return {
        id: `detected_subscription_${candidate.id}`,
        userId: candidate.userId,
        name: candidate.merchant,
        merchant: candidate.merchant,
        amountEstimate: candidate.amountEstimate,
        frequency: candidate.frequency,
        nextExpectedDate: candidate.nextExpectedDate,
        paymentAccountId: candidate.linkedAccountId,
        category: enrichment?.category ?? "subscriptions",
        confidence: candidate.confidence,
        status: "needs_review",
        reviewed: false,
        priceChangeDetected,
        createdAt: now,
        updatedAt: now,
      };
    });
}

export function buildCashflowEvents({
  userId,
  bills,
  subscriptions,
  manualFinanceItems,
  incomeCandidates,
  startDate,
  endDate,
  now = new Date().toISOString(),
}: {
  userId: string;
  bills: Array<Bill | DetectedBill>;
  subscriptions: Array<Subscription | DetectedSubscription>;
  manualFinanceItems: ManualFinanceItem[];
  incomeCandidates?: RecurringPaymentCandidate[];
  startDate: string;
  endDate: string;
  now?: string;
}): CashflowEvent[] {
  const inRange = (date: string | null) => Boolean(date && date >= startDate && date <= endDate);
  const billEvents: CashflowEvent[] = bills
    .map((bill) => ({
      id: `cashflow_bill_${bill.id}`,
      userId,
      date: "dueDate" in bill ? bill.dueDate : bill.nextDueDate,
      name: bill.name,
      amount: "amount" in bill ? bill.amount : bill.amountEstimate,
      currency: "currency" in bill ? bill.currency : "GBP",
      direction: "outflow" as const,
      source: "bill" as const,
      accountId: "accountId" in bill ? bill.accountId : bill.paymentAccountId,
      includeInCashflow: "includeInCashflow" in bill ? bill.includeInCashflow : true,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((event) => event.includeInCashflow && inRange(event.date));
  const subscriptionEvents: CashflowEvent[] = subscriptions
    .map((subscription) => ({
      id: `cashflow_subscription_${subscription.id}`,
      userId,
      date: "dueDate" in subscription ? subscription.dueDate : subscription.nextExpectedDate,
      name: subscription.name,
      amount: "amount" in subscription ? subscription.amount : subscription.amountEstimate,
      currency: "currency" in subscription ? subscription.currency : "GBP",
      direction: "outflow" as const,
      source: "subscription" as const,
      accountId: "accountId" in subscription ? subscription.accountId : subscription.paymentAccountId,
      includeInCashflow: "includeInCashflow" in subscription ? subscription.includeInCashflow : true,
      createdAt: now,
      updatedAt: now,
    }))
    .filter((event) => event.includeInCashflow && inRange(event.date));
  const manualEvents: CashflowEvent[] = manualFinanceItems
    .filter((item) => item.includeInCashflow && item.dueDate && inRange(item.dueDate))
    .map((item) => ({
      id: `cashflow_manual_${item.id}`,
      userId,
      date: String(item.dueDate),
      name: item.name,
      amount: item.amount,
      currency: item.currency,
      direction: item.direction === "income" || item.direction === "receivable" ? "inflow" : "outflow",
      source: "manual",
      accountId: null,
      includeInCashflow: true,
      createdAt: now,
      updatedAt: now,
    }));
  const incomeEvents: CashflowEvent[] = (incomeCandidates ?? [])
    .filter((candidate) => candidate.candidateType === "income" && inRange(candidate.nextExpectedDate))
    .map((candidate) => ({
      id: `cashflow_income_${candidate.id}`,
      userId,
      date: candidate.nextExpectedDate,
      name: candidate.merchant,
      amount: candidate.amountEstimate,
      currency: "GBP",
      direction: "inflow",
      source: "income",
      accountId: candidate.linkedAccountId,
      includeInCashflow: true,
      createdAt: now,
      updatedAt: now,
    }));

  return [...billEvents, ...subscriptionEvents, ...manualEvents, ...incomeEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function forecastCashflow({
  accounts,
  events,
  minimumBuffer,
}: {
  accounts: Account[];
  events: CashflowEvent[];
  minimumBuffer: number;
}) {
  const startingCash = accounts
    .filter((account) => account.includeInCashflow && account.status !== "inactive")
    .reduce((total, account) => total + Math.max(account.availableBalance ?? account.balance, 0), 0);
  const billsAccountBalance = accounts
    .filter((account) => account.isBillsAccount && account.includeInCashflow)
    .reduce((total, account) => total + Math.max(account.availableBalance ?? account.balance, 0), 0);
  const inflows = events
    .filter((event) => event.includeInCashflow && event.direction === "inflow")
    .reduce((total, event) => total + event.amount, 0);
  const outflows = events
    .filter((event) => event.includeInCashflow && event.direction === "outflow")
    .reduce((total, event) => total + event.amount, 0);
  const projectedBalances = accounts.map((account) => {
    const accountOutflows = events
      .filter((event) => event.accountId === account.id && event.direction === "outflow")
      .reduce((total, event) => total + event.amount, 0);
    const accountInflows = events
      .filter((event) => event.accountId === account.id && event.direction === "inflow")
      .reduce((total, event) => total + event.amount, 0);

    return {
      accountId: account.id,
      projectedBalance: (account.availableBalance ?? account.balance) + accountInflows - accountOutflows,
    };
  });
  const projectedBillsAccountBalance = projectedBalances
    .filter((projected) => accounts.find((account) => account.id === projected.accountId)?.isBillsAccount)
    .reduce((total, projected) => total + projected.projectedBalance, 0);

  return {
    events,
    upcomingBillsBeforePayday: events
      .filter((event) => event.source === "bill" && event.direction === "outflow")
      .reduce((total, event) => total + event.amount, 0),
    upcomingSubscriptionsBeforePayday: events
      .filter((event) => event.source === "subscription" && event.direction === "outflow")
      .reduce((total, event) => total + event.amount, 0),
    expectedIncomeBeforePayday: inflows,
    projectedBalances,
    projectedSafeToSpend: calculateSafeToSpendAmount({
      currentCash: startingCash,
      billsDueBeforePayday: outflows,
      plannedSavingsBeforePayday: 0,
      debtPaymentsBeforePayday: 0,
      minimumBuffer,
      reservedGoalContributions: 0,
      confirmedAdjustments: inflows,
    }),
    billsAccountBalance,
    projectedBillsAccountBalance,
  };
}

export function detectSpendingAnomalies({
  userId,
  transactions,
  enrichments,
  detectedBills = [],
  detectedSubscriptions = [],
  period,
  now = new Date().toISOString(),
}: {
  userId: string;
  transactions: Transaction[];
  enrichments: TransactionEnrichment[];
  detectedBills?: DetectedBill[];
  detectedSubscriptions?: DetectedSubscription[];
  period?: BudgetPeriod;
  now?: string;
}): SpendingAnomaly[] {
  const enrichmentByTransactionId = new Map(
    enrichments.map((enrichment) => [enrichment.transactionId, enrichment]),
  );
  const anomalies: SpendingAnomaly[] = [];
  const duplicateGroups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const enrichment = enrichmentByTransactionId.get(transaction.id);

    if (enrichment?.internalTransfer || transaction.amount >= 0) {
      continue;
    }

    const duplicateKey = [
      transaction.accountId,
      transaction.date,
      Math.abs(transaction.amount).toFixed(2),
      enrichment?.normalisedMerchantName ?? normaliseMerchantName(transaction.merchant),
    ].join("|");
    duplicateGroups.set(duplicateKey, [...(duplicateGroups.get(duplicateKey) ?? []), transaction]);

    if (Math.abs(transaction.amount) >= 500) {
      anomalies.push({
        id: `anomaly_large_${transaction.id}`,
        userId,
        type: "large_transaction",
        title: "Unusually large transaction",
        description: "A single transaction is materially larger than the default review threshold.",
        severity: "warning",
        transactionIds: [transaction.id],
        merchant: enrichment?.normalisedMerchantName ?? transaction.merchant,
        category: enrichment?.category ?? null,
        amount: Math.abs(transaction.amount),
        expectedAmount: 500,
        detectedAt: now,
        status: "needs_review",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      anomalies.push({
        id: `anomaly_duplicate_${group.map((transaction) => transaction.id).join("_")}`,
        userId,
        type: "duplicate_transaction",
        title: "Possible duplicate payment",
        description: "Two or more transactions have the same account, date, merchant and amount.",
        severity: "warning",
        transactionIds: group.map((transaction) => transaction.id),
        merchant: enrichmentByTransactionId.get(group[0].id)?.normalisedMerchantName ?? group[0].merchant,
        category: enrichmentByTransactionId.get(group[0].id)?.category ?? null,
        amount: Math.abs(group[0].amount),
        expectedAmount: null,
        detectedAt: now,
        status: "needs_review",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const subscription of detectedSubscriptions.filter((item) => item.priceChangeDetected)) {
    anomalies.push({
      id: `anomaly_price_${subscription.id}`,
      userId,
      type: "subscription_price_increase",
      title: "Subscription price changed",
      description: "A recurring subscription appears to have changed price.",
      severity: "warning",
      transactionIds: [],
      merchant: subscription.merchant,
      category: subscription.category,
      amount: subscription.amountEstimate,
      expectedAmount: null,
      detectedAt: now,
      status: "needs_review",
      createdAt: now,
      updatedAt: now,
    });
  }

  if (period) {
    for (const bill of detectedBills) {
      const expectedDatePassed = bill.nextDueDate < period.endDate;
      const matchingTransaction = transactions.some((transaction) => {
        const enrichment = enrichmentByTransactionId.get(transaction.id);
        return (
          enrichment?.normalisedMerchantName === bill.merchant &&
          Math.abs(daysBetween(transaction.date, bill.nextDueDate)) <= 5
        );
      });

      if (expectedDatePassed && !matchingTransaction) {
        anomalies.push({
          id: `anomaly_missing_${bill.id}`,
          userId,
          type: "missing_expected_bill",
          title: "Expected bill missing",
          description: "A detected bill has not appeared around its expected payment date.",
          severity: "warning",
          transactionIds: [],
          merchant: bill.merchant,
          category: bill.category,
          amount: null,
          expectedAmount: bill.amountEstimate,
          detectedAt: now,
          status: "needs_review",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  return anomalies;
}

export function approveRecurringCandidate(candidate: RecurringPaymentCandidate) {
  return { ...candidate, status: "approved" as const, reviewed: true, updatedAt: new Date().toISOString() };
}

export function dismissRecurringCandidate(candidate: RecurringPaymentCandidate) {
  return { ...candidate, status: "dismissed" as const, reviewed: true, updatedAt: new Date().toISOString() };
}

export function updateTransactionEnrichmentReview(
  enrichment: TransactionEnrichment,
  changes: Partial<
    Pick<
      TransactionEnrichment,
      | "category"
      | "normalisedMerchantName"
      | "internalTransfer"
      | "excludedFromSpending"
      | "reviewStatus"
    >
  >,
) {
  return {
    ...enrichment,
    ...changes,
    userReviewed: true,
    enrichmentSource: "user" as const,
    excludedFromSpending:
      changes.excludedFromSpending ?? changes.internalTransfer ?? enrichment.excludedFromSpending,
    updatedAt: new Date().toISOString(),
  };
}

export function generateIntelligenceNotifications({
  userId,
  detectedBills,
  detectedSubscriptions,
  anomalies,
  cashflowForecast,
  transactionReviewCount,
  now = new Date().toISOString(),
}: {
  userId: string;
  detectedBills: DetectedBill[];
  detectedSubscriptions: DetectedSubscription[];
  anomalies: SpendingAnomaly[];
  cashflowForecast?: ReturnType<typeof forecastCashflow>;
  transactionReviewCount?: number;
  now?: string;
}): AppNotification[] {
  const drafts: Array<{
    type: AppNotification["type"];
    title: string;
    body: string;
    severity: AppNotification["severity"];
    entityType: string | null;
    entityId: string | null;
    actionHref: string | null;
  }> = [
    ...detectedBills
      .filter((bill) => !bill.reviewed)
      .map((bill) => ({
        type: "new_bill_detected" as const,
        title: `${bill.name} may be a bill`,
        body: `${bill.name} looks like a recurring bill for ${formatCurrency(bill.amountEstimate)}.`,
        severity: "info" as const,
        entityType: "detected_bill",
        entityId: bill.id,
        actionHref: "/bills-and-subscriptions",
      })),
    ...detectedSubscriptions
      .filter((subscription) => !subscription.reviewed)
      .map((subscription) => ({
        type: "new_subscription_detected" as const,
        title: `${subscription.name} may be a subscription`,
        body: `${subscription.name} looks like a recurring subscription.`,
        severity: "info" as const,
        entityType: "detected_subscription",
        entityId: subscription.id,
        actionHref: "/bills-and-subscriptions",
      })),
    ...detectedSubscriptions
      .filter((subscription) => subscription.priceChangeDetected)
      .map((subscription) => ({
        type: "subscription_price_changed" as const,
        title: `${subscription.name} changed price`,
        body: `${subscription.name} appears to have changed price.`,
        severity: "warning" as const,
        entityType: "detected_subscription",
        entityId: subscription.id,
        actionHref: "/bills-and-subscriptions",
      })),
    ...anomalies.map((anomaly) => ({
      type:
        anomaly.type === "missing_expected_bill"
          ? ("missing_expected_bill" as const)
          : ("unusual_spending" as const),
      title: anomaly.title,
      body: anomaly.description,
      severity: anomaly.severity,
      entityType: "spending_anomaly",
      entityId: anomaly.id,
      actionHref: "/transactions",
    })),
  ];

  if (cashflowForecast && cashflowForecast.projectedBillsAccountBalance < 0) {
    drafts.push({
      type: "projected_bills_account_shortfall",
      title: "Projected bills account shortfall",
      body: "The projected bills account balance is below zero before payday.",
      severity: "urgent",
      entityType: "cashflow",
      entityId: null,
      actionHref: "/",
    });
  }

  if ((transactionReviewCount ?? 0) > 0) {
    drafts.push({
      type: "transaction_needs_review",
      title: "Transactions need review",
      body: `${transactionReviewCount} transactions need merchant or category review.`,
      severity: "info",
      entityType: "transaction",
      entityId: null,
      actionHref: "/transactions",
    });
  }

  return drafts.map((draft, index) => {
    const safeCopy = getPrivacySafeNotificationCopy(draft.type);

    return {
      id: `notif_${draft.type}_${draft.entityId ?? index}_${now.replaceAll(/[^0-9]/g, "")}`,
      userId,
      type: draft.type,
      severity: draft.severity,
      channel: "in_app",
      title: draft.title,
      body: draft.body,
      privacySafeTitle: safeCopy.title,
      privacySafeBody: safeCopy.body,
      actionHref: draft.actionHref,
      entityType: draft.entityType,
      entityId: draft.entityId,
      status: "unread",
      readAt: null,
      dismissedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}
