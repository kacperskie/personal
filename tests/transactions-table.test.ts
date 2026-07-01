import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "../src/lib/domain";
import {
  filterTransactionRows,
  sortTransactionRows,
  transactionDirectionDisplay,
  type TransactionRow,
} from "../src/lib/transactions/table";
import { planCreditCardRecategorisation, recategoriseCreditCardIncome } from "../src/lib/transactions/recategorise";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t",
    accountId: "acc",
    categoryId: "cat_unknown",
    date: "2026-07-01",
    merchant: "MERCHANT",
    description: "MERCHANT",
    amount: -10,
    currency: "GBP",
    kind: "expense",
    status: "needs_review",
    flags: [],
    pending: false,
    providerStatus: "posted",
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    accountName: "Revolut",
    institutionName: "Revolut",
    categoryName: "Unknown",
    isCreditCard: false,
    ...overrides,
  } as TransactionRow;
}

const baseFilters = {
  search: "",
  accountId: "all",
  institution: "all",
  month: "all",
  categoryId: "all",
  providerStatus: "all" as const,
  reviewStatus: "all" as const,
};

describe("transaction table sorting", () => {
  const rows = [
    row({ id: "a", date: "2026-07-01", amount: -5, merchant: "Boots", categoryName: "Personal" }),
    row({ id: "b", date: "2026-07-03", amount: -50, merchant: "Amazon", categoryName: "Groceries" }),
    row({ id: "c", date: "2026-07-02", amount: 200, merchant: "Salary", categoryName: "Income" }),
  ];

  it("sorts by date asc/desc", () => {
    expect(sortTransactionRows(rows, "date", "asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(sortTransactionRows(rows, "date", "desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by numeric amount, not formatted string", () => {
    expect(sortTransactionRows(rows, "amount", "asc").map((r) => r.amount)).toEqual([-50, -5, 200]);
    expect(sortTransactionRows(rows, "amount", "desc").map((r) => r.amount)).toEqual([200, -5, -50]);
  });

  it("sorts by merchant and category alphabetically", () => {
    expect(sortTransactionRows(rows, "merchant", "asc").map((r) => r.merchant)).toEqual([
      "Amazon",
      "Boots",
      "Salary",
    ]);
    expect(sortTransactionRows(rows, "category", "asc").map((r) => r.categoryName)).toEqual([
      "Groceries",
      "Income",
      "Personal",
    ]);
  });

  it("is stable (ties break by id) and does not mutate input", () => {
    const tied = [row({ id: "y", date: "2026-07-01" }), row({ id: "x", date: "2026-07-01" })];
    const snapshot = tied.map((r) => r.id);
    expect(sortTransactionRows(tied, "date", "asc").map((r) => r.id)).toEqual(["x", "y"]);
    expect(tied.map((r) => r.id)).toEqual(snapshot);
  });
});

describe("transaction table filtering", () => {
  const rows = [
    row({ id: "a", merchant: "Boots", accountId: "amex", institutionName: "American Express", pending: false, status: "needs_review", categoryId: "cat_personal" }),
    row({ id: "b", merchant: "Salary", accountId: "cur", institutionName: "Revolut", pending: true, providerStatus: "pending", status: "reviewed", categoryId: "cat_income" }),
    row({ id: "c", merchant: "Uber", accountId: "amex", institutionName: "American Express", status: "reviewed", categoryId: "cat_transport" }),
  ];

  it("filters by text search on merchant/description", () => {
    expect(filterTransactionRows(rows, { ...baseFilters, search: "boot" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by account and institution", () => {
    expect(filterTransactionRows(rows, { ...baseFilters, accountId: "amex" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterTransactionRows(rows, { ...baseFilters, institution: "Revolut" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by category and review status", () => {
    expect(filterTransactionRows(rows, { ...baseFilters, categoryId: "cat_transport" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterTransactionRows(rows, { ...baseFilters, reviewStatus: "needs_review" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterTransactionRows(rows, { ...baseFilters, reviewStatus: "reviewed" }).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("filters by provider status posted/pending", () => {
    expect(filterTransactionRows(rows, { ...baseFilters, providerStatus: "pending" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterTransactionRows(rows, { ...baseFilters, providerStatus: "posted" }).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("transaction direction display", () => {
  it("shows a credit-card purchase (positive) as spend/outflow, not income", () => {
    const d = transactionDirectionDisplay({ amount: 21.8, kind: "expense", flags: [], isCreditCard: true });
    expect(d.direction).toBe("outflow");
    expect(d.label).toBe("spend");
  });

  it("shows a credit-card negative as refund/credit inflow", () => {
    const d = transactionDirectionDisplay({ amount: -300, kind: "transfer", flags: [], isCreditCard: true });
    // transfer wins first (repayment) -> neutral
    expect(d.direction).toBe("neutral");
  });

  it("shows bank income as inflow", () => {
    const d = transactionDirectionDisplay({ amount: 2000, kind: "income", flags: [], isCreditCard: false });
    expect(d.direction).toBe("inflow");
  });

  it("shows a transfer as neutral", () => {
    const d = transactionDirectionDisplay({ amount: 50, kind: "transfer", flags: ["own_account_transfer"], isCreditCard: false });
    expect(d.direction).toBe("neutral");
    expect(d.label).toBe("transfer");
  });
});

describe("recategorise stored credit-card income", () => {
  const amex: Account = { id: "amex", type: "credit_card", institutionName: "American Express", name: "Amex" } as unknown as Account;
  const bank: Account = { id: "cur", type: "current_account", institutionName: "Revolut", name: "Revolut" } as unknown as Account;

  function tx(overrides: Partial<Transaction>): Transaction {
    return {
      id: "t1",
      accountId: "amex",
      categoryId: "cat_income",
      date: "2026-07-01",
      merchant: "AMAZON",
      description: "AMAZON",
      amount: 21.8,
      currency: "GBP",
      kind: "income",
      status: "needs_review",
      flags: [],
      pending: false,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      ...overrides,
    } as Transaction;
  }

  it("corrects a credit-card cat_income purchase to a spending category and expense kind", () => {
    const fixed = recategoriseCreditCardIncome(tx({}), amex);
    expect(fixed).not.toBeNull();
    expect(fixed?.categoryId).toBe("cat_personal");
    expect(fixed?.kind).toBe("expense");
  });

  it("does not touch non-credit-card income", () => {
    expect(recategoriseCreditCardIncome(tx({ accountId: "cur" }), bank)).toBeNull();
  });

  it("does not touch credit-card rows that are not cat_income", () => {
    expect(recategoriseCreditCardIncome(tx({ categoryId: "cat_transport" }), amex)).toBeNull();
  });

  it("does not mutate the input transaction", () => {
    const input = tx({});
    const snapshot = JSON.stringify(input);
    recategoriseCreditCardIncome(input, amex);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("plans corrections only for matching rows", () => {
    const corrected = planCreditCardRecategorisation(
      [tx({ id: "a" }), tx({ id: "b", accountId: "cur", categoryId: "cat_income" }), tx({ id: "c", categoryId: "cat_transport" })],
      [amex, bank],
    );
    expect(corrected.map((t) => t.id)).toEqual(["a"]);
  });
});
