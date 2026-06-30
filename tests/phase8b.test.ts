import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  Account,
  MerchantRule,
  Transaction,
  TransactionEnrichment,
} from "../src/lib/domain";
import {
  approveRecurringCandidate,
  assignCategory,
  buildCashflowEvents,
  defaultMerchantRules,
  detectBillsFromCandidates,
  detectRecurringPaymentCandidates,
  detectSpendingAnomalies,
  detectSubscriptionsFromCandidates,
  dismissRecurringCandidate,
  enrichTransaction,
  enrichTransactionSet,
  financeCategories,
  forecastCashflow,
  generateIntelligenceNotifications,
  isLikelyOwnAccountTransfer,
  normaliseMerchantName,
  updateTransactionEnrichmentReview,
} from "../src/lib/transaction-intelligence";

const accountCurrent: Account = {
  id: "acct_current",
  userId: "user_test",
  providerConnectionId: "conn_test",
  providerAccountId: "provider_current",
  institutionName: "Nationwide",
  institutionId: "nationwide",
  name: "FlexDirect",
  officialName: "Nationwide FlexDirect",
  type: "current_account",
  subtype: "current",
  currency: "GBP",
  balance: 1200,
  availableBalance: 1200,
  creditLimit: null,
  mask: "1234",
  purpose: "main_current_account",
  accountRole: "spending",
  includeInCashflow: true,
  includeInNetWorth: true,
  includeInSafeToSpend: true,
  isSpendingAccount: true,
  isBillsAccount: false,
  isSavingsAccount: false,
  linkedGoalIds: [],
  syncStatus: "connected",
  lastSyncedAt: "2026-06-30T09:00:00.000Z",
  consentExpiresAt: "2026-09-30T09:00:00.000Z",
  notes: null,
  provider: "mock",
  status: "active",
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

const accountSavings: Account = {
  ...accountCurrent,
  id: "acct_savings",
  providerAccountId: "provider_savings",
  name: "Emergency Saver",
  type: "savings",
  subtype: "savings",
  purpose: "emergency_fund",
  accountRole: "savings",
  balance: 500,
  availableBalance: 500,
  includeInSafeToSpend: false,
  isSpendingAccount: false,
  isSavingsAccount: true,
};

const accountBills: Account = {
  ...accountCurrent,
  id: "acct_bills",
  providerAccountId: "provider_bills",
  name: "Bills account",
  purpose: "bills_account",
  accountRole: "bills",
  balance: 400,
  availableBalance: 400,
  includeInSafeToSpend: false,
  isSpendingAccount: false,
  isBillsAccount: true,
};

const accountAmex: Account = {
  ...accountCurrent,
  id: "acct_amex",
  providerAccountId: "provider_amex",
  institutionName: "American Express",
  institutionId: "amex",
  name: "Amex Card",
  type: "credit_card",
  subtype: "credit_card",
  purpose: "credit_card",
  accountRole: "credit",
  balance: -250,
  availableBalance: 1750,
  creditLimit: 2000,
  includeInSafeToSpend: false,
  isSpendingAccount: false,
};

const accounts = [accountCurrent, accountSavings, accountBills, accountAmex];

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `txn_${Math.random().toString(36).slice(2)}`,
    accountId: "acct_current",
    categoryId: "cat_uncategorised",
    date: "2026-06-30",
    merchant: "Synthetic Merchant",
    description: "Synthetic transaction",
    amount: -10,
    currency: "GBP",
    kind: "expense",
    status: "needs_review",
    flags: [],
    pending: false,
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
    ...overrides,
  };
}

