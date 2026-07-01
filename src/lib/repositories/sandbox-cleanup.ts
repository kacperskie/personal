import "server-only";

import type { Account, BankConnection, Transaction } from "@/lib/domain";
import type { DocumentReference } from "firebase-admin/firestore";
import { createFirebaseAdminFirestore } from "@/lib/firebase/admin";
import {
  isSandboxAccount,
  liveConnectionIdSet,
  sandboxConnectionIdSet,
} from "@/lib/bank-providers/sandbox-data";
import { logServerEvent } from "@/lib/observability/server-logger";

export type SandboxCleanupCounts = {
  connections: number;
  accounts: number;
  transactions: number;
  providerTokens: number;
  syncRuns: number;
};

const zeroCounts: SandboxCleanupCounts = {
  connections: 0,
  accounts: 0,
  transactions: 0,
  providerTokens: 0,
  syncRuns: 0,
};

type Targets = {
  refs: DocumentReference[];
  counts: SandboxCleanupCounts;
};

/**
 * Compute the exact sandbox/mock document refs to remove for a user. Conservative
 * by construction: anything linked to a LIVE connection is protected, and only
 * documents that clearly match sandbox/mock markers are targeted. Returns value-
 * free counts only.
 */
async function collectSandboxTargets(userId: string): Promise<Targets | null> {
  const db = await createFirebaseAdminFirestore();

  if (!db) {
    return null;
  }

  const base = `users/${userId}`;
  const [connectionsSnap, accountsSnap, transactionsSnap, tokensSnap, syncSnap] =
    await Promise.all([
      db.collection(`${base}/bankConnections`).get(),
      db.collection(`${base}/accounts`).get(),
      db.collection(`${base}/transactions`).get(),
      db.collection(`${base}/providerTokens`).get(),
      db.collection(`${base}/providerSyncEvents`).get(),
    ]);

  const connections = connectionsSnap.docs.map((doc) => doc.data() as BankConnection);
  const sandboxConnectionIds = sandboxConnectionIdSet(connections);
  const liveConnectionIds = liveConnectionIdSet(connections);

  const refs: DocumentReference[] = [];
  const counts: SandboxCleanupCounts = { ...zeroCounts };

  for (const doc of connectionsSnap.docs) {
    if (sandboxConnectionIds.has((doc.data() as BankConnection).id ?? doc.id)) {
      refs.push(doc.ref);
      counts.connections += 1;
    }
  }

  const sandboxAccountIds = new Set<string>();
  for (const doc of accountsSnap.docs) {
    const account = doc.data() as Account;
    if (isSandboxAccount(account, sandboxConnectionIds, liveConnectionIds)) {
      refs.push(doc.ref);
      sandboxAccountIds.add(account.id ?? doc.id);
      counts.accounts += 1;
    }
  }

  for (const doc of transactionsSnap.docs) {
    if (sandboxAccountIds.has((doc.data() as Transaction).accountId)) {
      refs.push(doc.ref);
      counts.transactions += 1;
    }
  }

  // Provider tokens are keyed by connectionId (doc id === connectionId). A token
  // is only ever removed when its connection is a sandbox connection, so live
  // tokens are never touched.
  for (const doc of tokensSnap.docs) {
    const data = doc.data() as { connectionId?: string; provider?: string };
    const connectionId = data.connectionId ?? doc.id;
    if (data.provider === "mock" || sandboxConnectionIds.has(connectionId)) {
      refs.push(doc.ref);
      counts.providerTokens += 1;
    }
  }

  for (const doc of syncSnap.docs) {
    const data = doc.data() as { providerConnectionId?: string; provider?: string };
    if (
      data.provider === "mock" ||
      (data.providerConnectionId ? sandboxConnectionIds.has(data.providerConnectionId) : false)
    ) {
      refs.push(doc.ref);
      counts.syncRuns += 1;
    }
  }

  return { refs, counts };
}

export async function previewSandboxCleanup(userId: string): Promise<SandboxCleanupCounts> {
  if (!userId) {
    return { ...zeroCounts };
  }

  const targets = await collectSandboxTargets(userId);
  return targets?.counts ?? { ...zeroCounts };
}

export async function runSandboxCleanup(userId: string): Promise<SandboxCleanupCounts> {
  if (!userId) {
    return { ...zeroCounts };
  }

  const db = await createFirebaseAdminFirestore();
  const targets = await collectSandboxTargets(userId);

  if (!db || !targets) {
    return { ...zeroCounts };
  }

  // Firestore batches are limited to 500 writes.
  for (let i = 0; i < targets.refs.length; i += 400) {
    const batch = db.batch();
    for (const ref of targets.refs.slice(i, i + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  logServerEvent({
    level: "info",
    event: "provider_sync_event",
    message: "Sandbox/mock data cleanup completed for the signed-in user.",
    metadata: {
      code: "sandbox_cleanup_completed",
      connections: targets.counts.connections,
      accounts: targets.counts.accounts,
      transactions: targets.counts.transactions,
      providerTokens: targets.counts.providerTokens,
      syncRuns: targets.counts.syncRuns,
    },
  });

  return targets.counts;
}
