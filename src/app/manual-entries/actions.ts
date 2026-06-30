"use server";

import { revalidatePath } from "next/cache";
import {
  createManualFinanceItem,
  deleteManualFinanceItem,
  updateManualFinanceItem,
} from "@/lib/repositories/finance-repository";
import type { ManualFinanceItem } from "@/lib/domain";
import type { ManualFinanceItemInput } from "@/lib/repositories/validation";

export async function createManualFinanceItemAction(input: ManualFinanceItemInput) {
  const item = await createManualFinanceItem(input);
  revalidatePath("/manual-entries");
  return item;
}

export async function updateManualFinanceItemAction(input: ManualFinanceItem) {
  const item = await updateManualFinanceItem(input);
  revalidatePath("/manual-entries");
  return item;
}

export async function deleteManualFinanceItemAction(id: string) {
  const result = await deleteManualFinanceItem(id);
  revalidatePath("/manual-entries");
  return result;
}
