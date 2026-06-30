import type { FirebasePublicConfigDiagnostic } from "@/lib/firebase/diagnostics";

/**
 * Renders a value-free present/missing list for the public Firebase web config.
 * Never displays actual config values.
 */
export function FirebaseConfigDiagnostics({
  diagnostics,
  title = "Firebase public config",
}: {
  diagnostics: FirebasePublicConfigDiagnostic[];
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">
        {title}
      </p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {diagnostics.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4">
            <dt className="font-mono text-xs text-ink/70">{item.name}</dt>
            <dd
              className={
                item.present
                  ? "rounded-full bg-moss/10 px-2.5 py-0.5 text-xs font-semibold text-moss"
                  : "rounded-full bg-berry/10 px-2.5 py-0.5 text-xs font-semibold text-berry"
              }
            >
              {item.present ? "present" : "missing"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink/55">
        Values are never shown. Set any missing variables in Netlify and redeploy so
        they are inlined into the browser build.
      </p>
    </div>
  );
}
