"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "client_error_boundary",
        message: "A client-rendered app error was caught.",
        digest: error.digest ?? null,
      }),
    );
  }, [error.digest]);

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <AlertTriangle className="h-6 w-6 text-berry" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
        Personal Finance HQ could not load this view safely. No credentials, provider
        tokens, or financial payloads are shown here.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink/70"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
