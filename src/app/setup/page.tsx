import { PageHeader } from "@/components/page-header";
import { TrackerOnboardingWizard } from "@/components/setup/tracker-onboarding-wizard";

export default function SetupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Firebase Free Mode"
        title="Setup Wizard"
        description="Translate the old Google Sheets-style tracker into accounts, bills, subscriptions, manual entries, goals, debts, and review preferences."
      />

      <TrackerOnboardingWizard />

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">Free deployment defaults</h2>
        <ul className="mt-4 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
          <li>Use Netlify and Firebase for the primary free staging path.</li>
          <li>Keep OpenAI disabled until an API key and cost controls are configured.</li>
          <li>Keep live Open Banking disabled by default.</li>
          <li>Use TrueLayer sandbox only when sandbox credentials are available.</li>
        </ul>
      </section>
    </div>
  );
}
