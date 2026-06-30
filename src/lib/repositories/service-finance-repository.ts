import "server-only";

import type {
  Account,
  AppNotification,
  BankConnection,
  Bill,
  Budget,
  BudgetPeriod,
  Category,
  ManualFinanceItem,
  NotificationDeliveryAttempt,
  NotificationPreference,
  ProviderSyncEvent,
  PushSubscriptionRecord,
  Transaction,
} from "@/lib/domain";
import { mergeSyncedTransaction } from "@/lib/bank-providers/provider-mappers";
import { isFirebaseBackend } from "@/lib/backend/provider";
import {
  mockAccounts,
  mockBankConnections,
  mockBills,
  mockBudgetPeriods,
  mockBudgets,
  mockCategories,
  mockManualFinanceItems,
  mockNotificationPreferences,
  mockPushSubscriptionRecords,
  mockTransactionRecords,
} from "@/lib/mock-data";
import {
  accountFromRow,
  accountToRow,
  appNotificationToRow,
  bankConnectionFromRow,
  bankConnectionToRow,
  billFromRow,
  budgetFromRow,
  budgetPeriodFromRow,
  categoryFromRow,
  manualFinanceItemFromRow,
  notificationDeliveryAttemptFromRow,
  notificationDeliveryAttemptToRow,
  notificationPreferenceFromRow,
  pushSubscriptionFromRow,
  transactionFromRow,
} from "@/lib/repositories/mappers";
import { createAuditEvent, type AuditEventInput } from "@/lib/repositories/audit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const fallbackUserId = "user_mock_001";

export type ServiceBankConnectionRecord = {
  userId: string;
  connection: BankConnection;
};

export type ServiceFinanceSnapshot = {
  accounts: Account[];
  bills: Bill[];
  budgets: Budget[];
  budgetPeriods: BudgetPeriod[];
  categories: Category[];
  manualFinanceItems: ManualFinanceItem[];
  transactions: Transaction[];
  bankConnections: BankConnection[];
};

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefined(entryValue)]),
    );
  }

  return value;
}

function firebaseUserCollection(userId: string, collectionName: string) {
  return `users/${userId}/${collectionName}`;
}

async function createFirebaseServiceFirestore() {
  const { createFirebaseAdminFirestore } = await import("@/lib/firebase/admin");
  return createFirebaseAdminFirestore();
}

async function getFirebaseUserCollection<T>(
  userId: string,
  collectionName: string,
  fallback: T[],
): Promise<T[]> {
  const db = await createFirebaseServiceFirestore();

  if (!db) {
    return fallback;
  }

  const snapshot = await db.collection(firebaseUserCollection(userId, collectionName)).get();
  return snapshot.docs.map((document) => document.data() as T);
}

async function upsertFirebaseServiceDocument<T extends { id: string }>(
  userId: string,
  collectionName: string,
  document: T,
): Promise<T> {
  const db = await createFirebaseServiceFirestore();

  if (!db) {
    return document;
  }

  await db
    .collection(firebaseUserCollection(userId, collectionName))
    .doc(document.id)
    .set(removeUndefined(document) as Record<string, unknown>, { merge: true });
  return document;
}

export async function getServiceActiveUserIds(): Promise<string[]> {
  if (isFirebaseBackend()) {
    const db = await createFirebaseServiceFirestore();

    if (!db) {
      return [fallbackUserId];
    }

    const snapshot = await db.collection("users").get();
    return snapshot.docs.map((document) => document.id);
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return [fallbackUserId];
  }

  const { data, error } = await supabase.from("profiles").select("user_id");

  if (error) {
    throw new Error(error.message);
  }

  return data.map((row) => row.user_id);
}

