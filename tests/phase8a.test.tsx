import { createHmac } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountsManager } from "../src/components/connected-accounts/connected-accounts-manager";
import type {
  BankConnection,
  ProviderSyncEvent,
  Transaction,
} from "../src/lib/domain";
import {
  parseMoneyhubWebhookPayload,
} from "../src/lib/bank-providers/moneyhub-webhooks";
import {
  clearFallbackWebhookEventsForTests,
  recordProviderWebhookEventOnce,
} from "../src/lib/bank-providers/provider-webhook-events";
import {
  markProviderTransactionDeleted,
  markProviderTransactionRestored,
  mergeSyncedTransaction,
} from "../src/lib/bank-providers/provider-mappers";
import {
  clearFallbackSyncJobsForTests,
  enqueueAccountSync,
  enqueueConnectionSync,
  listFallbackSyncJobsForTests,
  processPendingSyncJobs,
} from "../src/lib/bank-providers/sync-queue";
import {
  createTransactionChangeNotification,
  createTransactionNotification,
} from "../src/lib/bank-providers/transaction-notifications";
import {
  isScheduledSyncRequestAuthorized,
  shouldSkipScheduledConnection,
} from "../src/app/api/bank-connections/scheduled-sync/route";

const baseConnection: BankConnection = {
  id: "conn_amex",
  provider: "mock",
  institutionName: "American Express",
  institutionId: "amex",
  status: "connected",
  consentStatus: "active",
  consentStartedAt: "2026-06-01T09:00:00.000Z",
  consentExpiresAt: "2026-09-01T09:00:00.000Z",
  lastSyncedAt: "2026-06-29T09:00:00.000Z",
  errorMessage: null,
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-06-29T09:00:00.000Z",
};

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn_conn_amex_acct_amex_card_mh_txn_001",
    accountId: "acct_amex_card",
    categoryId: "cat_uncategorised",
    providerConnectionId: "conn_amex",
    providerTransactionId: "mh_txn_001",
    providerUpdatedAt: "2026-06-30T09:00:00.000Z",
    providerStatus: "posted",
    providerDeletedAt: null,
    providerRestoredAt: null,
    date: "2026-06-30",
    merchant: "Synthetic merchant",
    description: "Synthetic transaction",
    amount: -42,
    currency: "GBP",
    kind: "expense",
    status: "needs_review",
    flags: [],
    pending: false,
    notes: null,
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  clearFallbackWebhookEventsForTests();
  clearFallbackSyncJobsForTests();
});

