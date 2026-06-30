import type {
  Account,
  BankConnection,
  Bill,
  Budget,
  ManualFinanceItem,
  ProviderSyncEvent,
  SavingsGoal,
  Transaction,
} from "@/lib/domain";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgets,
  mockManualFinanceItems,
  mockSavingsGoals,
  mockTransactionRecords,
} from "@/lib/mock-data";
import {
  accountFromRow,
  accountToRow,
  bankConnectionFromRow,
  bankConnectionToRow,
  billFromRow,
  budgetFromRow,
  manualFinanceItemFromRow,
  manualFinanceItemToRow,
  savingsGoalFromRow,
  transactionFromRow,
} from "@/lib/repositories/mappers";
import { createAuditEvent } from "@/lib/repositories/audit";
import type { AuditEventInput } from "@/lib/repositories/audit";
import {
  createAccountUpdatePayload,
  validateManualFinanceItemInput,
  type AccountUpdatePayload,
  type ManualFinanceItemInput,
} from "@/lib/repositories/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function getAuthenticatedContext() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { supabase, userId: user.id };
}

async function writeAudit(
  userId: string,
  event: ReturnType<typeof createAuditEvent>,
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
) {
  await supabase.from("audit_log").insert({
    ...event,
    user_id: userId,
  });
}

export async function recordAuditEvent(input: AuditEventInput) {
  const context = await getAuthenticatedContext();
  const event = createAuditEvent({
    ...input,
    userId: context?.userId ?? input.userId,
  });

  if (!context) {
    return event;
  }

  await writeAudit(context.userId, event, context.supabase);
  return event;
}

export async function getAccounts(): Promise<Account[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockAccounts;
  }

  const { data, error } = await context.supabase
    .from("accounts")
    .select("*")
    .order("institution_name");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(accountFromRow);
}

export async function upsertAccount(account: Account): Promise<Account> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return account;
  }

  const row = accountToRow({ ...account, userId: context.userId });
  const { data, error } = await context.supabase
    .from("accounts")
    .upsert(row)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "account_purpose_changed",
      entity: "accounts",
      entityId: account.id,
      metadata: { purpose: account.purpose },
    }),
    context.supabase,
  );

  return accountFromRow(data);
}

export async function updateAccountAssignment(
  payload: AccountUpdatePayload,
): Promise<AccountUpdatePayload> {
  const updatePayload = createAccountUpdatePayload(payload);
  const context = await getAuthenticatedContext();

  if (!context) {
    return updatePayload;
  }

  const { error } = await context.supabase
    .from("accounts")
    .update({
      purpose: updatePayload.purpose,
      include_in_safe_to_spend: updatePayload.includeInSafeToSpend,
      include_in_cashflow: updatePayload.includeInCashflow,
      include_in_net_worth: updatePayload.includeInNetWorth,
      linked_goal_ids: updatePayload.linkedGoalIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", updatePayload.id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "account_inclusion_flag_changed",
      entity: "accounts",
      entityId: updatePayload.id,
      metadata: updatePayload,
    }),
    context.supabase,
  );
  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "account_purpose_changed",
      entity: "accounts",
      entityId: updatePayload.id,
      metadata: {
        purpose: updatePayload.purpose,
        linkedGoalIds: updatePayload.linkedGoalIds,
      },
    }),
    context.supabase,
  );

  return updatePayload;
}

export async function getManualFinanceItems(): Promise<ManualFinanceItem[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockManualFinanceItems;
  }

  const { data, error } = await context.supabase
    .from("manual_finance_items")
    .select("*")
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(manualFinanceItemFromRow);
}

export async function createManualFinanceItem(
  input: ManualFinanceItemInput,
): Promise<ManualFinanceItem> {
  const now = new Date().toISOString();
  const item: ManualFinanceItem = {
    ...validateManualFinanceItemInput(input),
    createdAt: now,
    updatedAt: now,
  };
  const context = await getAuthenticatedContext();

  if (!context) {
    return item;
  }

  const { data, error } = await context.supabase
    .from("manual_finance_items")
    .insert(manualFinanceItemToRow(item, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "manual_finance_item_created",
      entity: "manual_finance_items",
      entityId: item.id,
      metadata: { name: item.name, type: item.type },
    }),
    context.supabase,
  );

  return manualFinanceItemFromRow(data);
}

export async function updateManualFinanceItem(
  input: ManualFinanceItem,
): Promise<ManualFinanceItem> {
  const item = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  validateManualFinanceItemInput(item);
  const context = await getAuthenticatedContext();

  if (!context) {
    return item;
  }

  const { data, error } = await context.supabase
    .from("manual_finance_items")
    .update(manualFinanceItemToRow(item, context.userId))
    .eq("id", item.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "manual_finance_item_updated",
      entity: "manual_finance_items",
      entityId: item.id,
      metadata: { name: item.name, status: item.status },
    }),
    context.supabase,
  );

  return manualFinanceItemFromRow(data);
}

