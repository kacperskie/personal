import type {
  Account,
  AIInsight,
  BankConnection,
  Bill,
  Budget,
  BudgetPeriod,
  Category,
  Debt,
  DetectedBill,
  DetectedSubscription,
  ManualFinanceItem,
  MerchantRule,
  ProviderSyncEvent,
  RecurringPaymentCandidate,
  SavingsGoal,
  SpendingAnomaly,
  Subscription,
  TransactionEnrichment,
  CashflowEvent,
  Transaction,
  TransactionBudgetOverride,
  UserProfile,
} from "@/lib/domain";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockDebts,
  mockAIInsights,
  mockManualFinanceItems,
  mockSavingsGoals,
  mockSubscriptions,
  mockTransactionRecords,
  mockUserProfile,
} from "@/lib/mock-data";
import {
  accountFromRow,
  accountToRow,
  aiInsightFromRow,
  aiInsightToRow,
  bankConnectionFromRow,
  bankConnectionToRow,
  billFromRow,
  budgetPeriodFromRow,
  budgetFromRow,
  categoryFromRow,
  cashflowEventFromRow,
  debtFromRow,
  detectedBillFromRow,
  detectedBillToRow,
  detectedSubscriptionFromRow,
  detectedSubscriptionToRow,
  manualFinanceItemFromRow,
  manualFinanceItemToRow,
  merchantRuleFromRow,
  merchantRuleToRow,
  recurringPaymentCandidateFromRow,
  savingsGoalFromRow,
  spendingAnomalyFromRow,
  subscriptionFromRow,
  transactionEnrichmentFromRow,
  transactionEnrichmentToRow,
  transactionFromRow,
} from "@/lib/repositories/mappers";
import { mergeSyncedTransaction } from "@/lib/bank-providers/provider-mappers";
import {
  approveRecurringCandidate,
  buildCashflowEvents,
  defaultMerchantRules,
  detectBillsFromCandidates,
  detectRecurringPaymentCandidates,
  detectSpendingAnomalies,
  detectSubscriptionsFromCandidates,
  dismissRecurringCandidate,
  enrichTransactionSet,
} from "@/lib/transaction-intelligence";
import { createAuditEvent } from "@/lib/repositories/audit";
import type { AuditEventInput } from "@/lib/repositories/audit";
import { isFirebaseBackend } from "@/lib/backend/provider";
import {
  deleteFirebaseDocument,
  getFirebaseCollection,
  getFirebaseDocument,
  getFirebaseUserProfile,
  recordFirebaseAuditEvent,
  upsertFirebaseDocument,
} from "@/lib/repositories/firebase-repository";
import {
  createAccountUpdatePayload,
  validateManualFinanceItemInput,
  type AccountUpdatePayload,
  type ManualFinanceItemInput,
} from "@/lib/repositories/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fallbackMerchantRules = new Map<string, MerchantRule>(
  defaultMerchantRules.map((rule) => [rule.id, rule]),
);
const fallbackRecurringCandidates = new Map<string, RecurringPaymentCandidate>();
const fallbackDetectedBills = new Map<string, DetectedBill>();
const fallbackDetectedSubscriptions = new Map<string, DetectedSubscription>();
const fallbackEnrichments = new Map<string, TransactionEnrichment>();
const fallbackTransactionBudgetOverrides = new Map<string, TransactionBudgetOverride>();
const fallbackAIInsights = new Map<string, AIInsight>(
  mockAIInsights.map((insight) => [insight.id, insight]),
);

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
  if (isFirebaseBackend()) {
    return recordFirebaseAuditEvent(input);
  }

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
  if (isFirebaseBackend()) {
    return getFirebaseCollection("accounts", mockAccounts);
  }

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

