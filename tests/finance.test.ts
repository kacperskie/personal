import { describe, expect, it } from "vitest";
import {
  calculateBillsDueBeforePayday,
  calculateBillsAccountBalance,
  calculateBudgetHealth,
  calculateBudgetPace,
  calculateBudgetRemaining,
  calculateBudgetUsagePercentage,
  calculateCashflowAccountBalance,
  calculateDebtPaymentsDueBeforePayday,
  calculateDebtSummary,
  calculateLinkedSavingsGoalBalance,
  calculateMonthlyIncome,
  calculateMonthlySpending,
  calculateNetWorth,
  calculateProjectedMonthEndBalance,
  calculateSafeToSpend,
  calculateSafeToSpendAmount,
  calculateSafeToSpendEligibleCash,
  calculateSavingsGoalProgress,
  calculateSpendByCategory,
  calculateTotalAssets,
  calculateTotalCurrentCash,
  calculateTotalLiabilities,
  getConnectionLifecycleStatus,
  getUpcomingBillItems,
  getUpcomingManualCashflowItems,
} from "../src/lib/finance";
import {
  amexFundingSummary,
  calculateBudgetTotal,
  calculateCreditCardBalanceSummary,
  getTransactionBudgetTreatment,
} from "../src/lib/finance-interpretation";
import { mockOpenBankingProvider } from "../src/lib/bank-providers";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockDebts,
  mockManualFinanceItems,
  mockSavingsGoals,
  mockSubscriptions,
  mockTransactionRecords,
  mockUserProfile,
} from "../src/lib/mock-data";
import type { Account, Transaction, TransactionBudgetOverride } from "../src/lib/domain";

const currentPeriod = mockBudgetPeriods[0];
const projectionPeriod = mockBudgetPeriods[1];
const asOfDate = "2026-06-30";
const nextPaydayDate = "2026-07-25";

