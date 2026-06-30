import type {
  AppNotification,
  NotificationPreference,
  PushSubscriptionRecord,
} from "@/lib/domain";
import {
  mockAppNotifications,
  mockNotificationPreferences,
  mockPushSubscriptionRecords,
} from "@/lib/mock-data";
import { createDefaultNotificationPreferences } from "@/lib/notifications";
import { createAuditEvent } from "@/lib/repositories/audit";
import {
  appNotificationFromRow,
  appNotificationToRow,
  notificationPreferenceFromRow,
  notificationPreferenceToRow,
  pushSubscriptionFromRow,
} from "@/lib/repositories/mappers";
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

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockNotificationPreferences;
  }

  const { data, error } = await context.supabase
    .from("notification_preferences")
    .select("*")
    .order("type");

  if (error) {
    throw new Error(error.message);
  }

  return data.length > 0
    ? data.map(notificationPreferenceFromRow)
    : createDefaultNotificationPreferences(context.userId);
}

export async function upsertNotificationPreference(
  preference: NotificationPreference,
): Promise<NotificationPreference> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return preference;
  }

  const { data, error } = await context.supabase
    .from("notification_preferences")
    .upsert(
      notificationPreferenceToRow(
        { ...preference, userId: context.userId, updatedAt: new Date().toISOString() },
        context.userId,
      ),
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "notification_preference_changed",
      entity: "notification_preferences",
      entityId: preference.id,
      metadata: { type: preference.type, enabled: preference.enabled },
    }),
    context.supabase,
  );

  return notificationPreferenceFromRow(data);
}

export async function getNotifications(): Promise<AppNotification[]> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockAppNotifications;
  }

  const { data, error } = await context.supabase
    .from("app_notifications")
    .select("*")
    .neq("status", "dismissed")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data.map(appNotificationFromRow);
}

export async function createNotification(
  notification: AppNotification,
): Promise<AppNotification> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return notification;
  }

  const { data, error } = await context.supabase
    .from("app_notifications")
    .insert(appNotificationToRow(notification, context.userId))
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "notification_created",
      entity: "app_notifications",
      entityId: notification.id,
      metadata: { type: notification.type, severity: notification.severity },
    }),
    context.supabase,
  );

  return appNotificationFromRow(data);
}

export async function markNotificationRead(id: string): Promise<AppNotification | null> {
  const now = new Date().toISOString();
  const context = await getAuthenticatedContext();

  if (!context) {
    const notification = mockAppNotifications.find((item) => item.id === id);
    return notification ? { ...notification, status: "read", readAt: now, updatedAt: now } : null;
  }

  const { data, error } = await context.supabase
    .from("app_notifications")
    .update({ status: "read", read_at: now, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "notification_marked_read",
      entity: "app_notifications",
      entityId: id,
    }),
    context.supabase,
  );

  return appNotificationFromRow(data);
}

export async function markAllNotificationsRead(): Promise<AppNotification[]> {
  const now = new Date().toISOString();
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockAppNotifications
      .filter((notification) => notification.status !== "dismissed")
      .map((notification) => ({
        ...notification,
        status: "read",
        readAt: notification.readAt ?? now,
        updatedAt: now,
      }));
  }

  const { data, error } = await context.supabase
    .from("app_notifications")
    .update({ status: "read", read_at: now, updated_at: now })
    .neq("status", "dismissed")
    .select();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "notification_marked_read",
      entity: "app_notifications",
      entityId: null,
      metadata: { scope: "all" },
    }),
    context.supabase,
  );

  return data.map(appNotificationFromRow);
}

export async function dismissNotification(id: string): Promise<AppNotification | null> {
  const now = new Date().toISOString();
  const context = await getAuthenticatedContext();

  if (!context) {
    const notification = mockAppNotifications.find((item) => item.id === id);
    return notification
      ? { ...notification, status: "dismissed", dismissedAt: now, updatedAt: now }
      : null;
  }

  const { data, error } = await context.supabase
    .from("app_notifications")
    .update({ status: "dismissed", dismissed_at: now, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "notification_dismissed",
      entity: "app_notifications",
      entityId: id,
    }),
    context.supabase,
  );

  return appNotificationFromRow(data);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const context = await getAuthenticatedContext();

  if (!context) {
    return mockAppNotifications.filter((notification) => notification.status === "unread")
      .length;
  }

  const { count, error } = await context.supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export type PushSubscriptionPlaceholderInput = {
  permission: NotificationPermission | "unsupported";
  browser: string;
};

export async function savePushSubscriptionPlaceholder(
  input: PushSubscriptionPlaceholderInput,
): Promise<PushSubscriptionRecord> {
  const now = new Date().toISOString();
  const context = await getAuthenticatedContext();
  const record: PushSubscriptionRecord = {
    id: "push_placeholder_current_device",
    userId: context?.userId ?? "user_mock_001",
    endpointHash: "placeholder-no-real-endpoint",
    browser: input.browser,
    permission: input.permission,
    status: "placeholder",
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };

  if (!context) {
    return record;
  }

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .upsert({
      id: record.id,
      user_id: context.userId,
      endpoint_hash: record.endpointHash,
      endpoint: null,
      p256dh: null,
      auth: null,
      browser: record.browser,
      user_agent: record.browser,
      permission: record.permission,
      status: record.status,
      last_seen_at: record.lastSeenAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
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
      eventType: "push_subscription_placeholder_saved",
      entity: "push_subscriptions",
      entityId: record.id,
      metadata: { permission: input.permission },
    }),
    context.supabase,
  );

  return pushSubscriptionFromRow(data);
}

export async function deletePushSubscriptionPlaceholder(
  id = "push_placeholder_current_device",
): Promise<{ id: string }> {
  const context = await getAuthenticatedContext();

  if (!context) {
    const existing = mockPushSubscriptionRecords.find((record) => record.id === id);
    return { id: existing?.id ?? id };
  }

  const { error } = await context.supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "push_subscription_placeholder_deleted",
      entity: "push_subscriptions",
      entityId: id,
    }),
    context.supabase,
  );

  return { id };
}

export async function auditPushNotificationPermissionRequested(permission: string) {
  const context = await getAuthenticatedContext();

  if (!context) {
    return {
      permission,
      audited: false,
    };
  }

  await writeAudit(
    context.userId,
    createAuditEvent({
      userId: context.userId,
      eventType: "push_notification_permission_requested",
      entity: "push_subscriptions",
      entityId: null,
      metadata: { permission },
    }),
    context.supabase,
  );

  return {
    permission,
    audited: true,
  };
}