export async function getUserProfile(): Promise<UserProfile> {
  if (isFirebaseBackend()) {
    return getFirebaseUserProfile(mockUserProfile);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return mockUserProfile;
  }

  const { data, error } = await context.supabase
    .from("profiles")
    .select("*")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      ...mockUserProfile,
      id: context.userId,
    };
  }

  return {
    id: data.user_id,
    displayName: data.display_name,
    locale: data.locale,
    currency: data.currency,
    paydayDayOfMonth: data.payday_day_of_month,
    minimumBuffer: data.minimum_buffer,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function upsertAccount(account: Account): Promise<Account> {
  if (isFirebaseBackend()) {
    const existing = await getFirebaseDocument("accounts", account.id);
    const merged = existing
      ? {
          ...account,
          purpose: existing.purpose,
          accountRole: existing.accountRole,
          includeInSafeToSpend: existing.includeInSafeToSpend,
          includeInCashflow: existing.includeInCashflow,
          includeInNetWorth: existing.includeInNetWorth,
          isSpendingAccount: existing.isSpendingAccount,
          isBillsAccount: existing.isBillsAccount,
          isSavingsAccount: existing.isSavingsAccount,
          linkedGoalIds: existing.linkedGoalIds,
          reservedFor: existing.reservedFor ?? account.reservedFor ?? null,
          linkedLiabilityAccountId:
            existing.linkedLiabilityAccountId ?? account.linkedLiabilityAccountId ?? null,
          overdraftLimit: existing.overdraftLimit ?? account.overdraftLimit ?? null,
          overdraftRepaymentTarget:
            existing.overdraftRepaymentTarget ?? account.overdraftRepaymentTarget ?? null,
          notes: existing.notes ?? account.notes,
          createdAt: existing.createdAt,
        }
      : account;
    return upsertFirebaseDocument("accounts", merged);
  }

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

  if (isFirebaseBackend()) {
    const existing = await getFirebaseDocument("accounts", updatePayload.id);

    if (existing) {
      await upsertFirebaseDocument("accounts", {
        ...existing,
        purpose: updatePayload.purpose,
        includeInSafeToSpend: updatePayload.includeInSafeToSpend,
        includeInCashflow: updatePayload.includeInCashflow,
        includeInNetWorth: updatePayload.includeInNetWorth,
        linkedGoalIds: updatePayload.linkedGoalIds,
        reservedFor: updatePayload.reservedFor,
        linkedLiabilityAccountId: updatePayload.linkedLiabilityAccountId,
        overdraftLimit: updatePayload.overdraftLimit,
        overdraftRepaymentTarget: updatePayload.overdraftRepaymentTarget,
        updatedAt: new Date().toISOString(),
      });
    }

    return updatePayload;
  }

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
  if (isFirebaseBackend()) {
    return getFirebaseCollection("manualFinanceItems", mockManualFinanceItems);
  }

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

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("manualFinanceItems", item);
  }

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

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("manualFinanceItems", item);
  }

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
  if (isFirebaseBackend()) {
    return deleteFirebaseDocument("manualFinanceItems", id);
  }

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
  if (isFirebaseBackend()) {
    return getFirebaseCollection("bankConnections", []);
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("bankConnections", connection);
  }

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
  if (isFirebaseBackend()) {
    return getFirebaseDocument("bankConnections", id);
  }

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

export async function deleteBankConnection(id: string): Promise<{ id: string }> {
  if (isFirebaseBackend()) {
    return deleteFirebaseDocument("bankConnections", id);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return { id };
  }

  const { error } = await context.supabase
    .from("bank_connections")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "bank_connection_revoked",
      entity: "bank_connections",
      entityId: id,
      metadata: { cleanup: "failed_connection_attempt" },
    }),
    context.supabase,
  );

  return { id };
}

