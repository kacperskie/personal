import "server-only";

import type { PushSubscriptionRecord } from "@/lib/domain";
import { createEndpointHash } from "@/lib/notifications/web-push";
import { createAuditEvent } from "@/lib/repositories/audit";
import { pushSubscriptionFromRow } from "@/lib/repositories/mappers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BrowserPushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  browser: string;
  permission: NotificationPermission | "unsupported";
};

const fallbackSubscriptions = new Map<string, PushSubscriptionRecord>();

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

export function createPushSubscriptionRecord(
  userId: string,
  input: BrowserPushSubscriptionInput,
  now = new Date().toISOString(),
): PushSubscriptionRecord {
  return {
    id: `push_${createEndpointHash(input.endpoint).slice(0, 24)}`,
    userId,
    endpointHash: createEndpointHash(input.endpoint),
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    browser: input.browser,
    permission: input.permission,
    status: input.permission === "granted" ? "active" : "placeholder",
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function savePushSubscription(
  input: BrowserPushSubscriptionInput,
): Promise<PushSubscriptionRecord> {
  const context = await getAuthenticatedContext();
  const userId = context?.userId ?? "user_mock_001";
  const record = createPushSubscriptionRecord(userId, input);

  if (!context) {
    fallbackSubscriptions.set(record.id, record);
    return record;
  }

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .upsert({
      id: record.id,
      user_id: context.userId,
      endpoint_hash: record.endpointHash,
      endpoint: record.endpoint,
      p256dh: record.p256dh,
      auth: record.auth,
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

  await context.supabase.from("audit_log").insert({
    ...createAuditEvent({
      userId: context.userId,
      eventType: "push_subscription_saved",
      entity: "push_subscriptions",
      entityId: record.id,
      metadata: {
        endpointHash: record.endpointHash,
        permission: record.permission,
      },
    }),
    user_id: context.userId,
  });

  return pushSubscriptionFromRow(data);
}

export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  const context = await getAuthenticatedContext();
  const endpointHash = createEndpointHash(endpoint);

  if (!context) {
    const match = Array.from(fallbackSubscriptions.values()).find(
      (subscription) => subscription.endpointHash === endpointHash,
    );

    if (match) {
      fallbackSubscriptions.delete(match.id);
      return { id: match.id };
    }

    return { id: endpointHash };
  }

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("endpoint_hash", endpointHash)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  await context.supabase.from("audit_log").insert({
    ...createAuditEvent({
      userId: context.userId,
      eventType: "push_subscription_deleted",
      entity: "push_subscriptions",
      entityId: data?.id ?? endpointHash,
      metadata: { endpointHash },
    }),
    user_id: context.userId,
  });

  return { id: data?.id ?? endpointHash };
}

export async function getActivePushSubscriptionsForCurrentUser() {
  const context = await getAuthenticatedContext();

  if (!context) {
    return Array.from(fallbackSubscriptions.values()).filter(
      (subscription) => subscription.status === "active",
    );
  }

  const { data, error } = await context.supabase
    .from("push_subscriptions")
    .select("*")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return data.map(pushSubscriptionFromRow);
}