describe("phase 8A event-driven transaction sync", () => {
  it("parses Moneyhub newTransactions webhooks", () => {
    const parsed = parseMoneyhubWebhookPayload(
      {
        id: "evt_new_001",
        eventType: "newTransactions",
        connectionId: "conn_amex",
        data: {
          transactions: [
            { id: "txn_001", accountId: "amex_card_001" },
            { id: "txn_002", accountId: "amex_card_001" },
          ],
        },
      },
      "2026-06-30T10:00:00.000Z",
    );

    expect(parsed?.providerEventType).toBe("newTransactions");
    expect(parsed?.providerEventId).toBe("evt_new_001");
    expect(parsed?.connectionId).toBe("conn_amex");
    expect(parsed?.accountIds).toEqual(["amex_card_001"]);
    expect(parsed?.transactionIds).toEqual(["txn_001", "txn_002"]);
  });

  it("parses Moneyhub updatedTransactions webhooks with deterministic fallback ids", () => {
    const payload = {
      type: "transactions.updated",
      providerConnectionId: "conn_amex",
      accountIds: ["amex_card_001"],
      transactionIds: ["txn_001"],
    };
    const first = parseMoneyhubWebhookPayload(payload, "2026-06-30T10:00:00.000Z");
    const second = parseMoneyhubWebhookPayload(payload, "2026-06-30T10:05:00.000Z");

    expect(first?.providerEventType).toBe("updatedTransactions");
    expect(first?.providerEventId).toBe(second?.providerEventId);
  });

  it("stores webhook events idempotently", async () => {
    const parsed = parseMoneyhubWebhookPayload({
      id: "evt_idempotent",
      eventType: "newTransactions",
      connectionId: "conn_amex",
    });

    expect(parsed).toBeTruthy();

    const first = await recordProviderWebhookEventOnce({
      userId: "user_mock_001",
      provider: "moneyhub",
      parsed: parsed!,
    });
    const duplicate = await recordProviderWebhookEventOnce({
      userId: "user_mock_001",
      provider: "moneyhub",
      parsed: parsed!,
    });

    expect(first.isDuplicate).toBe(false);
    expect(duplicate.isDuplicate).toBe(true);
    expect(duplicate.event.id).toBe(first.event.id);
  });

  it("does not duplicate notifications for duplicate webhooks", async () => {
    const notifications: unknown[] = [];
    const auditEvents: unknown[] = [];
    const syncEvents: ProviderSyncEvent[] = [];

    vi.doMock("@/lib/repositories/service-finance-repository", () => ({
      getServiceBankConnectionById: async () => ({
        userId: "user_mock_001",
        connection: baseConnection,
      }),
      recordServiceProviderSyncEvent: async (_userId: string, event: ProviderSyncEvent) => {
        syncEvents.push(event);
        return event;
      },
      recordServiceAuditEvent: async (event: unknown) => {
        auditEvents.push(event);
        return event;
      },
      createServiceNotification: async (notification: unknown) => {
        notifications.push(notification);
        return notification;
      },
    }));
    vi.doMock("@/lib/bank-providers/server-sync-runner", () => ({
      runServerConnectionSync: async () => ({
        status: "success",
        connection: baseConnection,
        accountsUpserted: 1,
        transactionsUpserted: 1,
        syncEvents: [],
        auditEvents: [],
        safeMessage: "ok",
      }),
    }));
    const { POST } = await import("../src/app/api/bank-connections/webhook/moneyhub/route");
    const body = JSON.stringify({
      id: "evt_duplicate",
      eventType: "newTransactions",
      connectionId: "conn_amex",
    });
    const request = () =>
      new Request("http://localhost/api/bank-connections/webhook/moneyhub", {
        method: "POST",
        headers: { "x-moneyhub-signature": "stub" },
        body,
      });

    const first = await POST(request());
    const duplicate = await POST(request());
    const duplicatePayload = await duplicate.json();

    expect(first.status).toBe(200);
    expect(duplicatePayload.duplicate).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(syncEvents).toHaveLength(1);
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it("enqueues and processes sync jobs successfully", async () => {
    const job = await enqueueConnectionSync({
      userId: "user_mock_001",
      provider: "mock",
      connectionId: "conn_amex",
      reason: "webhook:newTransactions",
      idempotencyKey: "job_success",
    });
    const processed = await processPendingSyncJobs({
      processor: async (syncJob) => {
        expect(syncJob.id).toBe(job.id);
      },
    });

    expect(processed[0].status).toBe("completed");
    expect(listFallbackSyncJobsForTests()[0].status).toBe("completed");
  });

  it("marks sync queue failures safely", async () => {
    await enqueueAccountSync({
      userId: "user_mock_001",
      provider: "mock",
      connectionId: "conn_amex",
      accountIds: ["amex_card_001"],
      reason: "webhook:updatedTransactions",
      idempotencyKey: "job_failure",
    });
    const processed = await processPendingSyncJobs({
      processor: async () => {
        throw new Error("provider token secret should not be exposed");
      },
    });

    expect(processed[0].status).toBe("failed");
    expect(processed[0].errorMessage).toContain("No credentials or tokens were exposed");
    expect(processed[0].errorMessage).not.toContain("provider token secret");
  });

  it("rejects scheduled sync requests with missing or invalid cron secrets", () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    expect(
      isScheduledSyncRequestAuthorized(
        new Request("http://localhost/api/bank-connections/scheduled-sync"),
      ),
    ).toBe(false);
    expect(
      isScheduledSyncRequestAuthorized(
        new Request("http://localhost/api/bank-connections/scheduled-sync", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
    ).toBe(false);
    expect(
      isScheduledSyncRequestAuthorized(
        new Request("http://localhost/api/bank-connections/scheduled-sync", {
          headers: { authorization: "Bearer cron-secret" },
        }),
      ),
    ).toBe(true);
  });

  it("skips expired connections during scheduled sync", () => {
    expect(
      shouldSkipScheduledConnection(
        {
          ...baseConnection,
          consentStatus: "expired",
          consentExpiresAt: "2026-06-20T09:00:00.000Z",
        },
        new Date("2026-06-30T09:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      shouldSkipScheduledConnection(
        {
          ...baseConnection,
          lastSyncedAt: "2026-06-30T08:45:00.000Z",
        },
        new Date("2026-06-30T09:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("handles pending-to-posted transaction reconciliation", () => {
    const existing = transaction({
      status: "suggested",
      pending: true,
      providerStatus: "pending",
    });
    const incoming = transaction({
      pending: false,
      providerStatus: "posted",
      providerUpdatedAt: "2026-06-30T12:00:00.000Z",
      updatedAt: "2026-06-30T12:00:00.000Z",
    });
    const merged = mergeSyncedTransaction(existing, incoming);

    expect(merged.pending).toBe(false);
    expect(merged.providerStatus).toBe("posted");
    expect(merged.providerUpdatedAt).toBe("2026-06-30T12:00:00.000Z");
  });

  it("handles deleted and restored provider transactions without hard deletion", () => {
    const existing = transaction({ status: "reviewed", categoryId: "cat_groceries" });
    const deleted = markProviderTransactionDeleted(existing, "2026-06-30T12:00:00.000Z");
    const restored = markProviderTransactionRestored(
      deleted,
      transaction({ providerStatus: "restored", status: "needs_review" }),
      "2026-06-30T13:00:00.000Z",
    );

    expect(deleted.status).toBe("excluded");
    expect(deleted.flags).toContain("provider_deleted");
    expect(deleted.providerDeletedAt).toBe("2026-06-30T12:00:00.000Z");
    expect(restored.status).toBe("reviewed");
    expect(restored.categoryId).toBe("cat_groceries");
    expect(restored.flags).not.toContain("provider_deleted");
    expect(restored.providerRestoredAt).toBe("2026-06-30T13:00:00.000Z");
  });

  it("preserves user overrides during provider updates", () => {
    const existing = transaction({
      status: "reviewed",
      categoryId: "cat_personal",
      merchant: "User merchant",
      notes: "User note",
      flags: ["own_account_transfer", "user_checked"],
    });
    const incoming = transaction({
      categoryId: "cat_uncategorised",
      merchant: "Provider merchant",
      notes: null,
      flags: [],
      providerStatus: "posted",
    });
    const merged = mergeSyncedTransaction(existing, incoming);

    expect(merged.categoryId).toBe("cat_personal");
    expect(merged.merchant).toBe("User merchant");
    expect(merged.notes).toBe("User note");
    expect(merged.flags).toContain("own_account_transfer");
    expect(merged.flags).toContain("user_checked");
  });

  it("manual refresh all active connections route refreshes visible connections", async () => {
    vi.doMock("@/lib/server/route-auth", () => ({
      requireAuthenticatedRouteUser: async () => ({ user: { id: "user_test" }, supabase: {} }),
      unauthenticatedResponse: () => new Response("unauthenticated", { status: 401 }),
    }));
    vi.doMock("@/lib/repositories/finance-repository", () => ({
      getBankConnections: async () => [baseConnection],
      recordAuditEvent: async (event: unknown) => event,
      recordProviderSyncEvent: async (event: unknown) => event,
      updateBankConnectionStatus: async (connection: unknown) => connection,
      upsertAccount: async (account: unknown) => account,
      upsertTransaction: async (syncedTransaction: unknown) => syncedTransaction,
    }));
    vi.doMock("@/lib/repositories/notification-repository", () => ({
      createNotification: async (notification: unknown) => notification,
    }));
    vi.doMock("@/lib/bank-providers/provider-service", () => ({
      getProviderAdapter: () => ({
        refreshConnection: async () => ({
          id: "sync_manual_all",
          providerConnectionId: baseConnection.id,
          provider: "mock",
          status: "syncing",
          message: "Refresh queued.",
          startedAt: "2026-06-30T09:00:00.000Z",
          finishedAt: null,
        }),
        getAccounts: async () => [],
        getTransactions: async () => [],
      }),
    }));
    const { POST } = await import("../src/app/api/bank-connections/sync-all/route");
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.refreshed).toBe(1);
    expect(payload.succeeded).toBe(1);
  });

  it("creates privacy-safe transaction notification copy", () => {
    const notification = createTransactionChangeNotification({
      userId: "user_mock_001",
      transaction: transaction({
        merchant: "Detailed Merchant",
        amount: -750,
      }),
      changeType: "large",
      now: "2026-06-30T12:00:00.000Z",
    });

    expect(notification.body).toContain("750");
    expect(notification.privacySafeTitle).toBe("Large transaction detected");
    expect(notification.privacySafeBody).not.toContain("750");
    expect(notification.privacySafeBody).not.toContain("Detailed Merchant");
  });

  it("webhook route validates HMAC signatures and creates provider sync events", async () => {
    const syncEvents: ProviderSyncEvent[] = [];

    vi.stubEnv("MONEYHUB_WEBHOOK_SECRET", "webhook-secret");
    vi.doMock("@/lib/repositories/service-finance-repository", () => ({
      getServiceBankConnectionById: async () => ({
        userId: "user_mock_001",
        connection: baseConnection,
      }),
      recordServiceProviderSyncEvent: async (_userId: string, event: ProviderSyncEvent) => {
        syncEvents.push(event);
        return event;
      },
      recordServiceAuditEvent: async (event: unknown) => event,
      createServiceNotification: async (notification: unknown) => notification,
    }));
    vi.doMock("@/lib/bank-providers/server-sync-runner", () => ({
      runServerConnectionSync: async () => ({
        status: "success",
        connection: baseConnection,
        accountsUpserted: 0,
        transactionsUpserted: 1,
        syncEvents: [],
        auditEvents: [],
        safeMessage: "ok",
      }),
    }));
    const { POST } = await import("../src/app/api/bank-connections/webhook/moneyhub/route");
    const body = JSON.stringify({
      id: "evt_signed",
      eventType: "updatedTransactions",
      connectionId: "conn_amex",
    });
    const signature = `sha256=${createHmac("sha256", "webhook-secret")
      .update(body)
      .digest("hex")}`;
    const response = await POST(
      new Request("http://localhost/api/bank-connections/webhook/moneyhub", {
        method: "POST",
        headers: { "x-moneyhub-signature": signature },
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0].message).toContain("updatedTransactions");
  });

  it("scheduled sync route queues fallback sync jobs with a valid cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.doMock("@/lib/repositories/service-finance-repository", () => ({
      getServiceActiveBankConnections: async () => [
        {
          userId: "user_mock_001",
          connection: {
            ...baseConnection,
            lastSyncedAt: "2026-06-30T07:00:00.000Z",
          },
        },
      ],
      getServiceBankConnectionById: async () => ({
        userId: "user_mock_001",
        connection: baseConnection,
      }),
      recordServiceAuditEvent: async (event: unknown) => event,
    }));
    vi.doMock("@/lib/bank-providers/server-sync-runner", () => ({
      runServerConnectionSync: async () => ({
        status: "success",
        connection: baseConnection,
        accountsUpserted: 0,
        transactionsUpserted: 0,
        syncEvents: [],
        auditEvents: [],
        safeMessage: "ok",
      }),
    }));
    const { POST } = await import("../src/app/api/bank-connections/scheduled-sync/route");
    const response = await POST(
      new Request("http://localhost/api/bank-connections/scheduled-sync", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.queued).toBe(1);
    expect(payload.processed).toBe(1);
  });

  it("Connected Accounts UI includes refresh all active control", () => {
    const html = renderToStaticMarkup(
      <ConnectedAccountsManager
        connections={[baseConnection]}
        providerState={{
          provider: "mock",
          configured: true,
          safeMessage: "Mock provider is active.",
        }}
      />,
    );

    expect(html).toContain("Sync all active");
    expect(html).toContain("Last successful sync");
    expect(html).toContain("Last failed sync");
  });

  it("builds generic transaction notifications for webhook-created activity", () => {
    const notification = createTransactionNotification({
      userId: "user_mock_001",
      type: "new_transaction",
      entityId: "evt_notification",
      title: "New transaction detected",
      body: "Provider activity is ready to review.",
      now: "2026-06-30T12:00:00.000Z",
    });

    expect(notification.actionHref).toBe("/transactions");
    expect(notification.privacySafeTitle).toBe("New transaction detected");
    expect(notification.privacySafeBody).toBe("New account activity is ready to review.");
  });
});