export async function updateBankConnectionStatus(
  connection: BankConnection,
  eventType: "bank_connection_status_changed" | "bank_connection_sync_failed" | "bank_connection_revoked" = "bank_connection_status_changed",
): Promise<BankConnection> {
  if (isFirebaseBackend()) {
    void eventType;
    return upsertFirebaseDocument("bankConnections", connection);
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("providerSyncEvents", event);
  }

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
  if (isFirebaseBackend()) {
    const existing = await getFirebaseDocument("transactions", transaction.id);
    const mergedTransaction = mergeSyncedTransaction(existing, transaction);

    return upsertFirebaseDocument("transactions", mergedTransaction);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return transaction;
  }

  const { data: existingRow, error: existingError } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("id", transaction.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const mergedTransaction = mergeSyncedTransaction(
    existingRow ? transactionFromRow(existingRow) : null,
    transaction,
  );

  await context.supabase.from("categories").upsert({
    id: mergedTransaction.categoryId,
    user_id: context.userId,
    name:
      mergedTransaction.categoryId === "cat_uncategorised"
        ? "Uncategorised"
        : mergedTransaction.categoryId,
    parent_id: null,
    kind: mergedTransaction.kind,
    budget_type: "transfer",
    include_in_budget: mergedTransaction.kind === "expense",
    status: "active",
  });

  const { data, error } = await context.supabase
    .from("transactions")
    .upsert({
      id: mergedTransaction.id,
      user_id: context.userId,
      account_id: mergedTransaction.accountId,
      category_id: mergedTransaction.categoryId,
      provider_connection_id: mergedTransaction.providerConnectionId ?? null,
      provider_transaction_id: mergedTransaction.providerTransactionId ?? null,
      provider_updated_at: mergedTransaction.providerUpdatedAt ?? null,
      provider_status: mergedTransaction.providerStatus ?? null,
      provider_deleted_at: mergedTransaction.providerDeletedAt ?? null,
      provider_restored_at: mergedTransaction.providerRestoredAt ?? null,
      date: mergedTransaction.date,
      merchant: mergedTransaction.merchant,
      description: mergedTransaction.description,
      amount: mergedTransaction.amount,
      currency: mergedTransaction.currency,
      kind: mergedTransaction.kind,
      status: mergedTransaction.status,
      flags: mergedTransaction.flags,
      pending: mergedTransaction.pending ?? false,
      notes: mergedTransaction.notes ?? null,
      raw_payload: {},
      created_at: mergedTransaction.createdAt,
      updated_at: mergedTransaction.updatedAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return transactionFromRow(data);
}

export async function getTransactions(): Promise<Transaction[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("transactions", mockTransactionRecords);
  }

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

export async function getTransactionBudgetOverrides(): Promise<TransactionBudgetOverride[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("transactionBudgetOverrides", []);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return Array.from(fallbackTransactionBudgetOverrides.values());
  }

  return [];
}

export async function upsertTransactionBudgetOverride(
  override: TransactionBudgetOverride,
): Promise<TransactionBudgetOverride> {
  const updated = { ...override, updatedAt: new Date().toISOString() };

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("transactionBudgetOverrides", updated);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackTransactionBudgetOverrides.set(updated.id, updated);
  }

  return updated;
}

export async function upsertTransactionBudgetOverrides(
  overrides: TransactionBudgetOverride[],
): Promise<TransactionBudgetOverride[]> {
  return Promise.all(overrides.map((override) => upsertTransactionBudgetOverride(override)));
}

export async function getCategories(): Promise<Category[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("categories", mockCategories);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return mockCategories;
  }

  const { data, error } = await context.supabase
    .from("categories")
    .select("*")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(categoryFromRow);
}

export async function getBudgets(): Promise<Budget[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("budgets", mockBudgets);
  }

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

export async function getBudgetPeriods(): Promise<BudgetPeriod[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("budgetPeriods", mockBudgetPeriods);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return mockBudgetPeriods;
  }

  const { data, error } = await context.supabase
    .from("budget_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(budgetPeriodFromRow);
}

export async function getBills(): Promise<Bill[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("bills", mockBills);
  }

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

export async function getSubscriptions(): Promise<Subscription[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("subscriptions", mockSubscriptions);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return mockSubscriptions;
  }

  const { data, error } = await context.supabase
    .from("subscriptions")
    .select("*")
    .order("due_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(subscriptionFromRow);
}

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("savingsGoals", mockSavingsGoals);
  }

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

export async function getDebts(): Promise<Debt[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("debts", mockDebts);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return mockDebts;
  }

  const { data, error } = await context.supabase
    .from("debts")
    .select("*")
    .order("due_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(debtFromRow);
}

export async function createAIInsight(insight: AIInsight): Promise<AIInsight> {
  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("aiInsights", insight);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackAIInsights.set(insight.id, insight);
    return insight;
  }

  const { data, error } = await context.supabase
    .from("ai_insights")
    .insert(aiInsightToRow({ ...insight, userId: context.userId }, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "ai_insight_created",
      entity: "ai_insights",
      entityId: insight.id,
      metadata: {
        mode: insight.mode ?? insight.type,
        model: insight.model ?? null,
        errorStatus: insight.errorStatus ?? null,
      },
    }),
    context.supabase,
  );

  return aiInsightFromRow(data);
}

