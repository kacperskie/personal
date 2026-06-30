import "server-only";

import type { BankProvider, SyncJob, SyncJobScope, SyncJobStatus } from "@/lib/domain";
import { toProviderSafeError } from "@/lib/bank-providers/provider-errors";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

type SyncJobRow = Database["public"]["Tables"]["sync_jobs"]["Row"];

const fallbackSyncJobs = new Map<string, SyncJob>();

function jobKey(userId: string, idempotencyKey: string) {
  return `${userId}:${idempotencyKey}`;
}

function syncJobFromRow(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    scope: row.scope,
    connectionId: row.connection_id,
    accountIds: row.account_ids,
    status: row.status,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    attempts: row.attempts,
    errorMessage: row.error_message,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSyncJob(input: {
  userId: string;
  provider: BankProvider;
  scope: SyncJobScope;
  connectionId: string;
  accountIds?: string[];
  reason: string;
  idempotencyKey?: string;
  scheduledFor?: string | null;
}): SyncJob {
  const now = new Date().toISOString();
  const accountIds = Array.from(new Set(input.accountIds ?? [])).sort();
  const idempotencyKey =
    input.idempotencyKey ??
    [
      input.scope,
      input.provider,
      input.connectionId,
      accountIds.join(",") || "all",
      input.reason,
    ].join(":");

  return {
    id: `sync_job_${crypto.randomUUID()}`,
    userId: input.userId,
    provider: input.provider,
    scope: input.scope,
    connectionId: input.connectionId,
    accountIds,
    status: "pending",
    reason: input.reason,
    idempotencyKey,
    attempts: 0,
    errorMessage: null,
    scheduledFor: input.scheduledFor ?? null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function enqueueSyncJob(input: {
  userId: string;
  provider: BankProvider;
  scope: SyncJobScope;
  connectionId: string;
  accountIds?: string[];
  reason: string;
  idempotencyKey?: string;
  scheduledFor?: string | null;
}): Promise<SyncJob> {
  const supabase = createSupabaseServiceRoleClient();
  const job = createSyncJob(input);
  const key = jobKey(input.userId, job.idempotencyKey);

  if (!supabase) {
    const existing = fallbackSyncJobs.get(key);

    if (existing) {
      return existing;
    }

    fallbackSyncJobs.set(key, job);
    return job;
  }

  const { data: existing, error: existingError } = await supabase
    .from("sync_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("idempotency_key", job.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return syncJobFromRow(existing);
  }

  const { data, error } = await supabase
    .from("sync_jobs")
    .insert({
      id: job.id,
      user_id: job.userId,
      provider: job.provider,
      scope: job.scope,
      connection_id: job.connectionId,
      account_ids: job.accountIds,
      status: job.status,
      reason: job.reason,
      idempotency_key: job.idempotencyKey,
      attempts: job.attempts,
      error_message: null,
      scheduled_for: job.scheduledFor,
      started_at: null,
      completed_at: null,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return syncJobFromRow(data);
}

export function enqueueConnectionSync(input: {
  userId: string;
  provider: BankProvider;
  connectionId: string;
  reason: string;
  idempotencyKey?: string;
  scheduledFor?: string | null;
}) {
  return enqueueSyncJob({
    ...input,
    scope: "connection",
    accountIds: [],
  });
}

export function enqueueAccountSync(input: {
  userId: string;
  provider: BankProvider;
  connectionId: string;
  accountIds: string[];
  reason: string;
  idempotencyKey?: string;
  scheduledFor?: string | null;
}) {
  return enqueueSyncJob({
    ...input,
    scope: "account",
  });
}

async function updateSyncJobStatus(
  job: SyncJob,
  status: SyncJobStatus,
  changes: Partial<SyncJob> = {},
): Promise<SyncJob> {
  const now = new Date().toISOString();
  const updated: SyncJob = {
    ...job,
    ...changes,
    status,
    updatedAt: now,
  };
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    fallbackSyncJobs.set(jobKey(updated.userId, updated.idempotencyKey), updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("sync_jobs")
    .update({
      status: updated.status,
      attempts: updated.attempts,
      error_message: updated.errorMessage,
      started_at: updated.startedAt,
      completed_at: updated.completedAt,
      updated_at: updated.updatedAt,
    })
    .eq("id", job.id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return syncJobFromRow(data);
}

async function getPendingSyncJobs(limit: number): Promise<SyncJob[]> {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return Array.from(fallbackSyncJobs.values())
      .filter((job) => job.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from("sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data.map(syncJobFromRow);
}

export async function markSyncJobComplete(job: SyncJob) {
  return updateSyncJobStatus(job, "completed", {
    completedAt: new Date().toISOString(),
    errorMessage: null,
  });
}

export async function markSyncJobFailed(job: SyncJob, errorMessage: string) {
  return updateSyncJobStatus(job, "failed", {
    completedAt: new Date().toISOString(),
    errorMessage,
  });
}

export async function processPendingSyncJobs({
  processor,
  limit = 10,
}: {
  processor(job: SyncJob): Promise<void>;
  limit?: number;
}) {
  const jobs = await getPendingSyncJobs(limit);
  const processed: SyncJob[] = [];

  for (const job of jobs) {
    const started = await updateSyncJobStatus(job, "processing", {
      attempts: job.attempts + 1,
      startedAt: new Date().toISOString(),
      errorMessage: null,
    });

    try {
      await processor(started);
      processed.push(await markSyncJobComplete(started));
    } catch (error) {
      const safeError = toProviderSafeError(error, "provider_sync_failed");
      processed.push(await markSyncJobFailed(started, safeError.userMessage));
    }
  }

  return processed;
}

export function clearFallbackSyncJobsForTests() {
  fallbackSyncJobs.clear();
}

export function listFallbackSyncJobsForTests() {
  return Array.from(fallbackSyncJobs.values());
}
