import { AccountsManager } from "@/components/accounts/accounts-manager";
import { PageHeader } from "@/components/page-header";
import {
  getAccounts,
  getBills,
  getSavingsGoals,
} from "@/lib/repositories/finance-repository";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, bills, savingsGoals] = await Promise.all([
    getAccounts(),
    getBills(),
    getSavingsGoals(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Connected accounts"
        title="Accounts"
        description="Assign account purpose, inclusion rules, goal links, and bill payment sources. Supabase is used when configured, with mock fallback for local development."
      />

      <AccountsManager
        accounts={accounts}
        bills={bills}
        savingsGoals={savingsGoals}
        supabaseConfigured={isSupabaseConfigured()}
      />
    </div>
  );
}