export async function getMerchantRules(): Promise<MerchantRule[]> {
  if (isFirebaseBackend()) {
    return getFirebaseCollection("merchantRules", defaultMerchantRules);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return Array.from(fallbackMerchantRules.values());
  }

  const { data, error } = await context.supabase
    .from("merchant_rules")
    .select("*")
    .order("priority");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(merchantRuleFromRow);
}

export async function upsertMerchantRule(rule: MerchantRule): Promise<MerchantRule> {
  const updatedRule = { ...rule, updatedAt: new Date().toISOString() };

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("merchantRules", updatedRule);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackMerchantRules.set(updatedRule.id, updatedRule);
    return updatedRule;
  }

  const { data, error } = await context.supabase
    .from("merchant_rules")
    .upsert(merchantRuleToRow(updatedRule, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return merchantRuleFromRow(data);
}

export async function enrichTransactions(
  transactions?: Transaction[],
): Promise<TransactionEnrichment[]> {
  const sourceTransactions = transactions ?? (await getTransactions());
  const [accounts, merchantRules] = await Promise.all([getAccounts(), getMerchantRules()]);
  const enrichments = enrichTransactionSet(sourceTransactions, accounts, merchantRules);

  if (isFirebaseBackend()) {
    await Promise.all(
      enrichments.map((enrichment) =>
        upsertFirebaseDocument("transactionEnrichments", enrichment),
      ),
    );
    return enrichments;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    enrichments.forEach((enrichment) => fallbackEnrichments.set(enrichment.id, enrichment));
    return enrichments;
  }

  const { data, error } = await context.supabase
    .from("transaction_enrichments")
    .upsert(
      enrichments.map((enrichment) =>
        transactionEnrichmentToRow({ ...enrichment, userId: context.userId }, context.userId),
      ),
    )
    .select();

  if (error) {
    throw new Error(error.message);
  }

  return data.map(transactionEnrichmentFromRow);
}

export async function getTransactionEnrichments(): Promise<TransactionEnrichment[]> {
  if (isFirebaseBackend()) {
    const enrichments = await getFirebaseCollection("transactionEnrichments", []);
    return enrichments.length > 0 ? enrichments : enrichTransactions();
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    if (fallbackEnrichments.size === 0) {
      await enrichTransactions(mockTransactionRecords);
    }

    return Array.from(fallbackEnrichments.values());
  }

  const { data, error } = await context.supabase
    .from("transaction_enrichments")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (data.length === 0) {
    return enrichTransactions();
  }

  return data.map(transactionEnrichmentFromRow);
}

export async function upsertTransactionEnrichment(
  enrichment: TransactionEnrichment,
): Promise<TransactionEnrichment> {
  const updated = { ...enrichment, updatedAt: new Date().toISOString() };

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("transactionEnrichments", updated);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackEnrichments.set(updated.id, updated);
    return updated;
  }

  const { data, error } = await context.supabase
    .from("transaction_enrichments")
    .upsert(transactionEnrichmentToRow(updated, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return transactionEnrichmentFromRow(data);
}

export async function getRecurringPaymentCandidates(): Promise<RecurringPaymentCandidate[]> {
  if (isFirebaseBackend()) {
    const candidates = await getFirebaseCollection("recurringPaymentCandidates", []);

    if (candidates.length > 0) {
      return candidates;
    }

    const detected = detectRecurringPaymentCandidates(
      await getTransactions(),
      await getTransactionEnrichments(),
    );
    await Promise.all(
      detected.map((candidate) =>
        upsertFirebaseDocument("recurringPaymentCandidates", candidate),
      ),
    );
    return detected;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    if (fallbackRecurringCandidates.size === 0) {
      const candidates = detectRecurringPaymentCandidates(
        mockTransactionRecords,
        await getTransactionEnrichments(),
      );
      candidates.forEach((candidate) => fallbackRecurringCandidates.set(candidate.id, candidate));
    }

    return Array.from(fallbackRecurringCandidates.values());
  }

  const { data, error } = await context.supabase
    .from("recurring_payment_candidates")
    .select("*")
    .order("next_expected_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(recurringPaymentCandidateFromRow);
}

export async function approveRecurringPaymentCandidate(
  id: string,
): Promise<RecurringPaymentCandidate | null> {
  if (isFirebaseBackend()) {
    const candidate =
      (await getFirebaseDocument("recurringPaymentCandidates", id)) ??
      (await getRecurringPaymentCandidates()).find((item) => item.id === id);

    if (!candidate) {
      return null;
    }

    const approved = approveRecurringCandidate(candidate);
    return upsertFirebaseDocument("recurringPaymentCandidates", approved);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    const candidate =
      fallbackRecurringCandidates.get(id) ??
      (await getRecurringPaymentCandidates()).find((item) => item.id === id);

    if (!candidate) {
      return null;
    }

    const approved = approveRecurringCandidate(candidate);
    fallbackRecurringCandidates.set(id, approved);
    return approved;
  }

  const { data, error } = await context.supabase
    .from("recurring_payment_candidates")
    .update({ status: "approved", reviewed: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return recurringPaymentCandidateFromRow(data);
}

export async function dismissRecurringPaymentCandidate(
  id: string,
): Promise<RecurringPaymentCandidate | null> {
  if (isFirebaseBackend()) {
    const candidate =
      (await getFirebaseDocument("recurringPaymentCandidates", id)) ??
      (await getRecurringPaymentCandidates()).find((item) => item.id === id);

    if (!candidate) {
      return null;
    }

    const dismissed = dismissRecurringCandidate(candidate);
    return upsertFirebaseDocument("recurringPaymentCandidates", dismissed);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    const candidate =
      fallbackRecurringCandidates.get(id) ??
      (await getRecurringPaymentCandidates()).find((item) => item.id === id);

    if (!candidate) {
      return null;
    }

    const dismissed = dismissRecurringCandidate(candidate);
    fallbackRecurringCandidates.set(id, dismissed);
    return dismissed;
  }

  const { data, error } = await context.supabase
    .from("recurring_payment_candidates")
    .update({ status: "dismissed", reviewed: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return recurringPaymentCandidateFromRow(data);
}

export async function getDetectedBills(): Promise<DetectedBill[]> {
  if (isFirebaseBackend()) {
    const bills = await getFirebaseCollection("detectedBills", []);

    if (bills.length > 0) {
      return bills;
    }

    const detectedBills = detectBillsFromCandidates(
      await getRecurringPaymentCandidates(),
      await getTransactionEnrichments(),
    );
    await Promise.all(
      detectedBills.map((bill) => upsertFirebaseDocument("detectedBills", bill)),
    );
    return detectedBills;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    if (fallbackDetectedBills.size === 0) {
      const bills = detectBillsFromCandidates(
        await getRecurringPaymentCandidates(),
        await getTransactionEnrichments(),
      );
      bills.forEach((bill) => fallbackDetectedBills.set(bill.id, bill));
    }

    return Array.from(fallbackDetectedBills.values());
  }

  const { data, error } = await context.supabase
    .from("detected_bills")
    .select("*")
    .order("next_due_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(detectedBillFromRow);
}

export async function upsertDetectedBill(bill: DetectedBill): Promise<DetectedBill> {
  const updated = { ...bill, updatedAt: new Date().toISOString() };

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("detectedBills", updated);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackDetectedBills.set(updated.id, updated);
    return updated;
  }

  const { data, error } = await context.supabase
    .from("detected_bills")
    .upsert(detectedBillToRow(updated, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return detectedBillFromRow(data);
}

export async function getDetectedSubscriptions(): Promise<DetectedSubscription[]> {
  if (isFirebaseBackend()) {
    const subscriptions = await getFirebaseCollection("detectedSubscriptions", []);

    if (subscriptions.length > 0) {
      return subscriptions;
    }

    const detectedSubscriptions = detectSubscriptionsFromCandidates(
      await getRecurringPaymentCandidates(),
      await getTransactions(),
      await getTransactionEnrichments(),
    );
    await Promise.all(
      detectedSubscriptions.map((subscription) =>
        upsertFirebaseDocument("detectedSubscriptions", subscription),
      ),
    );
    return detectedSubscriptions;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    if (fallbackDetectedSubscriptions.size === 0) {
      const subscriptions = detectSubscriptionsFromCandidates(
        await getRecurringPaymentCandidates(),
        mockTransactionRecords,
        await getTransactionEnrichments(),
      );
      subscriptions.forEach((subscription) =>
        fallbackDetectedSubscriptions.set(subscription.id, subscription),
      );
    }

    return Array.from(fallbackDetectedSubscriptions.values());
  }

  const { data, error } = await context.supabase
    .from("detected_subscriptions")
    .select("*")
    .order("next_expected_date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(detectedSubscriptionFromRow);
}

export async function upsertDetectedSubscription(
  subscription: DetectedSubscription,
): Promise<DetectedSubscription> {
  const updated = { ...subscription, updatedAt: new Date().toISOString() };

  if (isFirebaseBackend()) {
    return upsertFirebaseDocument("detectedSubscriptions", updated);
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    fallbackDetectedSubscriptions.set(updated.id, updated);
    return updated;
  }

  const { data, error } = await context.supabase
    .from("detected_subscriptions")
    .upsert(detectedSubscriptionToRow(updated, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return detectedSubscriptionFromRow(data);
}

export async function getSpendingAnomalies(): Promise<SpendingAnomaly[]> {
  if (isFirebaseBackend()) {
    const anomalies = await getFirebaseCollection("spendingAnomalies", []);

    if (anomalies.length > 0) {
      return anomalies;
    }

    const detected = detectSpendingAnomalies({
      userId: "firebase_user",
      transactions: await getTransactions(),
      enrichments: await getTransactionEnrichments(),
      detectedBills: await getDetectedBills(),
      detectedSubscriptions: await getDetectedSubscriptions(),
    });
    await Promise.all(
      detected.map((anomaly) => upsertFirebaseDocument("spendingAnomalies", anomaly)),
    );
    return detected;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return detectSpendingAnomalies({
      userId: "user_mock_001",
      transactions: mockTransactionRecords,
      enrichments: await getTransactionEnrichments(),
      detectedBills: await getDetectedBills(),
      detectedSubscriptions: await getDetectedSubscriptions(),
    });
  }

  const { data, error } = await context.supabase
    .from("spending_anomalies")
    .select("*")
    .order("detected_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(spendingAnomalyFromRow);
}

export async function getCashflowEvents(): Promise<CashflowEvent[]> {
  if (isFirebaseBackend()) {
    const events = await getFirebaseCollection("cashflowEvents", []);

    if (events.length > 0) {
      return events;
    }

    const generated = buildCashflowEvents({
      userId: "firebase_user",
      bills: [
        ...(await getBills()),
        ...(await getDetectedBills()).filter((bill) => bill.status !== "dismissed"),
      ],
      subscriptions: [
        ...(await getSubscriptions()),
        ...(await getDetectedSubscriptions()).filter(
          (subscription) => subscription.status !== "dismissed",
        ),
      ],
      manualFinanceItems: await getManualFinanceItems(),
      incomeCandidates: (await getRecurringPaymentCandidates()).filter(
        (candidate) => candidate.candidateType === "income",
      ),
      startDate: "2026-06-30",
      endDate: "2026-07-25",
    });
    await Promise.all(
      generated.map((event) => upsertFirebaseDocument("cashflowEvents", event)),
    );
    return generated;
  }

  const context = await getAuthenticatedContext();

  if (!context) {
    return buildCashflowEvents({
      userId: "user_mock_001",
      bills: [...mockBills, ...(await getDetectedBills()).filter((bill) => bill.status !== "dismissed")],
      subscriptions: [
        ...mockSubscriptions,
        ...(await getDetectedSubscriptions()).filter(
          (subscription) => subscription.status !== "dismissed",
        ),
      ],
      manualFinanceItems: mockManualFinanceItems,
      incomeCandidates: (await getRecurringPaymentCandidates()).filter(
        (candidate) => candidate.candidateType === "income",
      ),
      startDate: "2026-06-30",
      endDate: "2026-07-25",
    });
  }

  const { data, error } = await context.supabase
    .from("cashflow_events")
    .select("*")
    .order("date");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(cashflowEventFromRow);
}
