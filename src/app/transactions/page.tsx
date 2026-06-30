import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { mockTransactions } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connected account activity"
        title="Transactions"
        description="Mock provider transactions for review, categorisation, and transfer handling."
      />

      <section className="rounded-lg border border-line bg-white shadow-panel">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-4">
          <input
            aria-label="Search transactions"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            placeholder="Search merchant"
            disabled
          />
          <select
            aria-label="Filter by account"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            disabled
          >
            <option>All connected accounts</option>
          </select>
          <select
            aria-label="Filter by category"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            disabled
          >
            <option>All categories</option>
          </select>
          <select
            aria-label="Filter by review status"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-teal"
            disabled
          >
            <option>All review states</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-paper/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {mockTransactions.map((transaction) => (
                <tr key={transaction.id} className="bg-white">
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {transaction.date}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {transaction.account}
                  </td>
                  <td className="min-w-48 px-4 py-3">
                    <p className="font-semibold text-ink">{transaction.merchant}</p>
                    <p className="text-xs text-ink/50">{transaction.description}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {transaction.category}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink">
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill label={transaction.status} tone={transaction.tone} />
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