describe("finance calculations", () => {
  it("calculates total current cash from cash accounts and manual cash items", () => {
    expect(calculateTotalCurrentCash(mockAccounts, mockManualFinanceItems)).toBeCloseTo(
      5290.7,
      2,
    );
  });

  it("excludes bills, savings, and ringfenced accounts from safe-to-spend", () => {
    expect(calculateSafeToSpendEligibleCash(mockAccounts)).toBeCloseTo(3905.7, 2);
    expect(
      calculateSafeToSpendEligibleCash(
        mockAccounts.filter((account) => account.id === "acct_nationwide_bills"),
      ),
    ).toBe(0);
    expect(
      calculateSafeToSpendEligibleCash(
        mockAccounts.filter((account) => account.id === "acct_nationwide_emergency"),
      ),
    ).toBe(0);
  });

  it("counts Amex credit card balance as a liability", () => {
    const amexAccount = mockAccounts.filter((account) => account.institutionId === "amex");

    expect(calculateTotalLiabilities(amexAccount, [], [])).toBe(640);
  });

  it("includes Nationwide bills account in cashflow but not safe-to-spend", () => {
    const billsAccount = mockAccounts.filter(
      (account) => account.id === "acct_nationwide_bills",
    );

    expect(calculateCashflowAccountBalance(billsAccount)).toBe(900);
    expect(calculateBillsAccountBalance(billsAccount)).toBe(900);
    expect(calculateSafeToSpendEligibleCash(billsAccount)).toBe(0);
  });

  it("includes Revolut everyday account in safe-to-spend", () => {
    const revolutEveryday = mockAccounts.filter(
      (account) => account.id === "acct_revolut_everyday",
    );

    expect(calculateSafeToSpendEligibleCash(revolutEveryday)).toBe(485);
  });

  it("returns upcoming manual cashflow items", () => {
    const items = getUpcomingManualCashflowItems(
      mockManualFinanceItems,
      asOfDate,
      projectionPeriod.endDate,
    );

    expect(items).toHaveLength(7);
    expect(items.map((item) => item.id)).toContain("manual_salary_forecast");
    expect(items[0].id).toBe("manual_housemate_contribution");
  });

  it("returns upcoming bills including manual bills and future expenses", () => {
    const items = getUpcomingBillItems(
      mockBills,
      mockSubscriptions,
      mockManualFinanceItems,
      asOfDate,
      nextPaydayDate,
    );

    expect(items).toHaveLength(10);
    expect(items.map((item) => item.id)).toContain("manual_car_mot");
    expect(items.map((item) => item.id)).toContain("manual_window_cleaner");
  });

  it("calculates bills due before payday", () => {
    expect(
      calculateBillsDueBeforePayday(
        mockBills,
        mockSubscriptions,
        mockManualFinanceItems,
        asOfDate,
        nextPaydayDate,
      ),
    ).toBeCloseTo(1659.89, 2);
  });

  it("calculates debt payments due before payday", () => {
    expect(
      calculateDebtPaymentsDueBeforePayday(
        mockDebts,
        mockManualFinanceItems,
        asOfDate,
        nextPaydayDate,
      ),
    ).toBe(340);
  });

  it("calculates safe-to-spend after commitments and buffer", () => {
    const input = {
      currentCash: 3905.7,
      billsDueBeforePayday: 1659.89,
      plannedSavingsBeforePayday: 762,
      debtPaymentsBeforePayday: 340,
      minimumBuffer: mockUserProfile.minimumBuffer,
      reservedGoalContributions: 0,
    };

    expect(calculateSafeToSpendAmount(input)).toBeCloseTo(793.81, 2);
    expect(calculateSafeToSpend(input)).toBeCloseTo(793.81, 2);
  });

  it("calculates monthly income from transactions and manual income", () => {
    expect(
      calculateMonthlyIncome(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(3303.2, 2);

    expect(
      calculateMonthlyIncome(
        mockTransactionRecords,
        mockManualFinanceItems,
        projectionPeriod,
      ),
    ).toBe(3100);
  });

  it("calculates monthly spending from transactions and manual expenses", () => {
    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(1534, 2);

    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        projectionPeriod,
      ),
    ).toBe(234);
  });

  it("calculates spend by category", () => {
    const spend = calculateSpendByCategory(
      mockTransactionRecords,
      mockCategories,
      currentPeriod,
    );

    expect(spend.find((item) => item.category === "Home bills")?.spent).toBe(1236);
    expect(spend.find((item) => item.category === "Groceries")?.spent).toBeCloseTo(
      150.6,
      2,
    );
    expect(spend.find((item) => item.category === "Savings")).toBeUndefined();
  });

  it("excludes own-account transfers from spending", () => {
    expect(
      calculateMonthlySpending(
        mockTransactionRecords,
        mockManualFinanceItems,
        currentPeriod,
      ),
    ).toBeCloseTo(1534, 2);
  });

  it("calculates budget remaining and usage percentage", () => {
    const homeBillsBudget = mockBudgets.find(
      (budget) => budget.categoryId === "cat_home_bills",
    );

    if (!homeBillsBudget) {
      throw new Error("Expected home bills budget in mock data");
    }

    expect(calculateBudgetRemaining(homeBillsBudget, 1236)).toBe(-16);
    expect(calculateBudgetUsagePercentage(homeBillsBudget, 1236)).toBeCloseTo(
      1.0131,
      4,
    );
  });

  it("classifies budget pace according to expected spend", () => {
    expect(calculateBudgetPace(130, 200, 0.5).status).toBe("high");
    expect(calculateBudgetPace(131, 200, 0.5).status).toBe("risk");
    expect(calculateBudgetPace(105, 200, 0.5).status).toBe("on pace");
    expect(calculateBudgetPace(80, 200, 0.5).status).toBe("under pace");
  });

  it("calculates budget health rows", () => {
    const health = calculateBudgetHealth(
      mockBudgets,
      mockTransactionRecords,
      mockCategories,
      currentPeriod,
      1,
    );
    const homeBills = health.find((item) => item.category === "Home bills");

    expect(health).toHaveLength(5);
    expect(homeBills?.remaining).toBe(-16);
    expect(homeBills?.status).toBe("on pace");
  });

  it("respects transaction budget overrides without mutating raw transactions", () => {
    const account = {
      ...mockAccounts[0],
      id: "acct_budget_spend",
      institutionName: "Revolut",
      institutionId: "revolut",
      name: "Spending account",
      officialName: "Spending account",
      type: "current_account",
      subtype: "current",
      purpose: "everyday_spending",
      reservedFor: null,
    } satisfies Account;
    const purchase: Transaction = {
      ...mockTransactionRecords[0],
      id: "txn_override_purchase",
      accountId: account.id,
      merchant: "Coffee Shop",
      description: "Flat white",
      categoryId: "cat_eating_out",
      amount: -40,
      kind: "expense",
      flags: [],
      date: currentPeriod.startDate,
    };
    const rawBefore = { ...purchase };
    const exclude: TransactionBudgetOverride = {
      id: "txbo_txn_override_purchase",
      userId: account.userId,
      transactionId: purchase.id,
      accountId: purchase.accountId,
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      budgetCategory: purchase.categoryId,
      exclusionReason: "ignored",
      userNote: "Do not budget",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    expect(
      calculateBudgetTotal([purchase], [account], [], currentPeriod, "weekly"),
    ).toBe(40);
    expect(
      calculateBudgetTotal([purchase], [account], [exclude], currentPeriod, "weekly"),
    ).toBe(0);
    expect(purchase).toEqual(rawBefore);
  });

  it("defaults Amex payments, internal transfers and Amex pocket transfers out of budgets", () => {
    const account = {
      ...mockAccounts[0],
      name: "Revolut AMEX pocket",
      institutionName: "Revolut",
      purpose: "pocket",
      reservedFor: "amex",
    } satisfies Account;
    const transfer = {
      ...mockTransactionRecords[0],
      id: "txn_amex_pocket",
      accountId: account.id,
      description: "Transfer to AMEX pocket",
      merchant: "Revolut",
      amount: -50,
      kind: "transfer" as const,
      flags: [],
    };
    const treatment = getTransactionBudgetTreatment(transfer, account, null);

    expect(treatment.includeInWeeklyBudget).toBe(false);
    expect(treatment.includeInMonthlyBudget).toBe(false);
    expect(treatment.exclusionReason).toBe("amex_pocket_transfer");
  });

  it("calculates Amex funded and unfunded exposure from a reserved pocket", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_test",
      name: "Amex Platinum Cashback Credit Card",
      institutionName: "American Express",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: -300,
      balanceAvailable: true,
      includeInSafeToSpend: false,
    } satisfies Account;
    const pocket = {
      ...mockAccounts[0],
      id: "acct_revolut_amex_pocket",
      name: "AMEX",
      institutionName: "Revolut",
      type: "savings",
      subtype: "pocket",
      purpose: "pocket",
      balance: 225,
      reservedFor: "amex",
      includeInSafeToSpend: false,
      includeInNetWorth: true,
    } satisfies Account;

    expect(amexFundingSummary([amex, pocket])).toMatchObject({
      liabilityAccountId: amex.id,
      balanceKnown: true,
      liabilityBalance: 300,
      linkedPocketBalance: 225,
      fundedAmount: 225,
      unfundedAmount: 75,
    });
  });

  it("does not treat unavailable Amex balance as confirmed zero", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_unknown",
      name: "Amex Platinum Cashback Credit Card",
      institutionName: "American Express",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: 0,
      balanceAvailable: false,
      balanceUnavailableReason: "provider_balance_unavailable",
      includeInSafeToSpend: false,
    } satisfies Account;

    expect(amexFundingSummary([amex])).toMatchObject({
      liabilityAccountId: amex.id,
      balanceKnown: false,
      liabilityBalance: null,
      unfundedAmount: null,
    });
  });

  it("uses provider current credit-card balance before statement estimates", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_current",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: -420,
      balanceAvailable: true,
      balanceSource: "current",
      currentBalance: 420,
      statementBalance: 300,
      statementEndDate: "2026-06-20",
    } satisfies Account;
    const purchase = {
      ...mockTransactionRecords[0],
      id: "tx_amex_purchase",
      accountId: amex.id,
      date: "2026-06-25",
      amount: -100,
      kind: "expense",
      pending: false,
      providerStatus: "posted",
      merchant: "Cafe",
      description: "Cafe",
    } satisfies Transaction;

    expect(
      calculateCreditCardBalanceSummary({
        account: amex,
        transactions: [purchase],
        calculatedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      balanceUsedForPlanning: 420,
      balanceSource: "provider_current",
      confidence: "confirmed",
      estimatedCurrentBalance: null,
    });
  });

  it("estimates Amex current balance from statement balance plus purchases minus payments", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_estimate",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: -500,
      balanceAvailable: true,
      balanceSource: "statement",
      currentBalance: null,
      statementBalance: 500,
      statementEndDate: "2026-06-20",
    } satisfies Account;
    const transactions = [
      {
        ...mockTransactionRecords[0],
        id: "tx_amex_purchase",
        accountId: amex.id,
        date: "2026-06-21",
        amount: -250,
        kind: "expense",
        pending: false,
        providerStatus: "posted",
        merchant: "Groceries",
        description: "Groceries",
      },
      {
        ...mockTransactionRecords[0],
        id: "tx_amex_payment",
        accountId: amex.id,
        date: "2026-06-22",
        amount: 100,
        kind: "income",
        pending: false,
        providerStatus: "posted",
        merchant: "Payment received",
        description: "Payment received",
      },
      {
        ...mockTransactionRecords[0],
        id: "tx_amex_refund",
        accountId: amex.id,
        date: "2026-06-23",
        amount: 40,
        kind: "income",
        pending: false,
        providerStatus: "posted",
        merchant: "Merchant refund",
        description: "Refund",
      },
      {
        ...mockTransactionRecords[0],
        id: "tx_amex_fee",
        accountId: amex.id,
        date: "2026-06-24",
        amount: -10,
        kind: "expense",
        pending: false,
        providerStatus: "posted",
        merchant: "Interest fee",
        description: "Interest fee",
      },
    ] satisfies Transaction[];

    expect(
      calculateCreditCardBalanceSummary({
        account: amex,
        transactions,
        calculatedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      balanceSource: "provider_statement_estimate",
      confidence: "estimated",
      providerStatementBalance: 500,
      postStatementPurchases: 250,
      postStatementPayments: 100,
      postStatementRefunds: 40,
      postStatementFees: 10,
      estimatedCurrentBalance: 620,
      balanceUsedForPlanning: 620,
      transactionsIncludedCount: 4,
    });
  });

  it("keeps credit-card balance unavailable without provider or manual anchor", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_unavailable",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: 0,
      balanceAvailable: false,
      balanceSource: "unavailable",
      statementBalance: null,
      statementEndDate: null,
    } satisfies Account;

    expect(calculateCreditCardBalanceSummary({ account: amex, transactions: [] })).toMatchObject({
      balanceUsedForPlanning: null,
      balanceSource: "unavailable",
      confidence: "unavailable",
    });
  });

  it("estimates from manual anchor when statement data is missing", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_manual_anchor",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: 0,
      balanceAvailable: false,
      balanceSource: "unavailable",
      statementBalance: null,
      statementEndDate: null,
      manualAnchorBalance: 400,
      manualAnchorDate: "2026-06-20",
    } satisfies Account;
    const purchase = {
      ...mockTransactionRecords[0],
      id: "tx_amex_manual_purchase",
      accountId: amex.id,
      date: "2026-06-21",
      amount: -25,
      kind: "expense",
      pending: false,
      providerStatus: "posted",
      merchant: "Shop",
      description: "Shop",
    } satisfies Transaction;

    expect(calculateCreditCardBalanceSummary({ account: amex, transactions: [purchase] })).toMatchObject({
      balanceSource: "manual_anchor_estimate",
      confidence: "estimated",
      estimatedCurrentBalance: 425,
      balanceUsedForPlanning: 425,
    });
  });

  it("excludes pending and manually excluded transactions from Amex estimate", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_exclusions",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: 0,
      balanceAvailable: true,
      balanceSource: "statement",
      statementBalance: 0,
      statementEndDate: "2026-06-20",
    } satisfies Account;
    const posted = {
      ...mockTransactionRecords[0],
      id: "tx_amex_posted",
      accountId: amex.id,
      date: "2026-06-21",
      amount: -30,
      kind: "expense",
      pending: false,
      providerStatus: "posted",
      merchant: "Included",
      description: "Included",
    } satisfies Transaction;
    const pending = {
      ...posted,
      id: "tx_amex_pending",
      amount: -50,
      pending: true,
      providerStatus: "pending",
    } satisfies Transaction;
    const manuallyExcluded = {
      ...posted,
      id: "tx_amex_manual_excluded",
      amount: -70,
      merchant: "Excluded",
    } satisfies Transaction;
    const override = {
      id: "txbo_tx_amex_manual_excluded",
      userId: amex.userId,
      transactionId: manuallyExcluded.id,
      accountId: amex.id,
      includeInWeeklyBudget: true,
      includeInMonthlyBudget: true,
      includeInSpendingSummaries: true,
      includeInSafeToSpendImpact: true,
      includeInCreditCardBalanceEstimate: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    } satisfies TransactionBudgetOverride;

    expect(
      calculateCreditCardBalanceSummary({
        account: amex,
        transactions: [posted, pending, manuallyExcluded],
        overrides: [override],
      }),
    ).toMatchObject({
      balanceSource: "provider_statement_estimate",
      estimatedCurrentBalance: 30,
      transactionsIncludedCount: 1,
      transactionsExcludedCount: 2,
    });
  });

  it("uses estimated Amex balance for pocket funding without adding excess reserve to spendable cash", () => {
    const amex = {
      ...mockAccounts[0],
      id: "acct_amex_pocket_estimate",
      institutionName: "American Express",
      name: "Amex Platinum Cashback Credit Card",
      type: "credit_card",
      subtype: "credit_card",
      purpose: "credit_card",
      balance: 0,
      balanceAvailable: true,
      balanceSource: "statement",
      statementBalance: 100,
      statementEndDate: "2026-06-20",
      includeInSafeToSpend: false,
    } satisfies Account;
    const pocket = {
      ...mockAccounts[0],
      id: "acct_revolut_amex_overfunded",
      name: "AMEX",
      institutionName: "Revolut",
      type: "savings",
      subtype: "pocket",
      purpose: "pocket",
      balance: 150,
      reservedFor: "amex",
      includeInSafeToSpend: false,
      includeInNetWorth: true,
    } satisfies Account;

    expect(amexFundingSummary([amex, pocket])).toMatchObject({
      balanceKnown: true,
      balanceSource: "provider_statement_estimate",
      confidence: "estimated",
      liabilityBalance: 100,
      fundedAmount: 100,
      unfundedAmount: 0,
      excessReserved: 50,
    });
  });

  it("projects month-end balance from cash, income, and outflows", () => {
    expect(
      calculateProjectedMonthEndBalance({
        currentCash: 1200,
        expectedIncome: 1800,
        plannedOutflows: 2100,
      }),
    ).toBe(900);
  });

  it("calculates savings goal progress", () => {
    const linkedBalance = calculateLinkedSavingsGoalBalance(
      mockAccounts,
      mockSavingsGoals[0].id,
    );
    const progress = calculateSavingsGoalProgress(mockSavingsGoals[0], linkedBalance);

    expect(progress.progressRatio).toBeCloseTo(0.428, 3);
    expect(progress.progressPercentage).toBeCloseTo(42.8, 1);
    expect(progress.remainingAmount).toBe(2860);
  });

  it("calculates linked savings goal balances from account links", () => {
    expect(calculateLinkedSavingsGoalBalance(mockAccounts, "goal_emergency_fund")).toBe(
      2140,
    );
    expect(calculateLinkedSavingsGoalBalance(mockAccounts, "goal_holiday")).toBe(520);
  });

  it("calculates total assets, liabilities, and net worth", () => {
    expect(calculateTotalAssets(mockAccounts, mockManualFinanceItems)).toBeCloseTo(
      25780.7,
      2,
    );
    expect(
      calculateTotalLiabilities(mockAccounts, mockDebts, mockManualFinanceItems),
    ).toBe(4440);
    expect(calculateNetWorth(mockAccounts, mockDebts, mockManualFinanceItems)).toBeCloseTo(
      21340.7,
      2,
    );
  });

  it("calculates debt summary from debts and payable manual items", () => {
    const summary = calculateDebtSummary(mockDebts, mockManualFinanceItems, mockAccounts);

    expect(summary.items).toHaveLength(4);
    expect(summary.totalDebt).toBe(4440);
    expect(summary.totalMinimumPayment).toBe(340);
    expect(summary.averageApr).toBeCloseTo(5.3333, 4);
  });

  it("marks expired consent as needs re-consent", () => {
    const revolutConnection = mockBankConnections.find(
      (connection) => connection.id === "conn_revolut",
    );

    if (!revolutConnection) {
      throw new Error("Expected Revolut connection in mock data");
    }

    expect(getConnectionLifecycleStatus(revolutConnection, asOfDate)).toBe(
      "needs_reconsent",
    );
  });

  it("mock provider adapter returns accounts and transactions", async () => {
    const accounts = await mockOpenBankingProvider.getAccounts("conn_nationwide");
    const transactions = await mockOpenBankingProvider.getTransactions("conn_nationwide");

    expect(accounts).toHaveLength(3);
    expect(accounts.map((account) => account.institutionName)).toContain("Nationwide");
    expect(transactions.some((transaction) => transaction.isOwnAccountTransfer)).toBe(true);
  });
});
