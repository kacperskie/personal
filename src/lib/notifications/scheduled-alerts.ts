import "server-only";

import type {
  AppNotification,
  NotificationPreference,
  PushSubscriptionRecord,
} from "@/lib/domain";
import {
  calculateBillsAccountBalance,
  calculateBillsDueBeforePayday,
  calculateBudgetHealth,
  calculateSafeToSpendAmount,
  calculateSafeToSpendEligibleCash,
} from "@/lib/finance";
import { generateFinanceNotifications, isNotificationTypeEnabled } from "@/lib/notifications";
import {
  createServiceNotification,
  getServiceActiveUserIds,
  getServiceFinanceSnapshot,
  getServiceNotificationPreferences,
  getServicePushSubscriptions,
  recordServiceAuditEvent,
  recordServiceNotificationDeliveryAttempt,
} from "@/lib/repositories/service-finance-repository";
import {
  createDeliveryAttempt,
  shouldDeliverPush,
} from "@/lib/notifications/notification-delivery";
import { sendWebPushNotification } from "@/lib/notifications/web-push";
import { buildMoneyCoachContext } from "@/lib/ai/context-builder";
import { buildDeterministicMoneyCoachFallback } from "@/lib/ai/money-coach";
import { createAIInsight } from "@/lib/repositories/finance-repository";

export type ScheduledNotificationResult = {
  users: number;
  created: number;
  pushAttempts: number;
  aiReviews: number;
};

function nextPayday(asOfDate: string) {
  return "2026-07-25" > asOfDate ? "2026-07-25" : "2026-08-25";
}

function notificationId(type: string, entityId: string | null, window: string, severity: string) {
  return `notif_scheduled_${type}_${entityId ?? "general"}_${window}_${severity}`;
}

