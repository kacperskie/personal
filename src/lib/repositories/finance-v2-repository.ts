import "server-only";

import type { OverdraftPlan, PaydayPlan } from "@/lib/domain";
import { isFirebaseBackend } from "@/lib/backend/provider";
import {
  getFirebaseCollection,
  upsertFirebaseDocument,
} from "@/lib/repositories/firebase-repository";
import {
  normaliseOverdraftPlan,
  normalisePaydayPlan,
  overdraftPlanToFirestore,
  paydayPlanToFirestore,
} from "@/lib/repositories/finance-v2-mappers";
import { mockOverdraftPlans, mockPaydayPlans } from "@/lib/mock-data";

/**
 * Repository access for v2 payday and overdraft plans.
 *
 * Firebase is the persistence backend. For mock (and the legacy Supabase path,
 * which has no tables for these yet) we fall back to read-only mock data so the
 * app keeps working without a backend. Supabase repository code is intentionally
 * untouched in this stage.
 */

const now = () => new Date().toISOString();

// --- Payday plans ----------------------------------------------------------

export async function getPaydayPlans(): Promise<PaydayPlan[]> {
  if (!isFirebaseBackend()) {
    return mockPaydayPlans;
  }

  const documents = await getFirebaseCollection("paydayPlans", []);

  return documents.map((document) =>
    normalisePaydayPlan(document, {
      id: document.id,
      userId: document.userId,
      paydayDate: document.paydayDate,
      now: now(),
    }),
  );
}

export async function upsertPaydayPlan(plan: PaydayPlan): Promise<PaydayPlan> {
  const validated = paydayPlanToFirestore(plan);

  if (!isFirebaseBackend()) {
    return validated;
  }

  return upsertFirebaseDocument("paydayPlans", validated);
}

// --- Overdraft plans -------------------------------------------------------

export async function getOverdraftPlans(): Promise<OverdraftPlan[]> {
  if (!isFirebaseBackend()) {
    return mockOverdraftPlans;
  }

  const documents = await getFirebaseCollection("overdraftPlans", []);

  return documents.map((document) =>
    normaliseOverdraftPlan(document, {
      id: document.id,
      userId: document.userId,
      linkedAccountId: document.linkedAccountId,
      now: now(),
    }),
  );
}

export async function upsertOverdraftPlan(
  plan: OverdraftPlan,
): Promise<OverdraftPlan> {
  const validated = overdraftPlanToFirestore(plan);

  if (!isFirebaseBackend()) {
    return validated;
  }

  return upsertFirebaseDocument("overdraftPlans", validated);
}
