import "server-only";

import type {
  Account,
  AIInsight,
  AppNotification,
  BankConnection,
  Bill,
  Budget,
  BudgetPeriod,
  CashflowEvent,
  Category,
  Debt,
  DetectedBill,
  DetectedSubscription,
  ManualFinanceItem,
  MerchantRule,
  NotificationDeliveryAttempt,
  NotificationPreference,
  OverdraftPlan,
  PaydayPlan,
  ProviderTokenStorageRecord,
  ProviderSyncEvent,
  PushSubscriptionRecord,
  RecurringPaymentCandidate,
  SavingsGoal,
  SpendingAnomaly,
  Subscription,
  Transaction,
  TransactionBudgetOverride,
  TransactionEnrichment,
  UserProfile,
} from "@/lib/domain";
import type { DocumentData } from "firebase-admin/firestore";
import { createAuditEvent, type AuditEventInput } from "@/lib/repositories/audit";
import { createFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { getFirebaseSessionUser } from "@/lib/firebase/session";

export type FirebaseCollectionName =
  | "accounts"
  | "aiInsights"
  | "appNotifications"
  | "bankConnections"
  | "bills"
  | "budgetPeriods"
  | "budgets"
  | "cashflowEvents"
  | "categories"
  | "debts"
  | "detectedBills"
  | "detectedSubscriptions"
  | "manualFinanceItems"
  | "merchantRules"
  | "notificationDeliveryAttempts"
  | "notificationPreferences"
  | "overdraftPlans"
  | "paydayPlans"
  | "providerTokens"
  | "providerSyncEvents"
  | "pushSubscriptions"
  | "recurringPaymentCandidates"
  | "savingsGoals"
  | "spendingAnomalies"
  | "subscriptions"
  | "transactionEnrichments"
  | "transactionBudgetOverrides"
  | "transactions";

type CollectionTypeMap = {
  accounts: Account;
  aiInsights: AIInsight;
  appNotifications: AppNotification;
  bankConnections: BankConnection;
  bills: Bill;
  budgetPeriods: BudgetPeriod;
  budgets: Budget;
  cashflowEvents: CashflowEvent;
  categories: Category;
  debts: Debt;
  detectedBills: DetectedBill;
  detectedSubscriptions: DetectedSubscription;
  manualFinanceItems: ManualFinanceItem;
  merchantRules: MerchantRule;
  notificationDeliveryAttempts: NotificationDeliveryAttempt;
  notificationPreferences: NotificationPreference;
  overdraftPlans: OverdraftPlan;
  paydayPlans: PaydayPlan;
  providerTokens: ProviderTokenStorageRecord;
  providerSyncEvents: ProviderSyncEvent;
  pushSubscriptions: PushSubscriptionRecord;
  recurringPaymentCandidates: RecurringPaymentCandidate;
  savingsGoals: SavingsGoal;
  spendingAnomalies: SpendingAnomaly;
  subscriptions: Subscription;
  transactionEnrichments: TransactionEnrichment;
  transactionBudgetOverrides: TransactionBudgetOverride;
  transactions: Transaction;
};

export type FirebaseAuthenticatedContext = {
  db: NonNullable<Awaited<ReturnType<typeof createFirebaseAdminFirestore>>>;
  userId: string;
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

function collectionPath(userId: string, collectionName: string) {
  return `users/${userId}/${collectionName}`;
}

export async function getFirebaseAuthenticatedContext(): Promise<FirebaseAuthenticatedContext | null> {
  const db = await createFirebaseAdminFirestore();

  if (!db) {
    return null;
  }

  const user = await getFirebaseSessionUser();

  if (!user) {
    return null;
  }

  return { db, userId: user.uid };
}

export async function getFirebaseCollection<K extends FirebaseCollectionName>(
  collectionName: K,
  fallback: CollectionTypeMap[K][] = [],
): Promise<CollectionTypeMap[K][]> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return fallback;
  }

  return getFirebaseCollectionForContext(context, collectionName);
}

export async function getFirebaseCollectionForContext<K extends FirebaseCollectionName>(
  context: FirebaseAuthenticatedContext,
  collectionName: K,
): Promise<CollectionTypeMap[K][]> {
  const snapshot = await context.db.collection(collectionPath(context.userId, collectionName)).get();

  return snapshot.docs.map((document) => document.data() as CollectionTypeMap[K]);
}

export async function upsertFirebaseDocument<K extends FirebaseCollectionName>(
  collectionName: K,
  document: CollectionTypeMap[K] & { id: string },
): Promise<CollectionTypeMap[K]> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return document;
  }

  await context.db
    .collection(collectionPath(context.userId, collectionName))
    .doc(document.id)
    .set(removeUndefined(document) as DocumentData, { merge: true });

  return document;
}

export async function deleteFirebaseDocument(
  collectionName: FirebaseCollectionName,
  id: string,
): Promise<{ id: string }> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return { id };
  }

  await context.db.collection(collectionPath(context.userId, collectionName)).doc(id).delete();
  return { id };
}

export async function getFirebaseDocument<K extends FirebaseCollectionName>(
  collectionName: K,
  id: string,
): Promise<CollectionTypeMap[K] | null> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return null;
  }

  const snapshot = await context.db
    .collection(collectionPath(context.userId, collectionName))
    .doc(id)
    .get();

  return snapshot.exists ? (snapshot.data() as CollectionTypeMap[K]) : null;
}

export async function getFirebaseUserProfile(
  fallback: UserProfile,
): Promise<UserProfile> {
  const context = await getFirebaseAuthenticatedContext();

  if (!context) {
    return fallback;
  }

  const snapshot = await context.db.doc(`users/${context.userId}`).get();

  if (!snapshot.exists) {
    return { ...fallback, id: context.userId };
  }

  return snapshot.data() as UserProfile;
}

export async function ensureFirebaseUserProfile(input: {
  id: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<UserProfile | null> {
  const db = await createFirebaseAdminFirestore();

  if (!db) {
    return null;
  }

  const now = new Date().toISOString();
  const displayName =
    input.displayName ?? input.email?.split("@")[0] ?? "Personal Finance HQ user";
  const profile: UserProfile = {
    id: input.id,
    displayName,
    locale: "en-GB",
    currency: "GBP",
    paydayDayOfMonth: 25,
    minimumBuffer: 350,
    createdAt: now,
    updatedAt: now,
  };

  await db.doc(`users/${input.id}`).set(removeUndefined(profile) as DocumentData, {
    merge: true,
  });

  return profile;
}

export async function recordFirebaseAuditEvent(input: AuditEventInput) {
  const context = await getFirebaseAuthenticatedContext();
  const event = createAuditEvent({
    ...input,
    userId: context?.userId ?? input.userId,
  });

  if (!context) {
    return event;
  }

  await context.db
    .collection(collectionPath(context.userId, "auditLog"))
    .doc(`${event.event_type}_${event.entity_id ?? event.created_at}`)
    .set(removeUndefined(event) as DocumentData);

  return event;
}
