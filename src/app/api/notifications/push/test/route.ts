import { NextResponse } from "next/server";
import type { AppNotification } from "@/lib/domain";
import { deliverWebPushNotification } from "@/lib/notifications/notification-delivery";
import { getActivePushSubscriptionsForCurrentUser } from "@/lib/notifications/push-subscriptions";
import {
  createNotification,
  getNotificationPreferences,
} from "@/lib/repositories/notification-repository";
import { recordAuditEvent } from "@/lib/repositories/finance-repository";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

function createTestNotification(userId: string): AppNotification {
  const now = new Date().toISOString();

  return {
    id: `notif_push_test_${now.slice(0, 10)}`,
    userId,
    type: "safe_to_spend_change",
    severity: "info",
    channel: "in_app",
    title: "Test notification",
    body: "This is a test notification inside Personal Finance HQ.",
    privacySafeTitle: "New finance alert",
    privacySafeBody: "Open Personal Finance HQ to review it.",
    actionHref: "/notifications",
    entityType: "notification_test",
    entityId: null,
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function POST() {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  await recordAuditEvent({
    userId: auth.user.id,
    eventType: "push_test_requested",
    entity: "push_subscriptions",
    entityId: null,
  });

  const notification = await createNotification(createTestNotification(auth.user.id));
  const [subscriptions, preferences] = await Promise.all([
    getActivePushSubscriptionsForCurrentUser(),
    getNotificationPreferences(),
  ]);
  const attempts = await deliverWebPushNotification({
    notification,
    subscriptions,
    preferences,
  });

  return NextResponse.json({
    notificationId: notification.id,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      failureReason: attempt.failureReason,
      providerResponseCode: attempt.providerResponseCode,
    })),
  });
}
