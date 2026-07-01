import Link from "next/link";
import { AccountsManager } from "@/components/accounts/accounts-manager";
import { PageHeader } from "@/components/page-header";
import { isFirebaseBackend } from "@/lib/backend/provider";
import { isLiveTrueLayerMode, partitionAccounts } from "@/lib/bank-providers/sandbox-data";
import {
  getAccounts,
  getBankConnections,
  getBills,
  getSavingsGoals,
} from "@/lib/repositories/finance-repository";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, bills, savingsGoals, connections] = await Promise.all([
    getAccounts(),
    getBills(),
    getSavingsGoals(),
    getBankConnections(),
  ]);
  const liveMode = isLiveTrueLayerMode();
  const { live, sandbox } = partitionAccounts(accounts, connections);
  const visibleAccounts = liveMode ? live : accounts;
  const hiddenSandboxCount = liveMode ? sandbox.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connected accounts"
        title="Accounts"
        description="Assign account purpose, inclusion rules, goal links, and bill payment sources. Live TrueLayer data is used in production; mock mode remains available for local development."
      />

      {hiddenSandboxCount > 0 ? (
        <div className="rounded-lg border border-line bg-paper p-4 text-sm text-ink/70">
          {hiddenSandboxCount} old sandbox/mock account{hiddenSandboxCount === 1 ? " is" : "s are"}{" "}
          hidden from live totals.{" "}
          <Link className="font-semibold text-teal" href="/settings/connected-accounts">
            Clean up sandbox data
          </Link>
          .
        </div>
      ) : null}

      <AccountsManager
        accounts={visibleAccounts}
        bills={bills}
        savingsGoals={savingsGoals}
        persistenceConfigured={isFirebaseBackend()}
      />
    </div>
  );
}
