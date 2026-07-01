import { PageHeader } from "@/components/page-header";
import { TransactionsExplorer } from "@/components/transactions/transactions-explorer";
import { StatusPill } from "@/components/status-pill";
import {
  bulkTransactionBudgetOverrideAction,
  excludeTransactionFromSpendingAction,
  markTransactionNotTransferAction,
  markTransactionTransferAction,
  quickTransactionBudgetOverrideAction,
  updateTransactionBudgetOverrideAction,
  updateTransactionEnrichmentAction,
} from "@/app/transactions/actions";
import {
  getAccounts,
  getCategories,
  getTransactionBudgetOverrides,
  getTransactionEnrichments,
  getTransactions,
} from "@/lib/repositories/finance-repository";
import {
  getTransactionBudgetTreatment,
  type TransactionBudgetTreatment,
} from "@/lib/finance-interpretation";
import { financeCategories } from "@/lib/transaction-intelligence";
import { formatCurrency, formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, accounts, categories, enrichments, budgetOverrides] = await Promise.all([
    getTransactions(),
    getAccounts(),
    getCategories(),
    getTransactionEnrichments(),
    getTransactionBudgetOverrides(),
  ]);
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const overrideByTransactionId = new Map(
    budgetOverrides.map((override) => [override.transactionId, override]),
  );
  const reviewEnrichments = enrichments
    .filter((enrichment) => enrichment.reviewStatus === "needs_review")
    .slice(0, 6);
  const recentTransactions = transactions.slice(0, 20).map((transaction) => ({
    transaction,
    account: accountById.get(transaction.accountId) ?? null,
    treatment: getTransactionBudgetTreatment(
      transaction,
      accountById.get(transaction.accountId) ?? null,
      overrideByTransactionId.get(transaction.id) ?? null,
    ),
  }));
  const exclusionReasons = [
    "internal_transfer",
    "credit_card_payment",
    "amex_pocket_transfer",
    "bill",
    "rent",
    "savings_transfer",
    "debt_payment",
    "refund",
    "exceptional",
    "ignored",
    "other",
  ];
  const quickActions = [
    ["include", "Include in budgets"],
    ["exclude_weekly", "Exclude weekly"],
    ["exclude_monthly", "Exclude monthly"],
    ["exclude_both", "Exclude both"],
    ["internal_transfer", "Internal transfer"],
    ["amex_payment", "Amex payment"],
    ["amex_pocket_transfer", "Amex pocket transfer"],
    ["bill", "Bill"],
    ["savings_transfer", "Savings transfer"],
    ["ignored", "Ignored"],
  ] as const;

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
          <h2 className="text-lg font-semibold text-ink">Budget inclusion controls</h2>
          <p className="text-sm text-ink/60">
            Manual overrides win over deterministic transfer, bill, Amex and spending rules.
          </p>
        </div>

        <form action={bulkTransactionBudgetOverrideAction} className="mb-5 rounded-lg border border-line bg-paper p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="text-sm font-semibold text-ink" htmlFor="bulkAction">
                Bulk action
              </label>
              <select
                id="bulkAction"
                name="bulkAction"
                className="mt-2 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                defaultValue="internal_transfer"
              >
                {quickActions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="min-h-11 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
              Apply to selected
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentTransactions.slice(0, 12).map(({ transaction }) => (
              <label key={transaction.id} className="flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" name="transactionIds" value={transaction.id} />
                <span className="truncate">
                  {formatDateShort(transaction.date)} - {transaction.merchant || transaction.description}
                </span>
              </label>
            ))}
          </div>
        </form>

        <div className="grid gap-4">
          {recentTransactions.length === 0 ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/60">
              No transactions are available yet.
            </div>
          ) : null}
          {recentTransactions.map(({ transaction, account, treatment }) => (
            <article key={transaction.id} className="rounded-lg border border-line bg-paper p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,1.2fr)]">
                <div>
                  <p className="text-xs text-ink/50">{formatDateShort(transaction.date)}</p>
                  <h3 className="mt-1 font-semibold text-ink">
                    {transaction.merchant || transaction.description}
                  </h3>
                  <p className="mt-1 text-sm text-ink/60">
                    {account?.name ?? "Unknown account"} - {formatCurrency(transaction.amount)}
                  </p>
                  <BudgetTreatmentSummary treatment={treatment} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickActions.slice(0, 6).map(([value, label]) => (
                      <form
                        key={value}
                        action={quickTransactionBudgetOverrideAction.bind(null, transaction.id, value)}
                      >
                        <button className="min-h-9 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink">
                          {label}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
                <form action={updateTransactionBudgetOverrideAction} className="grid gap-3">
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <BudgetCheckbox
                      name="includeInWeeklyBudget"
                      label="Weekly"
                      checked={treatment.includeInWeeklyBudget}
                    />
                    <BudgetCheckbox
                      name="includeInMonthlyBudget"
                      label="Monthly"
                      checked={treatment.includeInMonthlyBudget}
                    />
                    <BudgetCheckbox
                      name="includeInSpendingSummaries"
                      label="Summaries"
                      checked={treatment.includeInSpendingSummaries}
                    />
                    <BudgetCheckbox
                      name="includeInSafeToSpendImpact"
                      label="Safe-to-spend"
                      checked={treatment.includeInSafeToSpendImpact}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      name="budgetCategory"
                      defaultValue={treatment.budgetCategory ?? transaction.categoryId}
                      className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      aria-label="Budget category"
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="exclusionReason"
                      defaultValue={treatment.exclusionReason ?? ""}
                      className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      aria-label="Exclusion reason"
                    >
                      <option value="">No exclusion reason</option>
                      {exclusionReasons.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <input
                      name="userNote"
                      defaultValue={
                        overrideByTransactionId.get(transaction.id)?.userNote ?? ""
                      }
                      placeholder="Optional note"
                      className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <button className="min-h-10 w-fit rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                    Save budget choice
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </section>

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

function BudgetCheckbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
      <input type="checkbox" name={name} defaultChecked={checked} />
      {label}
    </label>
  );
}

function BudgetTreatmentSummary({ treatment }: { treatment: TransactionBudgetTreatment }) {
  return (
    <p className="mt-2 text-xs text-ink/55">
      Weekly {treatment.includeInWeeklyBudget ? "included" : "excluded"} - Monthly{" "}
      {treatment.includeInMonthlyBudget ? "included" : "excluded"} -{" "}
      {treatment.source === "user" ? "manual override" : "deterministic rule"}
      {treatment.exclusionReason ? ` (${treatment.exclusionReason.replaceAll("_", " ")})` : ""}
    </p>
  );
}
