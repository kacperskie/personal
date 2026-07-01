import { describe, expect, it } from "vitest";
import type { Account, Transaction, TransactionBudgetOverride } from "../src/lib/domain";
import {
  budgetOverrideChangesForAction,
  createTransactionBudgetOverride,
  getTransactionBudgetTreatment,
} from "../src/lib/finance-interpretation";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    accountId: "acc",
    categoryId: "cat_personal",
    date: "2026-07-01",
    merchant: "SHOP",
    description: "SHOP",
    amount: -20,
    currency: "GBP",
    kind: "expense",
    status: "needs_review",
    flags: [],
    pending: false,
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as Transaction;
}

const bankAccount = { id: "acc", type: "current_account", institutionName: "Revolut", name: "Revolut" } as unknown as Account;

describe("budgetOverrideChangesForAction", () => {
  it("include sets weekly+monthly true and clears exclusion, marks reviewed", () => {
    const c = budgetOverrideChangesForAction("include");
    expect(c.includeInWeeklyBudget).toBe(true);
    expect(c.includeInMonthlyBudget).toBe(true);
    expect(c.exclusionReason).toBeNull();
    expect(c.reviewed).toBe(true);
  });

  it("exclude_weekly only excludes weekly and marks reviewed", () => {
    const c = budgetOverrideChangesForAction("exclude_weekly");
    expect(c.includeInWeeklyBudget).toBe(false);
    expect(c.includeInMonthlyBudget).toBeUndefined();
    expect(c.reviewed).toBe(true);
  });

  it("internal_transfer excludes weekly+monthly with reason", () => {
    const c = budgetOverrideChangesForAction("internal_transfer");
    expect(c.includeInWeeklyBudget).toBe(false);
    expect(c.includeInMonthlyBudget).toBe(false);
    expect(c.exclusionReason).toBe("internal_transfer");
  });

  it("bill excludes weekly but includes monthly", () => {
    const c = budgetOverrideChangesForAction("bill");
    expect(c.includeInWeeklyBudget).toBe(false);
    expect(c.includeInMonthlyBudget).toBe(true);
    expect(c.exclusionReason).toBe("bill");
  });
});

describe("createTransactionBudgetOverride (row edits)", () => {
  it("a single weekly toggle preserves monthly at its deterministic default", () => {
    const override = createTransactionBudgetOverride({
      userId: "user_1",
      transaction: tx({}),
      account: bankAccount,
      changes: { includeInWeeklyBudget: false, reviewed: true },
    });
    // ordinary spend defaults monthly=true; only weekly was changed.
    expect(override.includeInWeeklyBudget).toBe(false);
    expect(override.includeInMonthlyBudget).toBe(true);
    expect(override.reviewed).toBe(true);
    expect(override.userId).toBe("user_1");
    expect(override.transactionId).toBe("t1");
  });

  it("category change saves budgetCategory and marks reviewed", () => {
    const override = createTransactionBudgetOverride({
      userId: "user_1",
      transaction: tx({}),
      account: bankAccount,
      changes: { budgetCategory: "cat_groceries", reviewed: true },
    });
    expect(override.budgetCategory).toBe("cat_groceries");
    expect(override.reviewed).toBe(true);
  });

  it("stamps the acting user's id (repository scopes writes to that user)", () => {
    const override = createTransactionBudgetOverride({
      userId: "user_A",
      transaction: tx({}),
      account: bankAccount,
      changes: budgetOverrideChangesForAction("ignored"),
    });
    expect(override.userId).toBe("user_A");
  });

  it("does not mutate the raw transaction", () => {
    const raw = tx({});
    const snapshot = JSON.stringify(raw);
    createTransactionBudgetOverride({ userId: "u", transaction: raw, account: bankAccount, changes: { includeInWeeklyBudget: false } });
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});

describe("manual override wins over deterministic classification", () => {
  const transferOverride = (changes: Partial<TransactionBudgetOverride>): TransactionBudgetOverride =>
    ({
      id: "o",
      userId: "u",
      transactionId: "t1",
      accountId: "acc",
      includeInWeeklyBudget: false,
      includeInMonthlyBudget: false,
      includeInSpendingSummaries: false,
      includeInSafeToSpendImpact: false,
      budgetCategory: null,
      exclusionReason: null,
      createdAt: "x",
      updatedAt: "x",
      ...changes,
    }) as TransactionBudgetOverride;

  it("manual exclude wins even when default would include (ordinary spend)", () => {
    const ordinary = tx({}); // deterministic weekly=true
    expect(getTransactionBudgetTreatment(ordinary, bankAccount, null).includeInWeeklyBudget).toBe(true);
    const treatment = getTransactionBudgetTreatment(
      ordinary,
      bankAccount,
      transferOverride({ includeInWeeklyBudget: false }),
    );
    expect(treatment.includeInWeeklyBudget).toBe(false);
    expect(treatment.source).toBe("user");
  });

  it("manual include wins even when default would exclude (internal transfer)", () => {
    const transfer = tx({ flags: ["own_account_transfer"], kind: "transfer" });
    expect(getTransactionBudgetTreatment(transfer, bankAccount, null).includeInWeeklyBudget).toBe(false);
    const treatment = getTransactionBudgetTreatment(
      transfer,
      bankAccount,
      transferOverride({ includeInWeeklyBudget: true, includeInMonthlyBudget: true }),
    );
    expect(treatment.includeInWeeklyBudget).toBe(true);
    expect(treatment.source).toBe("user");
  });
});
