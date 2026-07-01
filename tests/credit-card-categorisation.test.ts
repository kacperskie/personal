import { describe, expect, it } from "vitest";
import {
  deterministicProviderCategory,
  providerTransactionToTransaction,
} from "../src/lib/bank-providers/provider-mappers";
import type { ProviderTransaction } from "../src/lib/domain";

function tx(overrides: Partial<ProviderTransaction>): ProviderTransaction {
  return {
    id: "p1",
    providerConnectionId: "conn_amex",
    providerAccountId: "card_amex",
    providerTransactionId: "t1",
    date: "2026-07-01",
    providerUpdatedAt: null,
    merchant: "MERCHANT",
    description: "MERCHANT",
    amount: 21.8, // TrueLayer signs Amex purchases positive
    currency: "GBP",
    pending: false,
    category: null,
    isOwnAccountTransfer: false,
    ...overrides,
  };
}

const card = { isCreditCard: true } as const;

describe("credit-card (Amex) categorisation and sign", () => {
  it("an Amex purchase (positive amount) is never income", () => {
    for (const name of ["BOOTS THE CHEMIST", "AMAZON", "UBER TRIP", "TRAINLINE", "SPOTIFY"]) {
      const category = deterministicProviderCategory(
        tx({ merchant: name, description: name }),
        card,
      );
      expect(category).not.toBe("cat_income");
    }
  });

  it("classifies known Amex merchants into spending categories", () => {
    expect(deterministicProviderCategory(tx({ description: "UBER TRIP" }), card)).toBe("cat_transport");
    expect(deterministicProviderCategory(tx({ description: "TRAINLINE" }), card)).toBe("cat_transport");
    expect(deterministicProviderCategory(tx({ description: "AMAZON" }), card)).toBe("cat_personal");
    expect(deterministicProviderCategory(tx({ description: "BOOTS THE CHEMIST" }), card)).toBe("cat_personal");
    expect(deterministicProviderCategory(tx({ description: "SPOTIFY" }), card)).toBe("cat_bills_subscriptions");
  });

  it("an unknown Amex merchant becomes needs_review (cat_unknown), not income", () => {
    const category = deterministicProviderCategory(tx({ description: "ZZQ OBSCURE CO" }), card);
    expect(category).toBe("cat_unknown");
  });

  it("an Amex payment (negative amount) is a repayment, not spending or income", () => {
    const payment = tx({ description: "PAYMENT RECEIVED THANK YOU", amount: -300 });
    expect(deterministicProviderCategory(payment, card)).toBe("cat_debt_payments");
    const mapped = providerTransactionToTransaction(payment, "acct_amex", { isCreditCard: true });
    expect(mapped.kind).toBe("transfer"); // not income, not expense
  });

  it("an Amex purchase maps to an expense kind (spend), not income", () => {
    const purchase = providerTransactionToTransaction(
      tx({ description: "AMAZON", amount: 21.8 }),
      "acct_amex",
      { isCreditCard: true },
    );
    expect(purchase.kind).toBe("expense");
    expect(purchase.categoryId).not.toBe("cat_income");
  });

  it("bank income (positive on a non-card account) is still income", () => {
    const salary = tx({
      providerAccountId: "acc_current",
      description: "ACME PAYROLL",
      amount: 2000,
    });
    expect(deterministicProviderCategory(salary)).toBe("cat_income");
    const mapped = providerTransactionToTransaction(salary, "acct_current");
    expect(mapped.kind).toBe("income");
  });

  it("an own-account transfer is a transfer on any account type", () => {
    const transfer = tx({ description: "TRANSFER TO POCKET", isOwnAccountTransfer: true, amount: 50 });
    expect(deterministicProviderCategory(transfer, card)).toBe("cat_transfers");
    expect(providerTransactionToTransaction(transfer, "acct_x", { isCreditCard: true }).kind).toBe(
      "transfer",
    );
  });

  it("does not mutate the raw provider transaction", () => {
    const raw = tx({ description: "AMAZON", amount: 21.8 });
    const snapshot = JSON.stringify(raw);
    providerTransactionToTransaction(raw, "acct_amex", { isCreditCard: true });
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});
