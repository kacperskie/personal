"use server";

import { revalidatePath } from "next/cache";
import {
  getTransactionEnrichments,
  upsertTransactionEnrichment,
} from "@/lib/repositories/finance-repository";
import type { FinanceCategory } from "@/lib/domain";
import { updateTransactionEnrichmentReview } from "@/lib/transaction-intelligence";

async function findEnrichment(id: string) {
  return (await getTransactionEnrichments()).find((enrichment) => enrichment.id === id) ?? null;
}

export async function updateTransactionEnrichmentAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const category = String(formData.get("category") ?? "other") as FinanceCategory;
  const normalisedMerchantName = String(formData.get("merchant") ?? "").trim();
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      category,
      normalisedMerchantName: normalisedMerchantName || enrichment.normalisedMerchantName,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function markTransactionTransferAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      internalTransfer: true,
      excludedFromSpending: true,
      category: "transfers",
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function markTransactionNotTransferAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      internalTransfer: false,
      excludedFromSpending: false,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}

export async function excludeTransactionFromSpendingAction(id: string) {
  const enrichment = await findEnrichment(id);

  if (!enrichment) {
    return;
  }

  await upsertTransactionEnrichment(
    updateTransactionEnrichmentReview(enrichment, {
      excludedFromSpending: true,
      reviewStatus: "reviewed",
    }),
  );
  revalidatePath("/transactions");
}
