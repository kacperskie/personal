import "server-only";

import type {
  AppNotification,
  NotificationDeliveryAttempt,
  NotificationPreference,
  PushSubscriptionRecord,
} from "@/lib/domain";
import { isNotificationTypeEnabled, isWithinQuietHours } from "@/lib/notifications";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { createAuditEvent } from "@/lib/repositories/audit";
import {
  notificationDeliveryAttemptFromRow,
  notificationDeliveryAttemptToRow,
} from "@/lib/repositories/mappers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fallbackDeliveryAttempts = new Map<string, NotificationDeliveryAttempt>();

function nowIso() {
  return new Date().toISOString();
}

export function shouldDeliverPush({
  notification,
  preferences,
  currentTime = new Date().toISOString().slice(11, 16),
}: {
  notification: AppNotification;
  preferences: NotificationPreference[];
  currentTime?: string;
}) {
  const preference = preferences.find((item) => item.type === notification.type);

  if (!isNotificationTypeEnabled(preferences, notification.type)) {
    return { deliver: false, reason: "notification type disabled" };
  }

  if (!preference?.channels.includes("web_push")) {
    return { deliver: false, reason: "web push channel disabled" };
  }

  if (
    isWithinQuietHours(currentTime, preference.quietHoursStart, preference.quietHoursEnd)
  ) {
    return { deliver: false, reason: "quiet hours" };
  }

  return { deliver: true, reason: null };
}

export function createDeliveryAttempt({
  userId,
  notificationId,
  status,
  failureReason = null,
  providerResponseCode = null,
  now = nowIso(),
}: {
  userId: string;
  notificationId: string;
  status: NotificationDeliveryAttempt["status"];
  failureReason?: string | null;
  providerResponseCode?: number | null;
  now?: string;
}): NotificationDeliveryAttempt {
  return {
    id: `delivery_${notificationId}_web_push_${now.replace(/[^0-9]/g, "")}`,
    userId,
    notificationId,
    channel: "web_push",
    status,
    attemptedAt: now,
    deliveredAt: status === "delivered" ? now : null,
    failedAt: status === "failed" ? now : null,
    failureReason,
    providerResponseCode,
    createdAt: now,
  };
}

export async function recordNotificationDeliveryAttempt(
  attempt: NotificationDeliveryAttempt,
): Promise<NotificationDeliveryAttempt> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    fallbackDeliveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    fallbackDeliveryAttempts.set(attempt.id, attempt);
    return attempt;
  }

  const { data, error } = await supabase
    .from("notification_delivery_attempts")
    .insert(notificationDeliveryAttemptToRow(attempt, user.id))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_log").insert({
    ...createAuditEvent({
      userId: user.id,
      eventType: "notification_delivery_attempt_created",
      entity: "notification_delivery_attempts",
      entityId: attempt.id,
      metadata: {
        notificationId: attempt.notificationId,
        status: attempt.status,
        channel: attempt.channel,
      },
    }),
    user_id: user.id,
  });

  return notificationDeliveryAttemptFromRow(data);
}

export async function deliverWebPushNotification({
  notification,
  subscriptions,
  preferences,
  currentTime,
}: {
  notification: AppNotification;
  subscriptions: PushSubscriptionRecord[];
  preferences: NotificationPreference[];
  currentTime?: string;
}) {
  const deliveryDecision = shouldDeliverPush({ notification, preferences, currentTime });

  if (!deliveryDecision.deliver) {
    return [
      await recordNotificationDeliveryAttempt(
        createDeliveryAttempt({
          userId: notification.userId,
          notificationId: notification.id,
          status: "skipped",
          failureReason: deliveryDecision.reason,
        }),
      ),
    ];
  }

  if (subscriptions.length === 0) {
    return [
      await recordNotificationDeliveryAttempt(
        createDeliveryAttempt({
          userId: notification.userId,
          notificationId: notification.id,
          status: "skipped",
          failureReason: "no active push subscriptions",
        }),
      ),
    ];
  }

  const attempts: NotificationDeliveryAttempt[] = [];

  for (const subscription of subscriptions) {
    const result = await sendWebPushNotification(subscription, notification);
    attempts.push(
      await recordNotificationDeliveryAttempt(
        createDeliveryAttempt({
          userId: notification.userId,
          notificationId: notification.id,
          status: result.status,
          failureReason: result.reason,
          providerResponseCode: result.responseCode,
        }),
      ),
    );
  }

  return attempts;
}
