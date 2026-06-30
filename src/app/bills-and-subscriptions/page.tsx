import { CalendarDays, Repeat, TriangleAlert } from "lucide-react";
import {
  approveDetectedBillAction,
  approveDetectedSubscriptionAction,
  approveRecurringCandidateAction,
  dismissRecurringCandidateAction,
  markDetectedSubscriptionInactiveAction,
} from "@/app/bills-and-subscriptions/actions";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import {
  getAccounts,
  getBills,
  getDetectedBills,
  getDetectedSubscriptions,
  getRecurringPaymentCandidates,
  getSubscriptions,
} from "@/lib/repositories/finance-repository";
import { formatCurrency, formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

function annualEstimate(amount: number, frequency: string) {
  if (frequency === "weekly") {
    return amount * 52;
  }

  if (frequency === "annual") {
    return amount;
  }

  return amount * 12;
}

function statusTone(status: string): "good" | "neutral" | "warning" | "risk" {
  if (status === "confirmed" || status === "approved") {
    return "good";
  }

  if (status === "inactive" || status === "dismissed") {
    return "neutral";
  }

  return "warning";
}

export default async function BillsAndSubscriptionsPage() {
  const [accounts, bills, subscriptions, recurringCandidates, detectedBills, detectedSubscriptions] =
    await Promise.all([
      getAccounts(),
      getBills(),
      getSubscriptions(),
      getRecurringPaymentCandidates(),
      getDetectedBills(),
      getDetectedSubscriptions(),
    ]);
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  const reviewCandidateCount = [
    ...recurringCandidates.filter((candidate) => !candidate.reviewed),
    ...detectedBills.filter((bill) => !bill.reviewed),
    ...detectedSubscriptions.filter((subscription) => !subscription.reviewed),
  ].length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commitments"
        title="Bills & Subscriptions"
        description="Confirmed commitments and deterministic recurring-payment detections ready for review."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CalendarDays className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Confirmed bills</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{bills.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Repeat className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Subscriptions</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{subscriptions.length}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <TriangleAlert className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Detected items needing review</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{reviewCandidateCount}</p>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Confirmed bills</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {bills.map((bill) => (
            <article key={bill.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{bill.name}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    {formatDateShort(bill.dueDate)} from{" "}
                    {bill.accountId ? accountNameById.get(bill.accountId) : "Unassigned"}
                  </p>
                </div>
                <StatusPill label={bill.status} tone={statusTone(bill.status)} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink/50">Monthly estimate</dt>
                  <dd className="font-semibold text-ink">{formatCurrency(bill.amount)}</dd>
                </div>
                <div>
                  <dt className="text-ink/50">Annual estimate</dt>
                  <dd className="font-semibold text-ink">
                    {formatCurrency(annualEstimate(bill.amount, bill.recurrence.frequency))}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-semibold text-ink">Confirmed subscriptions</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((subscription) => (
            <article key={subscription.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{subscription.name}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    {formatDateShort(subscription.dueDate)} from{" "}
                    {subscription.accountId
                      ? accountNameById.get(subscription.accountId)
                      : "Unassigned"}
                  </p>
                </div>
                <StatusPill
                  label={subscription.status}
                  tone={statusTone(subscription.status)}
                />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink/50">Monthly estimate</dt>
                  <dd className="font-semibold text-ink">
                    {formatCurrency(subscription.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Annual estimate</dt>
                  <dd className="font-semibold text-ink">
                    {formatCurrency(
                      annualEstimate(subscription.amount, subscription.recurrence.frequency),
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="border-b border-line p-5">
          <h2 className="text-lg font-semibold text-ink">Detected candidates</h2>
          <p className="mt-1 text-sm text-ink/60">
            Deterministic candidates stay pending until reviewed.
          </p>
        </div>
        <div className="grid gap-3 p-5">
          {[...detectedBills, ...detectedSubscriptions].map((item) => {
            const isSubscription = "nextExpectedDate" in item;
            const nextDate = isSubscription ? item.nextExpectedDate : item.nextDueDate;
            const accountName = item.paymentAccountId
              ? accountNameById.get(item.paymentAccountId)
              : "Unassigned";

            return (
              <article key={item.id} className="rounded-lg border border-line bg-paper p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{item.name}</h3>
                      <StatusPill label={item.status} tone={statusTone(item.status)} />
                      {isSubscription && item.priceChangeDetected ? (
                        <StatusPill label="price change" tone="warning" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink/60">
                      {isSubscription ? "Subscription" : "Bill"} - {item.category} -{" "}
                      {formatDateShort(nextDate)} - {accountName}
                    </p>
                    <p className="mt-2 text-sm text-ink/70">
                      {formatCurrency(item.amountEstimate)} each {item.frequency};{" "}
                      {formatCurrency(annualEstimate(item.amountEstimate, item.frequency))} annual
                      estimate. Confidence {Math.round(item.confidence * 100)}%.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form
                      action={
                        isSubscription
                          ? approveDetectedSubscriptionAction.bind(null, item.id)
                          : approveDetectedBillAction.bind(null, item.id)
                      }
                    >
                      <button
                        className="min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
                      >
                        Approve
                      </button>
                    </form>
                    {isSubscription ? (
                      <form action={markDetectedSubscriptionInactiveAction.bind(null, item.id)}>
                        <button className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                          Mark inactive
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}

          {recurringCandidates
            .filter((candidate) => !candidate.reviewed)
            .map((candidate) => (
              <article key={candidate.id} className="rounded-lg border border-line bg-paper p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <h3 className="font-semibold text-ink">{candidate.merchant}</h3>
                    <p className="mt-1 text-sm text-ink/60">
                      {candidate.candidateType} candidate - next expected{" "}
                      {formatDateShort(candidate.nextExpectedDate)}
                    </p>
                    <p className="mt-2 text-sm text-ink/70">
                      {formatCurrency(candidate.amountEstimate)} each {candidate.frequency};
                      confidence {Math.round(candidate.confidence * 100)}%.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={approveRecurringCandidateAction.bind(null, candidate.id)}>
                      <button className="min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                        Approve recurring
                      </button>
                    </form>
                    <form action={dismissRecurringCandidateAction.bind(null, candidate.id)}>
                      <button className="min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}
