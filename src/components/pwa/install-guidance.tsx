import { Share, Smartphone } from "lucide-react";

export function InstallGuidance() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink">Install on iPhone</h2>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-ink/70">
            <li>1. Open Personal Finance HQ in Safari.</li>
            <li className="flex items-center gap-2">
              2. Tap Share <Share className="h-4 w-4" aria-hidden="true" />.
            </li>
            <li>3. Tap Add to Home Screen.</li>
            <li>4. Open from the Home Screen icon.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
