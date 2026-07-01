import { Activity, AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { FirebaseConfigDiagnostics } from "@/components/firebase/config-diagnostics";
import { buildSystemReadinessReport } from "@/lib/deployment/readiness";
import { getFirebasePublicConfigDiagnostics } from "@/lib/firebase/diagnostics";
import {
  getFirebaseAdminDiagnostics,
  testFirebaseAdminInitialisation,
} from "@/lib/firebase/admin-diagnostics";

export const dynamic = "force-dynamic";

const toneByStatus = {
  pass: "good",
  warning: "warning",
  fail: "risk",
} as const;

const adminInitTone = {
  available: "good",
  unavailable: "risk",
  not_tested: "warning",
} as const;

const adminInitLabel = {
  available: "available",
  unavailable: "unavailable",
  not_tested: "not tested",
} as const;

const IconByStatus = {
  pass: CheckCircle2,
  warning: CircleDashed,
  fail: AlertTriangle,
};

export default async function SystemReadinessPage() {
  const adminInitStatus = await testFirebaseAdminInitialisation();
  const report = buildSystemReadinessReport(process.env, adminInitStatus);
  const firebaseDiagnostics = getFirebasePublicConfigDiagnostics();
  const adminDiagnostics = getFirebaseAdminDiagnostics();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staging readiness"
        title="System Readiness"
        description="Safe deployment checks for Netlify, Vercel fallback, Firebase, Firestore, TrueLayer sandbox, OpenAI, PWA push, scheduled jobs, and redirect setup. Secret values are never shown."
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
        <div className="mt-4">
          <FirebaseConfigDiagnostics diagnostics={firebaseDiagnostics} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Firebase Admin server setup</h2>
            <p className="mt-1 text-sm text-ink/65">
              Server-only. Shows presence and shape of the Admin credentials and whether
              initialisation actually succeeds. Values are never shown.
            </p>
          </div>
          <StatusPill
            label={`Admin init: ${adminInitLabel[adminInitStatus]}`}
            tone={adminInitTone[adminInitStatus]}
          />
        </div>
        <dl className="mt-4 space-y-1.5 rounded-lg border border-line bg-paper p-4 text-sm">
          {adminDiagnostics.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4">
              <dt className="font-mono text-xs text-ink/70">{item.name}</dt>
              <dd className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-ink/70">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink/55">
          <span className="font-semibold">available</span> = credentials initialise;{" "}
          <span className="font-semibold">unavailable</span> = present but init failed (check
          the private key format);{" "}
          <span className="font-semibold">not tested</span> = credentials missing or the key is
          clearly malformed, so no init was attempted. Secret values are never rendered.
        </p>
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
