import { describe, expect, it } from "vitest";
import type { BankConnection } from "../src/lib/domain";
import {
  moneyhubAccountPayload,
  moneyhubTransactionPayload,
} from "../src/lib/bank-providers/moneyhub-provider";
import {
  mapProviderAccountPayload,
  mapProviderTransactionPayload,
  providerAccountToAccount,
  providerTransactionToTransaction,
} from "../src/lib/bank-providers/provider-mappers";
import {
  createProviderPayloadValidationReport,
  redactProviderPayload,
} from "../src/lib/bank-providers/provider-payload-inspection";
import {
  moneyhubAccountFixtureList,
  moneyhubAccountPayloadFixtures,
  moneyhubTransactionFixtureList,
  moneyhubTransactionPayloadFixtures,
} from "./fixtures/moneyhub-provider-payloads";

const connection: BankConnection = {
  id: "conn_moneyhub_fixture",
  provider: "moneyhub",
  institutionName: "Moneyhub synthetic",
  institutionId: "moneyhub_synthetic",
  status: "connected",
  consentStatus: "active",
  consentStartedAt: "2026-06-30T09:00:00.000Z",
  consentExpiresAt: "2026-09-30T09:00:00.000Z",
  lastSyncedAt: null,
  errorMessage: null,
  createdAt: "2026-06-30T09:00:00.000Z",
  updatedAt: "2026-06-30T09:00:00.000Z",
};

function mapAccount(fixture: unknown) {
  return mapProviderAccountPayload(moneyhubAccountPayload(fixture), connection);
}

function mapTransaction(fixture: unknown) {
  return mapProviderTransactionPayload(moneyhubTransactionPayload(fixture), connection.id);
}

