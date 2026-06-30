import "server-only";

import type {
  Account,
  AppNotification,
  BankConnection,
  ProviderSyncEvent,
  Transaction,
} from "@/lib/domain";
import { mergeSyncedTransaction } from "@/lib/bank-providers/provider-mappers";
import { mockBankConnections } from "@/lib/mock-data";
import {
  accountFromRow,
  accountToRow,
  appNotificationToRow,
  bankConnectionFromRow,
  bankConnectionToRow,
  transactionFromRow,
} from "@/lib/repositories/mappers";
import { createAuditEvent, type AuditEventInput } from "@/lib/repositories/audit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const fallbackUserId = "user_mock_001";

export type ServiceBankConnectionRecord = {
  userId: string;
  connection: BankConnection;
};

export async function getServiceBankConnectionById(
  id: string,
): Promise<ServiceBankConnectionRecord | null> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    const connection = mockBankConnections.find((item) => item.id === id);

    return connection ? { userId: fallbackUserId, connection } : null;
  }

  const { data, error } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? { userId: data.user_id, connection: bankConnectionFromRow(data) } : null;
}

export async function getServiceActiveBankConnections(): Promise<
  ServiceBankConnectionRecord[]
> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return mockBankConnections
      .filter((connection) => connection.status === "connected" || connection.status === "syncing")
      .map((connection) => ({ userId: fallbackUserId, connection }));
  }

  const { data, error } = await supabase
    .from("bank_connections")
    .select("*")
    .in("status", ["connected", "syncing"]);

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => ({ userId: row.user_id, connection: bankConnectionFromRow(row) }));
}

export async function upsertServiceAccount(
  userId: string,
  account: Account,
): Promise<Account> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return account;
  }

  const { data, error } = await supabase
    .from("accounts")
    .upsert(accountToRow({ ...account, userId }))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return accountFromRow(data);
}

export async function upsertServiceTransaction(
  userId: string,
  transaction: Transaction,
): Promise<Transaction> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return transaction;
  }

  const { data: existingRow, error: existingError } = await supabase
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

  await supabase.from("categories").upsert({
    id: mergedTransaction.categoryId,
    user_id: userId,
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

  const { data, error } = await supabase
    .from("transactions")
    .upsert({
      id: mergedTransaction.id,
      user_id: userId,
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

export async function recordServiceProviderSyncEvent(
  userId: string,
  event: ProviderSyncEvent,
): Promise<ProviderSyncEvent> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return event;
  }

  const { data, error } = await supabase
    .from("provider_sync_events")
    .insert({
      id: event.id,
      user_id: userId,
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

export async function updateServiceBankConnectionStatus(
  userId: string,
  connection: BankConnection,
): Promise<BankConnection> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return connection;
  }

  const { data, error } = await supabase
    .from("bank_connections")
    .update(bankConnectionToRow(connection, userId))
    .eq("id", connection.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return bankConnectionFromRow(data);
}

export async function recordServiceAuditEvent(input: AuditEventInput) {
  const supabase = createSupabaseServiceRoleClient();
  const event = createAuditEvent(input);

  if (!supabase) {
    return event;
  }

  await supabase.from("audit_log").insert({
    ...event,
    user_id: input.userId,
  });

  return event;
}

export async function createServiceNotification(
  notification: AppNotification,
): Promise<AppNotification> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return notification;
  }

  const { data, error } = await supabase
    .from("app_notifications")
    .insert(appNotificationToRow(notification, notification.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    severity: data.severity,
    channel: data.channel,
    title: data.title,
    body: data.body,
    privacySafeTitle: data.privacy_safe_title,
    privacySafeBody: data.privacy_safe_body,
    actionHref: data.action_href,
    entityType: data.entity_type,
    entityId: data.entity_id,
    status: data.status,
    readAt: data.read_at,
    dismissedAt: data.dismissed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
