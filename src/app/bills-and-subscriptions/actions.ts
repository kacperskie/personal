"use server";

import { revalidatePath } from "next/cache";
import {
  approveRecurringPaymentCandidate,
  dismissRecurringPaymentCandidate,
  getDetectedBills,
  getDetectedSubscriptions,
  upsertDetectedBill,
  upsertDetectedSubscription,
} from "@/lib/repositories/finance-repository";

export async function approveRecurringCandidateAction(id: string) {
  await approveRecurringPaymentCandidate(id);
  revalidatePath("/bills-and-subscriptions");
}

export async function dismissRecurringCandidateAction(id: string) {
  await dismissRecurringPaymentCandidate(id);
  revalidatePath("/bills-and-subscriptions");
}

export async function approveDetectedBillAction(id: string) {
  const bill = (await getDetectedBills()).find((candidate) => candidate.id === id);

  if (!bill) {
    return;
  }

  await upsertDetectedBill({
    ...bill,
    status: "approved",
    reviewed: true,
  });
  revalidatePath("/bills-and-subscriptions");
}

export async function approveDetectedSubscriptionAction(id: string) {
  const subscription = (await getDetectedSubscriptions()).find((candidate) => candidate.id === id);

  if (!subscription) {
    return;
  }

  await upsertDetectedSubscription({
    ...subscription,
    status: "approved",
    reviewed: true,
  });
  revalidatePath("/bills-and-subscriptions");
}

export async function markDetectedSubscriptionInactiveAction(id: string) {
  const subscription = (await getDetectedSubscriptions()).find((candidate) => candidate.id === id);

  if (!subscription) {
    return;
  }

  await upsertDetectedSubscription({
    ...subscription,
    status: "inactive",
    reviewed: true,
  });
  revalidatePath("/bills-and-subscriptions");
}
