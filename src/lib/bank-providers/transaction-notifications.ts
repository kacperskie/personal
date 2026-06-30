import type {
  AppNotification,
  NotificationType,
  Transaction,
} from "@/lib/domain";
import { getPrivacySafeNotificationCopy } from "@/lib/notifications";
import { formatCurrency } from "@/lib/format";

export type TransactionNotificationType = Extract<
  NotificationType,
  | "new_transaction"
  | "transaction_updated"
  | "account_sync_failure"
  | "consent_renewal"
  | "large_transaction"
  | "potential_duplicate_payment"
>;

export function createTransactionNotification({
  userId,
  type,
  transaction,
  entityId,
  title,
  body,
  severity = "info",
  now = new Date().toISOString(),
}: {
  userId: string;
  type: TransactionNotificationType;
  transaction?: Transaction | null;
  entityId?: string | null;
  title?: string;
  body?: string;
  severity?: AppNotification["severity"];
  now?: string;
}): AppNotification {
  const safeCopy = getPrivacySafeNotificationCopy(type);
  const notificationEntityId = entityId ?? transaction?.id ?? null;

  return {
    id: `notif_${type}_${notificationEntityId ?? "general"}_${now.replaceAll(/[^0-9]/g, "")}`,
    userId,
    type,
    severity,
    channel: "in_app",
    title: title ?? safeCopy.title,
    body: body ?? safeCopy.body,
    privacySafeTitle: safeCopy.title,
    privacySafeBody: safeCopy.body,
    actionHref: "/transactions",
    entityType: transaction ? "transaction" : "bank_connection",
    entityId: notificationEntityId,
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isLargeTransaction(transaction: Transaction, threshold = 500) {
  return Math.abs(transaction.amount) >= threshold && transaction.kind !== "transfer";
}

export function potentialDuplicatePaymentKey(transaction: Transaction) {
  return [
    transaction.accountId,
    transaction.date,
    transaction.amount.toFixed(2),
    transaction.merchant.trim().toLowerCase(),
  ].join(":");
}

export function findPotentialDuplicatePayments(transactions: Transaction[]) {
  const seen = new Map<string, Transaction>();
  const duplicates: Array<{ original: Transaction; duplicate: Transaction }> = [];

  for (const transaction of transactions) {
    if (transaction.kind === "transfer" || transaction.flags.includes("own_account_transfer")) {
      continue;
    }

    const key = potentialDuplicatePaymentKey(transaction);
    const original = seen.get(key);

    if (original) {
      duplicates.push({ original, duplicate: transaction });
    } else {
      seen.set(key, transaction);
    }
  }

  return duplicates;
}

export function createTransactionChangeNotification(input: {
  userId: string;
  transaction: Transaction;
  changeType: "new" | "updated" | "large" | "duplicate";
  now?: string;
}) {
  if (input.changeType === "large") {
    return createTransactionNotification({
      userId: input.userId,
      type: "large_transaction",
      transaction: input.transaction,
      title: "Large transaction detected",
      body: `A transaction for ${formatCurrency(Math.abs(input.transaction.amount))} is ready to review.`,
      severity: "warning",
      now: input.now,
    });
  }

  if (input.changeType === "duplicate") {
    return createTransactionNotification({
      userId: input.userId,
      type: "potential_duplicate_payment",
      transaction: input.transaction,
      title: "Potential duplicate payment detected",
      body: "Two similar payments were detected and are ready to review.",
      severity: "warning",
      now: input.now,
    });
  }

  return createTransactionNotification({
    userId: input.userId,
    type: input.changeType === "new" ? "new_transaction" : "transaction_updated",
    transaction: input.transaction,
    title: input.changeType === "new" ? "New transaction detected" : "Transaction updated",
    body:
      input.changeType === "new"
        ? "New provider activity is ready to review."
        : "Provider activity changed and may need review.",
    severity: "info",
    now: input.now,
  });
}

export function createAppBadgePlaceholderUpdate(unreadCount: number) {
  return {
    realPushDeliveryEnabled: false,
    unreadCount,
    supportedApi: "navigator.setAppBadge",
  };
}
