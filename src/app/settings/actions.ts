"use server";

import { revalidatePath } from "next/cache";
import type { NotificationPreference } from "@/lib/domain";
import {
  auditPushNotificationPermissionRequested,
  deletePushSubscriptionPlaceholder,
  savePushSubscriptionPlaceholder,
  upsertNotificationPreference,
  type PushSubscriptionPlaceholderInput,
} from "@/lib/repositories/notification-repository";

export async function saveNotificationPreferencesAction(
  preferences: NotificationPreference[],
) {
  const saved = [];

  for (const preference of preferences) {
    saved.push(await upsertNotificationPreference(preference));
  }

  revalidatePath("/settings");
  return saved;
}

export async function auditPushPermissionRequestedAction(permission: string) {
  return auditPushNotificationPermissionRequested(permission);
}

export async function savePushSubscriptionPlaceholderAction(
  input: PushSubscriptionPlaceholderInput,
) {
  const record = await savePushSubscriptionPlaceholder(input);
  revalidatePath("/settings");
  return record;
}

export async function deletePushSubscriptionPlaceholderAction() {
  const record = await deletePushSubscriptionPlaceholder();
  revalidatePath("/settings");
  return record;
}
