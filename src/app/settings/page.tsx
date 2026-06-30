import { ShieldCheck, ToggleLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Private workspace"
        title="Settings"
        description="Mock settings for data mode, safety boundaries, and future feature flags."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ShieldCheck className="h-5 w-5 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Data mode</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            This build uses mock seed data only. No bank credentials, bank connections,
            account tokens, or real financial records are stored.
          </p>
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ToggleLeft className="h-5 w-5 text-saffron" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Feature flags</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">Open Banking</dt>
              <dd className="rounded-full bg-saffron/10 px-3 py-1 font-semibold text-saffron">
                Off
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">AI API calls</dt>
              <dd className="rounded-full bg-saffron/10 px-3 py-1 font-semibold text-saffron">
                Off
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">CSV import</dt>
              <dd className="rounded-full bg-moss/10 px-3 py-1 font-semibold text-moss">
                Planned
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">Safety rules</h2>
        <ul className="mt-4 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
          <li>Financial calculations stay deterministic in code.</li>
          <li>AI can explain, summarise, forecast, and suggest.</li>
          <li>External actions require explicit user confirmation.</li>
          <li>Regulated advice topics remain educational and signposted.</li>
        </ul>
      </section>
    </div>
  );
}