function createScheduledNotification(
  input: Omit<AppNotification, "id" | "status" | "readAt" | "dismissedAt" | "createdAt" | "updatedAt" | "channel"> & {
    window: string;
  },
): AppNotification {
  const now = new Date().toISOString();

  return {
    ...input,
    id: notificationId(input.type, input.entityId, input.window, input.severity),
    channel: "in_app",
    status: "unread",
    readAt: null,
    dismissedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildScheduledNotificationsForSnapshot({
  userId,
  asOfDate,
  preferences,
  snapshot,
}: {
  userId: string;
  asOfDate: string;
  preferences: NotificationPreference[];
  snapshot: Awaited<ReturnType<typeof getServiceFinanceSnapshot>>;
}) {
  const period =
    snapshot.budgetPeriods.find(
      (candidate) => candidate.startDate <= asOfDate && candidate.endDate >= asOfDate,
    ) ?? snapshot.budgetPeriods[0];
  const budgetHealth = period
    ? calculateBudgetHealth(
        snapshot.budgets,
        snapshot.transactions,
        snapshot.categories,
        period,
        1,
      )
    : [];
  const paydayDate = nextPayday(asOfDate);
  const billsDueBeforePayday = calculateBillsDueBeforePayday(
    snapshot.bills,
    [],
    snapshot.manualFinanceItems,
    asOfDate,
    paydayDate,
  );
  const safeToSpend = calculateSafeToSpendAmount({
    currentCash: calculateSafeToSpendEligibleCash(snapshot.accounts),
    billsDueBeforePayday,
    plannedSavingsBeforePayday: 0,
    debtPaymentsBeforePayday: 0,
    minimumBuffer: 350,
    reservedGoalContributions: 0,
  });
  const generated = generateFinanceNotifications({
    userId,
    asOfDate,
    safeToSpend,
    preferences,
    bills: snapshot.bills,
    budgetHealth,
    bankConnections: snapshot.bankConnections,
    manualFinanceItems: snapshot.manualFinanceItems,
  });
  const window = asOfDate;
  const subscriptionDue = snapshot.manualFinanceItems
    .filter((item) => item.type === "manual_bill" && item.dueDate && item.dueDate <= paydayDate)
    .slice(0, 1)
    .map((item) =>
      createScheduledNotification({
        userId,
        type: "subscription_change",
        severity: "info",
        title: `${item.name} is due soon`,
        body: `${item.name} is due soon.`,
        privacySafeTitle: "Subscription update",
        privacySafeBody: "A subscription may need review.",
        actionHref: "/bills-and-subscriptions",
        entityType: "manual_finance_item",
        entityId: item.id,
        window,
      }),
    );
  const billsAccountBalance = calculateBillsAccountBalance(snapshot.accounts);
  const shortfall =
    billsAccountBalance - billsDueBeforePayday < 0 && isNotificationTypeEnabled(preferences, "projected_bills_account_shortfall")
      ? [
          createScheduledNotification({
            userId,
            type: "projected_bills_account_shortfall",
            severity: "urgent",
            title: "Projected bills account shortfall",
            body: "Known commitments may exceed the bills account balance before payday.",
            privacySafeTitle: "Bills account needs attention",
            privacySafeBody: "Projected commitments may need review.",
            actionHref: "/",
            entityType: "dashboard",
            entityId: "bills_account",
            window,
          }),
        ]
      : [];
  const paydayPlan =
    asOfDate.endsWith("-24") && isNotificationTypeEnabled(preferences, "payday_planning")
      ? [
          createScheduledNotification({
            userId,
            type: "payday_planning",
            severity: "info",
            title: "Payday plan ready",
            body: "Your payday planning summary is ready to review.",
            privacySafeTitle: "Payday planning",
            privacySafeBody: "Your payday plan is ready to review.",
            actionHref: "/ai-coach",
            entityType: "ai_insight",
            entityId: "payday_plan",
            window,
          }),
        ]
      : [];

  return [...generated, ...subscriptionDue, ...shortfall, ...paydayPlan].map((notification) => ({
    ...notification,
    id: notification.id.startsWith("notif_scheduled")
      ? notification.id
      : notificationId(
          notification.type,
          notification.entityId,
          window,
          notification.severity,
        ),
  }));
}

async function deliverPushForNotification({
  notification,
  preferences,
  subscriptions,
}: {
  notification: AppNotification;
  preferences: NotificationPreference[];
  subscriptions: PushSubscriptionRecord[];
}) {
  const decision = shouldDeliverPush({ notification, preferences });

  if (!decision.deliver || subscriptions.length === 0) {
    await recordServiceNotificationDeliveryAttempt(
      createDeliveryAttempt({
        userId: notification.userId,
        notificationId: notification.id,
        status: "skipped",
        failureReason: decision.reason ?? "no active push subscriptions",
      }),
    );
    return 1;
  }

  for (const subscription of subscriptions) {
    const result = await sendWebPushNotification(subscription, notification);
    await recordServiceNotificationDeliveryAttempt(
      createDeliveryAttempt({
        userId: notification.userId,
        notificationId: notification.id,
        status: result.status,
        failureReason: result.reason,
        providerResponseCode: result.responseCode,
      }),
    );
  }

  return subscriptions.length;
}

async function maybeCreateScheduledAIReview(userId: string, asOfDate: string) {
  if (process.env.AI_SCHEDULED_REVIEWS_ENABLED !== "true") {
    return 0;
  }

  const mode = asOfDate.endsWith("-01") ? "monthly_review" : "weekly_review";
  const context = await buildMoneyCoachContext({
    mode,
    question: "Scheduled finance review",
    asOfDate,
  });
  const fallback = buildDeterministicMoneyCoachFallback(context, mode);

  await createAIInsight({
    id: `ai_scheduled_${mode}_${asOfDate}`,
    userId,
    type: mode,
    mode,
    title: fallback.answerSummary.slice(0, 120),
    summary: fallback.answerSummary,
    evidence: fallback.keyNumbers.map((number) => `${number.label}: ${number.value}`),
    assumptions: fallback.assumptions,
    nextAction: fallback.suggestedNextActions[0] ?? "",
    prompt: "Scheduled finance review",
    redactedContextSummary: JSON.stringify(context.sourceSummary),
    responseSummary: fallback.answerSummary,
    dataUsed: fallback.dataUsed,
    model: "deterministic-fallback",
    errorStatus: null,
    status: "active",
    createdAt: new Date().toISOString(),
  });

  return 1;
}

export async function runScheduledNotificationGeneration(asOfDate = "2026-06-30") {
  const userIds = await getServiceActiveUserIds();
  let created = 0;
  let pushAttempts = 0;
  let aiReviews = 0;

  for (const userId of userIds) {
    await recordServiceAuditEvent({
      userId,
      eventType: "scheduled_notifications_started",
      entity: "app_notifications",
      entityId: null,
      metadata: { asOfDate },
    });

    const [snapshot, preferences, subscriptions] = await Promise.all([
      getServiceFinanceSnapshot(userId),
      getServiceNotificationPreferences(userId),
      getServicePushSubscriptions(userId),
    ]);
    const notifications = buildScheduledNotificationsForSnapshot({
      userId,
      asOfDate,
      preferences,
      snapshot,
    });

    for (const notification of notifications) {
      await createServiceNotification(notification);
      created += 1;
      pushAttempts += await deliverPushForNotification({
        notification,
        preferences,
        subscriptions,
      });
    }

    aiReviews += await maybeCreateScheduledAIReview(userId, asOfDate);

    await recordServiceAuditEvent({
      userId,
      eventType: "scheduled_notifications_completed",
      entity: "app_notifications",
      entityId: null,
      metadata: {
        asOfDate,
        notifications: notifications.length,
      },
    });
  }

  return {
    users: userIds.length,
    created,
    pushAttempts,
    aiReviews,
  } satisfies ScheduledNotificationResult;
}