export async function getServiceFinanceSnapshot(
  userId: string,
): Promise<ServiceFinanceSnapshot> {
  if (isFirebaseBackend()) {
    const [
      accounts,
      bills,
      budgets,
      budgetPeriods,
      categories,
      manualFinanceItems,
      transactions,
      bankConnections,
    ] = await Promise.all([
      getFirebaseUserCollection(userId, "accounts", mockAccounts),
      getFirebaseUserCollection(userId, "bills", mockBills),
      getFirebaseUserCollection(userId, "budgets", mockBudgets),
      getFirebaseUserCollection(userId, "budgetPeriods", mockBudgetPeriods),
      getFirebaseUserCollection(userId, "categories", mockCategories),
      getFirebaseUserCollection(userId, "manualFinanceItems", mockManualFinanceItems),
      getFirebaseUserCollection(userId, "transactions", mockTransactionRecords),
      getFirebaseUserCollection(userId, "bankConnections", mockBankConnections),
    ]);

    return {
      accounts,
      bills,
      budgets,
      budgetPeriods,
      categories,
      manualFinanceItems,
      transactions,
      bankConnections,
    };
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return {
      accounts: mockAccounts,
      bills: mockBills,
      budgets: mockBudgets,
      budgetPeriods: mockBudgetPeriods,
      categories: mockCategories,
      manualFinanceItems: mockManualFinanceItems,
      transactions: mockTransactionRecords,
      bankConnections: mockBankConnections,
    };
  }

  const [
    accounts,
    bills,
    budgets,
    budgetPeriods,
    categories,
    manualFinanceItems,
    transactions,
    bankConnections,
  ] = await Promise.all([
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("bills").select("*").eq("user_id", userId),
    supabase.from("budgets").select("*").eq("user_id", userId),
    supabase.from("budget_periods").select("*").eq("user_id", userId),
    supabase.from("categories").select("*").eq("user_id", userId),
    supabase.from("manual_finance_items").select("*").eq("user_id", userId),
    supabase.from("transactions").select("*").eq("user_id", userId),
    supabase.from("bank_connections").select("*").eq("user_id", userId),
  ]);
  const firstError = [
    accounts.error,
    bills.error,
    budgets.error,
    budgetPeriods.error,
    categories.error,
    manualFinanceItems.error,
    transactions.error,
    bankConnections.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    accounts: (accounts.data ?? []).map(accountFromRow),
    bills: (bills.data ?? []).map(billFromRow),
    budgets: (budgets.data ?? []).map(budgetFromRow),
    budgetPeriods: (budgetPeriods.data ?? []).map(budgetPeriodFromRow),
    categories: (categories.data ?? []).map(categoryFromRow),
    manualFinanceItems: (manualFinanceItems.data ?? []).map(manualFinanceItemFromRow),
    transactions: (transactions.data ?? []).map(transactionFromRow),
    bankConnections: (bankConnections.data ?? []).map(bankConnectionFromRow),
  };
}

