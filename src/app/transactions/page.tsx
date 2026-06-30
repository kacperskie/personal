import { PageHeader } from "@/components/page-header";
import { TransactionsExplorer } from "@/components/transactions/transactions-explorer";
import {
  getAccounts,
  getCategories,
  getTransactions,
} from "@/lib/repositories/finance-repository";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const [transactions, accounts, categories] = await Promise.all([
    getTransactions(),
    getAccounts(),
    getCategories(),
  ]);

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
    </div>
  );
}
