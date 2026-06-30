import { ManualEntriesManager } from "@/components/manual-entries/manual-entries-manager";
import { PageHeader } from "@/components/page-header";
import { getManualFinanceItems } from "@/lib/repositories/finance-repository";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function ManualEntriesPage() {
  const items = await getManualFinanceItems();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Manual coverage"
        title="Manual Entries"
        description="Create, review, and maintain manual inputs for debts, offline balances, future expenses, pensions, and provider gaps."
      />

      <ManualEntriesManager
        items={items}
        supabaseConfigured={isSupabaseConfigured()}
      />
    </div>
  );
}
