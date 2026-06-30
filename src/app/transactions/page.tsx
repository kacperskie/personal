import { PageHeader } from "@/components/page-header";
import { TransactionsExplorer } from "@/components/transactions/transactions-explorer";
import { StatusPill } from "@/components/status-pill";
import {
  excludeTransactionFromSpendingAction,
  markTransactionNotTransferAction,
  markTransactionTransferAction,
  updateTransactionEnrichmentAction,
} from "@/app/transactions/actions";
import {
  getAccounts,
  getCategories,
  getTransactionEnrichments,
  getTransactions,
} from "@/lib/repositories/finance-repository";
import { financeCategories } from "@/lib/transaction-intelligence";
import { formatCurrency, formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, accounts, categories, enrichments] = await Promise.all([
    getTransactions(),
    getAccounts(),
    getCategories(),
    getTransactionEnrichments(),
  ]);
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const reviewEnrichments = enrichments
    .filter((enrichment) => enrichment.reviewStatus === "needs_review")
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connected account activity"
        title="Transactions"
        description="Synced and mock provider transactions for review, categorisation, and own-account transfer handling."
      />

      <TransactionsExplorer
        transactions={transactions}
        accounts={accounts}
        categories={categories}
      />

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">Review workflow</h2>
          <p className="text-sm text-ink/60">
            Review deterministic merchant, category and transfer decisions before they become rules.
          </p>
        </div>
        <div className="grid gap-3">
          {reviewEnrichments.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No transactions need enrichment review.
            </div>
          ) : null}
          {reviewEnrichments.map((enrichment) => {
            const transaction = transactionById.get(enrichment.transactionId);

            if (!transaction) {
              return null;
            }

            return (
              <article key={enrichment.id} className="rounded-lg border border-line bg-paper p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,auto)]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{enrichment.normalisedMerchantName}</h3>
                      {enrichment.internalTransfer ? (
                        <StatusPill label="transfer" tone="neutral" />
                      ) : null}
                      {enrichment.excludedFromSpending ? (
                        <StatusPill label="excluded" tone="neutral" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink/60">
                      {formatDateShort(transaction.date)} - {transaction.description} -{" "}
                      {formatCurrency(transaction.amount)}
                    </p>
                    <p className="mt-2 text-sm text-ink/70">
                      Suggested category {enrichment.category}; confidence{" "}
                      {Math.round(enrichment.confidenceScore * 100)}%.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <form action={updateTransactionEnrichmentAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="id" value={enrichment.id} />
                      <input
                        name="merchant"
                        defaultValue={enrichment.normalisedMerchantName}
                        className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                        aria-label="Merchant name"
                      />
                      <select
                        name="category"
                        defaultValue={enrichment.category}
                        className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                        aria-label="Category"
                      >
                        {financeCategories.map((category) => (
                          <option key={category} value={category}>
                            {category.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      <button className="min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                        Save
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={markTransactionTransferAction.bind(null, enrichment.id)}>
                        <button className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                          Mark transfer
                        </button>
                      </form>
                      <form action={markTransactionNotTransferAction.bind(null, enrichment.id)}>
                        <button className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                          Not transfer
                        </button>
                      </form>
                      <form action={excludeTransactionFromSpendingAction.bind(null, enrichment.id)}>
                        <button className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                          Exclude spend
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
