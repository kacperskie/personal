"use server";

import { revalidatePath } from "next/cache";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/repositories/notification-repository";

export async function markNotificationReadAction(id: string) {
  const notification = await markNotificationRead(id);
  revalidatePath("/notifications");
  revalidatePath("/");
  return notification;
}

export async function markAllNotificationsReadAction() {
  const notifications = await markAllNotificationsRead();
  revalidatePath("/notifications");
  revalidatePath("/");
  return notifications;
}

export async function dismissNotificationAction(id: string) {
  const notification = await dismissNotification(id);
  revalidatePath("/notifications");
  revalidatePath("/");
  return notification;
}