describe("provider payload inspection and Moneyhub mapper hardening", () => {
  it("redacts tokens, account identifiers, names, addresses, and sensitive strings", () => {
    const redacted = redactProviderPayload({
      access_token: "secret-access-token",
      refresh_token: "secret-refresh-token",
      id: "provider-id-123",
      accountReference: "1234567890123456",
      accountHolderName: "Synthetic Full Name",
      creditorAccount: { name: "Synthetic Payee" },
      postalAddress: { line1: "1 Synthetic Street", postcode: "AA1 1AA" },
      iban: "GB82WEST12345698765432",
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain("secret-access-token");
    expect(serialized).not.toContain("secret-refresh-token");
    expect(serialized).not.toContain("provider-id-123");
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("Synthetic Full Name");
    expect(serialized).not.toContain("Synthetic Payee");
    expect(serialized).not.toContain("1 Synthetic Street");
    expect(serialized).not.toContain("GB82WEST12345698765432");
    expect(serialized).toContain("[redacted-secret]");
    expect(serialized).toContain("[redacted-name]");
    expect(serialized).toContain("[redacted-address]");
    expect(serialized).toContain("[redacted-id:");
  });

  it("reports account payload mapping coverage and unknown subtypes", () => {
    const report = createProviderPayloadValidationReport({
      provider: "moneyhub",
      kind: "account",
      payloads: moneyhubAccountFixtureList,
    });

    expect(report.payloadCount).toBe(moneyhubAccountFixtureList.length);
    expect(report.missingRequiredFields).toEqual([]);
    expect(report.optionalFieldsPresent).toContain("details.creditLimit");
    expect(report.optionalFieldsPresent).toContain("accountReference");
    expect(report.unmappedFields).toContain("rewardScheme.tier");
    expect(report.unknownAccountSubtypes).toContain("rewards:points");
  });

  it("reports transaction payload mapping coverage and unknown categories", () => {
    const report = createProviderPayloadValidationReport({
      provider: "moneyhub",
      kind: "transaction",
      payloads: moneyhubTransactionFixtureList,
    });

    expect(report.payloadCount).toBe(moneyhubTransactionFixtureList.length);
    expect(report.missingRequiredFields).toEqual([]);
    expect(report.optionalFieldsPresent).toContain("cardInstrument.cardSchemeName");
    expect(report.unmappedFields).toContain("enhancedCategories.primary");
    expect(report.unknownTransactionCategories).toContain("moneyhub:unmapped_category");
  });

  it("maps representative Moneyhub account fixtures into canonical provider accounts", () => {
    const amex = mapAccount(moneyhubAccountPayloadFixtures.amexCreditCard);
    const nationwideCurrent = mapAccount(moneyhubAccountPayloadFixtures.nationwideCurrent);
    const nationwideSavings = mapAccount(moneyhubAccountPayloadFixtures.nationwideSavings);
    const revolutCurrent = mapAccount(moneyhubAccountPayloadFixtures.revolutCurrent);
    const revolutPocket = mapAccount(moneyhubAccountPayloadFixtures.revolutPocket);

    expect(amex.type).toBe("credit_card");
    expect(amex.balance).toBe(-320.75);
    expect(amex.creditLimit).toBe(2500);
    expect(nationwideCurrent.type).toBe("current_account");
    expect(nationwideSavings.type).toBe("savings");
    expect(revolutCurrent.type).toBe("current_account");
    expect(revolutPocket.type).toBe("savings");
    expect(revolutPocket.subtype).toBe("vault");
  });

  it("applies account-purpose suggestions after Moneyhub account mapping", () => {
    const amex = providerAccountToAccount(
      mapAccount(moneyhubAccountPayloadFixtures.amexCreditCard),
      "user_fixture",
      "moneyhub",
    );
    const nationwideCurrent = providerAccountToAccount(
      mapAccount(moneyhubAccountPayloadFixtures.nationwideCurrent),
      "user_fixture",
      "moneyhub",
    );
    const nationwideSavings = providerAccountToAccount(
      mapAccount(moneyhubAccountPayloadFixtures.nationwideSavings),
      "user_fixture",
      "moneyhub",
    );
    const revolutCurrent = providerAccountToAccount(
      mapAccount(moneyhubAccountPayloadFixtures.revolutCurrent),
      "user_fixture",
      "moneyhub",
    );
    const revolutPocket = providerAccountToAccount(
      mapAccount(moneyhubAccountPayloadFixtures.revolutPocket),
      "user_fixture",
      "moneyhub",
    );

    expect(amex.purpose).toBe("credit_card");
    expect(amex.includeInSafeToSpend).toBe(false);
    expect(nationwideCurrent.purpose).toBe("main_current_account");
    expect(nationwideSavings.purpose).toBe("emergency_fund");
    expect(revolutCurrent.purpose).toBe("everyday_spending");
    expect(revolutPocket.purpose).toBe("pocket");
    expect(revolutPocket.includeInSafeToSpend).toBe(false);
  });

  it("maps representative Moneyhub transaction fixtures into canonical provider transactions", () => {
    const pending = mapTransaction(moneyhubTransactionPayloadFixtures.pendingTransaction);
    const card = mapTransaction(moneyhubTransactionPayloadFixtures.cardTransaction);
    const salary = mapTransaction(moneyhubTransactionPayloadFixtures.incomingSalary);
    const directDebit = mapTransaction(moneyhubTransactionPayloadFixtures.directDebit);
    const standingOrder = mapTransaction(moneyhubTransactionPayloadFixtures.standingOrder);
    const internalTransfer = mapTransaction(moneyhubTransactionPayloadFixtures.internalTransfer);
    const cardRepayment = mapTransaction(moneyhubTransactionPayloadFixtures.creditCardRepayment);

    expect(pending.pending).toBe(true);
    expect(card.amount).toBe(-48.2);
    expect(card.merchant).toBe("Synthetic Grocers");
    expect(salary.amount).toBe(2850);
    expect(directDebit.isOwnAccountTransfer).toBe(false);
    expect(standingOrder.isOwnAccountTransfer).toBe(false);
    expect(internalTransfer.isOwnAccountTransfer).toBe(true);
    expect(cardRepayment.isOwnAccountTransfer).toBe(true);
  });

  it("keeps transfer, income, and pending transaction kinds deterministic", () => {
    const pending = providerTransactionToTransaction(
      mapTransaction(moneyhubTransactionPayloadFixtures.pendingTransaction),
      "acct_fixture",
    );
    const salary = providerTransactionToTransaction(
      mapTransaction(moneyhubTransactionPayloadFixtures.incomingSalary),
      "acct_fixture",
    );
    const internalTransfer = providerTransactionToTransaction(
      mapTransaction(moneyhubTransactionPayloadFixtures.internalTransfer),
      "acct_fixture",
    );
    const cardRepayment = providerTransactionToTransaction(
      mapTransaction(moneyhubTransactionPayloadFixtures.creditCardRepayment),
      "acct_fixture",
    );

    expect(pending.status).toBe("suggested");
    expect(salary.kind).toBe("income");
    expect(internalTransfer.kind).toBe("transfer");
    expect(cardRepayment.kind).toBe("transfer");
  });
});
