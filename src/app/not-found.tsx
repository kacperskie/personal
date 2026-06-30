import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <SearchX className="h-6 w-6 text-teal" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
        This page is not available in the current workspace. Use the dashboard or
        settings pages to continue staging checks.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          Dashboard
        </Link>
        <Link
          href="/settings/system-readiness"
          className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70"
        >
          System readiness
        </Link>
      </div>
    </div>
  );
}
