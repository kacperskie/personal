import { BookOpenText, CalendarClock, Scale } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { mockManualFinanceItems } from "@/lib/mock-data";
import { formatCurrency, formatDateShort } from "@/lib/format";

const directionTone = {
  asset: "good",
  receivable: "good",
  income: "good",
  liability: "risk",
  payable: "warning",
  expense: "warning",
} as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function ManualEntriesPage() {
  const includedInCashflow = mockManualFinanceItems.filter(
    (item) => item.includeInCashflow,
  ).length;
  const includedInNetWorth = mockManualFinanceItems.filter(
    (item) => item.includeInNetWorth,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manual coverage"
        title="Manual Entries"
        description="Manual inputs remain available for debts, offline balances, future expenses, pensions, and items providers cannot see."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <BookOpenText className="h-5 w-5 text-teal" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Manual entries</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {mockManualFinanceItems.length}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <CalendarClock className="h-5 w-5 text-saffron" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Included in cashflow</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{includedInCashflow}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Scale className="h-5 w-5 text-moss" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink/60">Included in net worth</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{includedInNetWorth}</p>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Due / review</th>
                <th className="px-4 py-3">Included</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mockManualFinanceItems.map((item) => (
                <tr key={item.id}>
                  <td className="min-w-56 px-4 py-3">
                    <p className="font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-ink/50">{item.notes}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {label(item.type)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill label={label(item.direction)} tone={directionTone[item.direction]} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {item.dueDate ? formatDateShort(item.dueDate) : "No due date"}
                    {item.reviewDate ? ` - Review ${formatDateShort(item.reviewDate)}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {item.includeInCashflow ? "Cashflow" : ""}
                    {item.includeInCashflow && item.includeInNetWorth ? " / " : ""}
                    {item.includeInNetWorth ? "Net worth" : ""}
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