export async function getServiceNotificationPreferences(
  userId: string,
): Promise<NotificationPreference[]> {
  if (isFirebaseBackend()) {
    return getFirebaseUserCollection(userId, "notificationPreferences", mockNotificationPreferences);
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return mockNotificationPreferences;
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return data.map(notificationPreferenceFromRow);
}

export async function getServicePushSubscriptions(
  userId: string,
): Promise<PushSubscriptionRecord[]> {
  if (isFirebaseBackend()) {
    const records = await getFirebaseUserCollection(
      userId,
      "pushSubscriptions",
      mockPushSubscriptionRecords,
    );
    return records.filter((record) => record.status === "active");
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return mockPushSubscriptionRecords.filter((record) => record.status === "active");
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(pushSubscriptionFromRow);
}

export async function getServiceBankConnectionById(
  id: string,
): Promise<ServiceBankConnectionRecord | null> {
  if (isFirebaseBackend()) {
    const userIds = await getServiceActiveUserIds();
    const db = await createFirebaseServiceFirestore();

    if (!db) {
      const connection = mockBankConnections.find((item) => item.id === id);
      return connection ? { userId: fallbackUserId, connection } : null;
    }

    for (const userId of userIds) {
      const snapshot = await db
        .collection(firebaseUserCollection(userId, "bankConnections"))
        .doc(id)
        .get();

      if (snapshot.exists) {
        return { userId, connection: snapshot.data() as BankConnection };
      }
    }

    return null;
  }

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
  if (isFirebaseBackend()) {
    const userIds = await getServiceActiveUserIds();
    const records = await Promise.all(
      userIds.map(async (userId) => {
        const connections = await getFirebaseUserCollection<BankConnection>(
          userId,
          "bankConnections",
          mockBankConnections,
        );
        return connections
          .filter(
            (connection) =>
              connection.status === "connected" || connection.status === "syncing",
          )
          .map((connection) => ({ userId, connection }));
      }),
    );
    return records.flat();
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseServiceDocument(userId, "accounts", { ...account, userId });
  }

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
  if (isFirebaseBackend()) {
    const db = await createFirebaseServiceFirestore();

    if (!db) {
      return transaction;
    }

    const existingSnapshot = await db
      .collection(firebaseUserCollection(userId, "transactions"))
      .doc(transaction.id)
      .get();
    const mergedTransaction = mergeSyncedTransaction(
      existingSnapshot.exists ? (existingSnapshot.data() as Transaction) : null,
      transaction,
    );
    await upsertFirebaseServiceDocument(userId, "categories", {
      id: mergedTransaction.categoryId,
      userId,
      name:
        mergedTransaction.categoryId === "cat_uncategorised"
          ? "Uncategorised"
          : mergedTransaction.categoryId,
      parentId: null,
      kind: mergedTransaction.kind,
      budgetType: "transfer",
      includeInBudget: mergedTransaction.kind === "expense",
      status: "active",
    } satisfies Category);
    return upsertFirebaseServiceDocument(userId, "transactions", mergedTransaction);
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseServiceDocument(userId, "providerSyncEvents", event);
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseServiceDocument(userId, "bankConnections", connection);
  }

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
  if (isFirebaseBackend()) {
    const event = createAuditEvent(input);
    await upsertFirebaseServiceDocument(input.userId, "auditLog", {
      id: `${event.event_type}_${event.entity_id ?? event.created_at}`,
      ...event,
    });
    return event;
  }

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
  if (isFirebaseBackend()) {
    return upsertFirebaseServiceDocument(
      notification.userId,
      "appNotifications",
      notification,
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return notification;
  }

  const { data, error } = await supabase
    .from("app_notifications")
    .upsert(appNotificationToRow(notification, notification.userId), { onConflict: "id" })
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

export async function recordServiceNotificationDeliveryAttempt(
  attempt: NotificationDeliveryAttempt,
): Promise<NotificationDeliveryAttempt> {
  if (isFirebaseBackend()) {
    const saved = await upsertFirebaseServiceDocument(
      attempt.userId,
      "notificationDeliveryAttempts",
      attempt,
    );
    await recordServiceAuditEvent({
      userId: attempt.userId,
      eventType: "notification_delivery_attempt_created",
      entity: "notification_delivery_attempts",
      entityId: attempt.id,
      metadata: {
        notificationId: attempt.notificationId,
        status: attempt.status,
        channel: attempt.channel,
      },
    });
    return saved;
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return attempt;
  }

  const { data, error } = await supabase
    .from("notification_delivery_attempts")
    .insert(notificationDeliveryAttemptToRow(attempt, attempt.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordServiceAuditEvent({
    userId: attempt.userId,
    eventType: "notification_delivery_attempt_created",
    entity: "notification_delivery_attempts",
    entityId: attempt.id,
    metadata: {
      notificationId: attempt.notificationId,
      status: attempt.status,
      channel: attempt.channel,
    },
  });

  return notificationDeliveryAttemptFromRow(data);
}
