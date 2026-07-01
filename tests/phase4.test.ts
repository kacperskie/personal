import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConnectionLifecycleStatus } from "../src/lib/finance";
import {
  createManualFinanceItem,
  deleteManualFinanceItem,
  getAccounts,
  updateManualFinanceItem,
} from "../src/lib/repositories/finance-repository";
import { createAuditEvent } from "../src/lib/repositories/audit";
import {
  createAccountUpdatePayload,
  validateManualFinanceItemInput,
} from "../src/lib/repositories/validation";
import {
  mockAccounts,
  mockBankConnections,
  mockManualFinanceItems,
} from "../src/lib/mock-data";

const userOwnedTables = [
  "profiles",
  "accounts",
  "bank_connections",
  "provider_accounts",
  "transactions",
  "categories",
  "budgets",
  "budget_periods",
  "bills",
  "subscriptions",
  "savings_goals",
  "debts",
  "manual_finance_items",
  "net_worth_snapshots",
  "ai_insights",
  "alerts",
  "provider_sync_events",
  "provider_tokens",
  "audit_log",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 4 persistence foundation", () => {
  it("uses mock repository fallback when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    await expect(getAccounts()).resolves.toEqual(mockAccounts);
  });

  it("creates account assignment update payloads", () => {
    const payload = createAccountUpdatePayload({
      id: "acct_1",
      purpose: "bills_account",
      includeInSafeToSpend: false,
      includeInCashflow: true,
      includeInNetWorth: true,
      linkedGoalIds: ["goal_1"],
    });

    expect(payload).toEqual({
      id: "acct_1",
      purpose: "bills_account",
      includeInSafeToSpend: false,
      includeInCashflow: true,
      includeInNetWorth: true,
      linkedGoalIds: ["goal_1"],
      reservedFor: null,
      linkedLiabilityAccountId: null,
      overdraftLimit: null,
      overdraftRepaymentTarget: null,
    });
  });

  it("validates manual finance item create and update inputs", async () => {
    const source = mockManualFinanceItems[0];
    const input = {
      id: source.id,
      name: source.name,
      type: source.type,
      direction: source.direction,
      amount: source.amount,
      currency: source.currency,
      dueDate: source.dueDate,
      recurrence: source.recurrence,
      apr: source.apr,
      minimumPayment: source.minimumPayment,
      counterparty: source.counterparty,
      includeInCashflow: source.includeInCashflow,
      includeInNetWorth: source.includeInNetWorth,
      notes: source.notes,
      status: source.status,
      reviewDate: source.reviewDate,
    };

    expect(() =>
      validateManualFinanceItemInput({ ...input, name: " " }),
    ).toThrow("Manual finance item name is required.");
    expect(() =>
      validateManualFinanceItemInput({ ...input, amount: -1 }),
    ).toThrow("Manual finance item amount must be a positive number.");

    const created = await createManualFinanceItem({
      ...input,
      id: "manual_phase4_test",
      name: "Phase 4 manual bill",
      amount: 42,
    });
    const updated = await updateManualFinanceItem({
      ...created,
      amount: 55,
      status: "confirmed",
    });
    const deleted = await deleteManualFinanceItem(updated.id);

    expect(created.name).toBe("Phase 4 manual bill");
    expect(updated.amount).toBe(55);
    expect(updated.status).toBe("confirmed");
    expect(deleted).toEqual({ id: "manual_phase4_test" });
  });

  it("keeps RLS policies in the SQL migration for every user-owned table", () => {
    const migrationPath = path.resolve(
      "supabase/migrations/20260701000000_phase4_secure_foundation.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    for (const table of userOwnedTables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`'${table}'`);
      expect(sql).toMatch(
        new RegExp(
          `create table if not exists public\\.${table} \\([\\s\\S]*?user_id uuid not null`,
        ),
      );
    }

    expect(sql).toContain("for select to authenticated using (auth.uid() = user_id)");
    expect(sql).toContain("for insert to authenticated with check (auth.uid() = user_id)");
    expect(sql).toContain("for update to authenticated using (auth.uid() = user_id)");
    expect(sql).toContain("for delete to authenticated using (auth.uid() = user_id)");
  });

  it("keeps provider token access behind a server-only module", () => {
    const tokenStore = fs.readFileSync(
      path.resolve("src/lib/bank-providers/token-store.ts"),
      "utf8",
    );

    expect(tokenStore).toContain('import "server-only"');
    expect(tokenStore).toContain("must never be exposed to the browser");
    expect(tokenStore).toContain("server-side");
    expect(tokenStore).toContain("encrypted storage");
  });

  it("marks expired consent as needs re-consent", () => {
    const connection = mockBankConnections.find((item) => item.id === "conn_revolut");

    if (!connection) {
      throw new Error("Expected Revolut mock connection");
    }

    expect(getConnectionLifecycleStatus(connection, "2026-06-30")).toBe(
      "needs_reconsent",
    );
  });

  it("creates audit event payloads without side effects", () => {
    const event = createAuditEvent({
      userId: "user_123",
      eventType: "manual_finance_item_created",
      entity: "manual_finance_items",
      entityId: "manual_123",
      metadata: { name: "Council tax" },
    });

    expect(event.user_id).toBe("user_123");
    expect(event.event_type).toBe("manual_finance_item_created");
    expect(event.entity).toBe("manual_finance_items");
    expect(event.entity_id).toBe("manual_123");
    expect(event.metadata).toEqual({ name: "Council tax" });
    expect(Date.parse(event.created_at)).not.toBeNaN();
  });
});
