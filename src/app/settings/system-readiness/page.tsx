import { Activity, AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buildSystemReadinessReport } from "@/lib/deployment/readiness";

export const dynamic = "force-dynamic";

const toneByStatus = {
  pass: "good",
  warning: "warning",
  fail: "risk",
} as const;

const IconByStatus = {
  pass: CheckCircle2,
  warning: CircleDashed,
  fail: AlertTriangle,
};

export default function SystemReadinessPage() {
  const report = buildSystemReadinessReport();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staging readiness"
        title="System Readiness"
        description="Safe deployment checks for Netlify, Vercel fallback, Supabase, Open Banking providers, OpenAI, PWA push, scheduled jobs, and redirect setup. Secret values are never shown."
      />

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-ink">Readiness summary</h2>
            </div>
            <p className="mt-2 text-sm text-ink/65">
              Platform: {report.deploymentPlatform}. Environment: {report.environment}.
              Generated at {report.generatedAt}.
            </p>
          </div>
          <StatusPill
            label={report.overallStatus}
            tone={toneByStatus[report.overallStatus]}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {report.checks.map((check) => {
          const Icon = IconByStatus[check.status];

          return (
            <article key={check.id} className="rounded-lg border border-line bg-white p-5 shadow-panel">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink">{check.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{check.safeDetails}</p>
                </div>
                <Icon className="h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusPill label={check.status} tone={toneByStatus[check.status]} />
                {check.remediation ? (
                  <p className="text-sm text-ink/60">{check.remediation}</p>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
