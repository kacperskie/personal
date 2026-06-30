import { CalendarDays, Repeat, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { recurringPayments } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function BillsAndSubscriptionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commitments"
        title="Bills & Subscriptions"
        description="Mock recurring commitments grouped for review before they become official bills."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CalendarDays className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Confirmed bills</p>
          <p className="mt-1 text-2xl font-semibold text-ink">5</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Repeat className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Subscriptions</p>
          <p className="mt-1 text-2xl font-semibold text-ink">4</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <TriangleAlert className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Needs review</p>
          <p className="mt-1 text-2xl font-semibold text-ink">2</p>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Next due</th>
                <th className="px-4 py-3 text-right">Typical amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recurringPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-3 font-semibold text-ink">{payment.name}</td>
                  <td className="px-4 py-3 text-ink/70">{payment.type}</td>
                  <td className="px-4 py-3 text-ink/70">{payment.cadence}</td>
                  <td className="px-4 py-3 text-ink/70">{payment.nextDue}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill label={payment.status} tone={payment.tone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
