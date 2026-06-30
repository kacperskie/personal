"use server";

import { revalidatePath } from "next/cache";
import { updateAccountAssignment } from "@/lib/repositories/finance-repository";
import type { AccountUpdatePayload } from "@/lib/repositories/validation";

export async function saveAccountAssignmentAction(payload: AccountUpdatePayload) {
  const result = await updateAccountAssignment(payload);
  revalidatePath("/accounts");
  return result;
}