describe("phase 8B transaction intelligence", () => {
  it("normalises noisy merchant descriptions", () => {
    expect(normaliseMerchantName("AMZNMktplace*UK")).toBe("Amazon");
    expect(normaliseMerchantName("AMAZON PRIME")).toBe("Amazon Prime");
    expect(normaliseMerchantName("APPLE.COM/BILL")).toBe("Apple");
    expect(normaliseMerchantName("PAYPAL *SPOTIFY")).toBe("Spotify");
    expect(normaliseMerchantName("TESCO STORES")).toBe("Tesco");
    expect(normaliseMerchantName("SAINSBURYS S/MKTS")).toBe("Sainsbury's");
    expect(normaliseMerchantName("REVOLUT TRANSFER")).toBe("Revolut Transfer");
    expect(normaliseMerchantName("AMEX PAYMENT")).toBe("American Express Payment");
  });

  it("assigns deterministic category rules", () => {
    expect(financeCategories).toContain("council_tax");
    expect(assignCategory("City Council", txn({ description: "Council tax" })).category).toBe(
      "council_tax",
    );
    expect(assignCategory("Tesco Stores", txn()).category).toBe("groceries");
    expect(assignCategory("AMEX PAYMENT", txn({ description: "Credit card repayment" })).category).toBe(
      "transfers",
    );
  });

  it("detects own-account transfers and credit-card payment transfers", () => {
    const outbound = txn({
      id: "txn_transfer_out",
      accountId: "acct_current",
      date: "2026-06-25",
      merchant: "Own account transfer",
      description: "Transfer to emergency fund",
      amount: -300,
    });
    const inbound = txn({
      id: "txn_transfer_in",
      accountId: "acct_savings",
      date: "2026-06-26",
      merchant: "Transfer from current",
      description: "Internal transfer",
      amount: 300,
      kind: "income",
    });
    const amexPayment = txn({
      id: "txn_amex_payment",
      merchant: "AMEX PAYMENT",
      description: "Payment to credit card",
      amount: -250,
    });

    expect(isLikelyOwnAccountTransfer(outbound, [outbound, inbound], accounts)).toBe(true);
    expect(isLikelyOwnAccountTransfer(amexPayment, [amexPayment], accounts)).toBe(true);
  });

  it("applies merchant override rules during enrichment", () => {
    const rule: MerchantRule = {
      ...defaultMerchantRules[0],
      id: "rule_override_pet_shop",
      matchPattern: "synthetic pets",
      normalisedMerchantName: "Local Pet Shop",
      merchantGroup: "Pets",
      category: "pets",
      subcategory: "food",
      priority: 1,
    };
    const enrichment = enrichTransaction(
      txn({ merchant: "SYNTHETIC PETS LTD", description: "Dog food" }),
      accounts,
      [rule],
    );

    expect(enrichment.normalisedMerchantName).toBe("Local Pet Shop");
    expect(enrichment.category).toBe("pets");
    expect(enrichment.enrichmentSource).toBe("rule");
  });

  it("detects monthly, weekly and annual recurring payments", () => {
    const monthly = [
      txn({ id: "rent_may", merchant: "Mock Landlord", description: "Rent", date: "2026-05-01", amount: -950 }),
      txn({ id: "rent_jun", merchant: "Mock Landlord", description: "Rent", date: "2026-06-01", amount: -950 }),
    ];
    const weekly = [
      txn({ id: "gym_1", merchant: "Gym snack", date: "2026-06-02", amount: -7 }),
      txn({ id: "gym_2", merchant: "Gym snack", date: "2026-06-09", amount: -7.1 }),
      txn({ id: "gym_3", merchant: "Gym snack", date: "2026-06-16", amount: -7 }),
    ];
    const annual = [
      txn({ id: "mag_2025", merchant: "Magazine renewal", date: "2025-07-01", amount: -72 }),
      txn({ id: "mag_2026", merchant: "Magazine renewal", date: "2026-07-01", amount: -72 }),
    ];
    const transactions = [...monthly, ...weekly, ...annual];
    const enrichments = enrichTransactionSet(transactions, accounts);
    const candidates = detectRecurringPaymentCandidates(transactions, enrichments);

    expect(candidates.some((candidate) => candidate.frequency === "monthly")).toBe(true);
    expect(candidates.some((candidate) => candidate.frequency === "weekly")).toBe(true);
    expect(candidates.some((candidate) => candidate.frequency === "annual")).toBe(true);
  });

  it("detects bill and subscription candidates including price changes", () => {
    const transactions = [
      txn({ id: "energy_may", accountId: "acct_bills", merchant: "Local Energy", description: "Direct Debit", date: "2026-05-15", amount: -118 }),
      txn({ id: "energy_jun", accountId: "acct_bills", merchant: "Local Energy", description: "Direct Debit", date: "2026-06-15", amount: -118 }),
      txn({ id: "spotify_apr", accountId: "acct_amex", merchant: "PAYPAL *SPOTIFY", date: "2026-04-03", amount: -10 }),
      txn({ id: "spotify_may", accountId: "acct_amex", merchant: "PAYPAL *SPOTIFY", date: "2026-05-03", amount: -10 }),
      txn({ id: "spotify_jun", accountId: "acct_amex", merchant: "PAYPAL *SPOTIFY", date: "2026-06-03", amount: -11.2 }),
    ];
    const enrichments = enrichTransactionSet(transactions, accounts);
    const candidates = detectRecurringPaymentCandidates(transactions, enrichments);
    const detectedBills = detectBillsFromCandidates(candidates, enrichments);
    const detectedSubscriptions = detectSubscriptionsFromCandidates(
      candidates,
      transactions,
      enrichments,
    );

    expect(detectedBills.some((bill) => bill.merchant === "Local Energy")).toBe(true);
    expect(detectedSubscriptions.some((subscription) => subscription.merchant === "Spotify")).toBe(true);
    expect(detectedSubscriptions.find((subscription) => subscription.merchant === "Spotify")?.priceChangeDetected).toBe(true);
  });

  it("detects duplicate and missing expected bill anomalies", () => {
    const duplicateA = txn({ id: "dup_a", merchant: "Tesco Stores", date: "2026-06-28", amount: -40 });
    const duplicateB = txn({ id: "dup_b", merchant: "TESCO STORES", date: "2026-06-28", amount: -40 });
    const enrichments = enrichTransactionSet([duplicateA, duplicateB], accounts);
    const missingBill = {
      id: "detected_bill_missing",
      userId: "user_test",
      name: "Water bill",
      merchant: "Water bill",
      amountEstimate: 36,
      frequency: "monthly" as const,
      nextDueDate: "2026-06-15",
      paymentAccountId: "acct_bills",
      category: "utilities" as const,
      confidence: 0.9,
      source: "recurring_detection" as const,
      status: "needs_review" as const,
      reviewed: false,
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    };
    const anomalies = detectSpendingAnomalies({
      userId: "user_test",
      transactions: [duplicateA, duplicateB],
      enrichments,
      detectedBills: [missingBill],
      period: {
        id: "period",
        userId: "user_test",
        label: "June",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        status: "open",
      },
    });

    expect(anomalies.some((anomaly) => anomaly.type === "duplicate_transaction")).toBe(true);
    expect(anomalies.some((anomaly) => anomaly.type === "missing_expected_bill")).toBe(true);
  });

  it("forecasts upcoming bills before payday and projected safe-to-spend", () => {
    const events = buildCashflowEvents({
      userId: "user_test",
      bills: [
        {
          id: "bill_rent",
          userId: "user_test",
          name: "Rent",
          amount: 950,
          currency: "GBP",
          dueDate: "2026-07-01",
          recurrence: { frequency: "monthly", interval: 1 },
          categoryId: "cat_home",
          accountId: "acct_bills",
          essential: true,
          includeInCashflow: true,
          status: "confirmed",
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z",
        },
      ],
      subscriptions: [],
      manualFinanceItems: [],
      startDate: "2026-06-30",
      endDate: "2026-07-25",
    });
    const forecast = forecastCashflow({
      accounts,
      events,
      minimumBuffer: 350,
    });

    expect(forecast.upcomingBillsBeforePayday).toBe(950);
    expect(forecast.projectedBillsAccountBalance).toBe(-550);
    expect(forecast.projectedSafeToSpend).toBeGreaterThan(0);
  });

  it("updates review workflow state changes deterministically", () => {
    const enrichment: TransactionEnrichment = enrichTransaction(txn(), accounts);
    const reviewed = updateTransactionEnrichmentReview(enrichment, {
      category: "shopping",
      normalisedMerchantName: "Reviewed Merchant",
      internalTransfer: true,
      reviewStatus: "reviewed",
    });
    const candidate = approveRecurringCandidate({
      id: "candidate",
      userId: "user_test",
      merchant: "Spotify",
      amountEstimate: 10,
      frequency: "monthly",
      nextExpectedDate: "2026-07-01",
      confidence: 0.9,
      linkedAccountId: "acct_amex",
      latestTransactionDate: "2026-06-01",
      transactionIds: ["txn"],
      candidateType: "subscription",
      status: "needs_review",
      reviewed: false,
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: "2026-06-30T09:00:00.000Z",
    });

    expect(reviewed.userReviewed).toBe(true);
    expect(reviewed.excludedFromSpending).toBe(true);
    expect(reviewed.normalisedMerchantName).toBe("Reviewed Merchant");
    expect(candidate.status).toBe("approved");
    expect(dismissRecurringCandidate(candidate).status).toBe("dismissed");
  });

  it("keeps Supabase migration and RLS coverage for intelligence tables", () => {
    const sql = fs.readFileSync(
      path.resolve("supabase/migrations/20260705000000_phase8b_transaction_intelligence.sql"),
      "utf8",
    );
    const tables = [
      "merchant_rules",
      "transaction_enrichments",
      "recurring_payment_candidates",
      "detected_bills",
      "detected_subscriptions",
      "spending_anomalies",
      "cashflow_events",
    ];

    for (const table of tables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`'${table}'`);
    }

    expect(sql).toContain("auth.uid() = user_id");
  });

  it("generates privacy-safe notifications for detections and anomalies", () => {
    const bill = detectBillsFromCandidates(
      [
        {
          id: "recurring_energy",
          userId: "user_test",
          merchant: "Local Energy",
          amountEstimate: 118,
          frequency: "monthly",
          nextExpectedDate: "2026-07-15",
          confidence: 0.9,
          linkedAccountId: "acct_bills",
          latestTransactionDate: "2026-06-15",
          transactionIds: ["txn_energy"],
          candidateType: "bill",
          status: "needs_review",
          reviewed: false,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z",
        },
      ],
      [
        {
          ...enrichTransaction(txn({ id: "txn_energy", merchant: "Local Energy" }), accounts),
          transactionId: "txn_energy",
          category: "utilities",
        },
      ],
    );
    const notifications = generateIntelligenceNotifications({
      userId: "user_test",
      detectedBills: bill,
      detectedSubscriptions: [],
      anomalies: [
        {
          id: "anomaly_large",
          userId: "user_test",
          type: "large_transaction",
          title: "Large transaction",
          description: "A transaction needs review.",
          severity: "warning",
          transactionIds: ["txn_large"],
          merchant: "Detailed merchant",
          category: "shopping",
          amount: 750,
          expectedAmount: 500,
          detectedAt: "2026-06-30T09:00:00.000Z",
          status: "needs_review",
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z",
        },
      ],
      transactionReviewCount: 2,
      now: "2026-06-30T09:00:00.000Z",
    });

    expect(notifications.map((notification) => notification.type)).toContain("new_bill_detected");
    expect(notifications.map((notification) => notification.type)).toContain("unusual_spending");
    expect(notifications.map((notification) => notification.type)).toContain("transaction_needs_review");
    expect(JSON.stringify(notifications.map((notification) => notification.privacySafeBody))).not.toContain("Detailed merchant");
    expect(JSON.stringify(notifications.map((notification) => notification.privacySafeBody))).not.toContain("750");
  });
});
