import type { AppNotification, BankConnection, NotificationType } from "@/lib/domain";
import { getPrivacySafeNotificationCopy } from "@/lib/notifications";

export function createProviderNotification({
  userId,
  connection,
  type,
  title,
  body,
  severity,
  now = new Date().toISOString(),
}: {
  userId: string;
  connection: BankConnection;
  type: Extract<
    NotificationType,
    | "connection_successful"
    | "sync_successful"
    | "account_sync_failure"
    | "consent_renewal"
    | "connection_revoked"
  >;
  title: string;
  body: string;
  severity: AppNotification["severity"];
  now?: string;
}): AppNotification {
  const safeCopy = getPrivacySafeNotificationCopy(type);

  return {
    id: `notif_${type}_${connection.id}_${Date.now()}`,
    userId,
    type,
    severity,
    channel: "in_app",
    title,
    body,
    privacySafeTitle: safeCopy.title,
    privacySafeBody: safeCopy.body,
    actionHref: "/settings/connected-accounts",
    entityType: "bank_connection",
    entityId: connection.id,
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