export async function deleteManualFinanceItem(id: string): Promise<{ id: string }> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return { id };
  }

  const { error } = await context.supabase
    .from("manual_finance_items")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "manual_finance_item_deleted",
      entity: "manual_finance_items",
      entityId: id,
    }),
    context.supabase,
  );

  return { id };
}

export async function getBankConnections(): Promise<BankConnection[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockBankConnections;
  }

  const { data, error } = await context.supabase
    .from("bank_connections")
    .select("*")
    .order("institution_name");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(bankConnectionFromRow);
}

export async function upsertBankConnection(
  connection: BankConnection,
): Promise<BankConnection> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return connection;
  }

  const { data, error } = await context.supabase
    .from("bank_connections")
    .upsert(bankConnectionToRow(connection, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "bank_connection_created",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: {
        provider: connection.provider,
        institutionName: connection.institutionName,
      },
    }),
    context.supabase,
  );
  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "bank_connection_status_changed",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: {
        status: connection.status,
        consentStatus: connection.consentStatus,
      },
    }),
    context.supabase,
  );
  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "consent_status_changed",
      entity: "bank_connections",
      entityId: connection.id,
      metadata: {
        consentStatus: connection.consentStatus,
        consentExpiresAt: connection.consentExpiresAt,
      },
    }),
    context.supabase,
  );

  return bankConnectionFromRow(data);
}

export async function getBankConnectionById(id: string): Promise<BankConnection | null> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockBankConnections.find((connection) => connection.id === id) ?? null;
  }

  const { data, error } = await context.supabase
    .from("bank_connections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? bankConnectionFromRow(data) : null;
}

export async function updateBankConnectionStatus(
  connection: BankConnection,
  eventType: "bank_connection_status_changed" | "bank_connection_sync_failed" | "bank_connection_revoked" = "bank_connection_status_changed",
): Promise<BankConnection> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return connection;
  }

  const { data, error } = await context.supabase
    .from("bank_connections")
    .update(bankConnectionToRow(connection, context.userId))
    .eq("id", connection.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType,
      entity: "bank_connections",
      entityId: connection.id,
      metadata: {
        status: connection.status,
        consentStatus: connection.consentStatus,
      },
    }),
    context.supabase,
  );

  return bankConnectionFromRow(data);
}

export async function recordProviderSyncEvent(
  event: ProviderSyncEvent,
): Promise<ProviderSyncEvent> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return event;
  }

  const { data, error } = await context.supabase
    .from("provider_sync_events")
    .insert({
      id: event.id,
      user_id: context.userId,
      provider_connection_id: event.providerConnectionId,
      provider: event.provider,
      status: event.status,
      message: event.message,
      started_at: event.startedAt,
      finished_at: event.finishedAt,
      created_at: event.startedAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "provider_sync_event_created",
      entity: "provider_sync_events",
      entityId: event.id,
      metadata: {
        providerConnectionId: event.providerConnectionId,
        status: event.status,
      },
    }),
    context.supabase,
  );

  return {
    id: data.id,
    providerConnectionId: data.provider_connection_id,
    provider: data.provider,
    status: data.status,
    message: data.message,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
  };
}

export async function upsertTransaction(transaction: Transaction): Promise<Transaction> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return transaction;
  }

  await context.supabase.from("categories").upsert({
    id: transaction.categoryId,
    user_id: context.userId,
    name: transaction.categoryId === "cat_uncategorised" ? "Uncategorised" : transaction.categoryId,
    parent_id: null,
    kind: transaction.kind,
    budget_type: "transfer",
    include_in_budget: transaction.kind === "expense",
    status: "active",
  });

  const { data, error } = await context.supabase
    .from("transactions")
    .upsert({
      id: transaction.id,
      user_id: context.userId,
      account_id: transaction.accountId,
      category_id: transaction.categoryId,
      date: transaction.date,
      merchant: transaction.merchant,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      kind: transaction.kind,
      status: transaction.status,
      flags: transaction.flags,
      created_at: transaction.createdAt,
      updated_at: transaction.updatedAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return transactionFromRow(data);
}

export async function getTransactions(): Promise<Transaction[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockTransactionRecords;
  }

  const { data, error } = await context.supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(transactionFromRow);
}

export async function getBudgets(): Promise<Budget[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockBudgets;
  }

  const { data, error } = await context.supabase.from("budgets").select("*");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(budgetFromRow);
}

export async function getBills(): Promise<Bill[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockBills;
  }

  const { data, error } = await context.supabase
    .from("bills")
    .select("*")
    .order("due_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(billFromRow);
}

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockSavingsGoals;
  }

  const { data, error } = await context.supabase
    .from("savings_goals")
    .select("*")
    .order("target_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(savingsGoalFromRow);
}
