import { NextResponse } from "next/server";
import {
  getFirebaseAdminDiagnostics,
  testFirebaseAdminInitialisation,
} from "@/lib/firebase/admin-diagnostics";
import { getFirebaseAdminEnv } from "@/lib/firebase/env";
import { getBackendProvider } from "@/lib/backend/provider";

/**
 * TEMPORARY public, unauthenticated diagnostic.
 *
 * Reports — with ZERO secret values — whether the Firebase Admin env vars are
 * visible to the serverless function at runtime (present / empty / length), plus
 * the value-free Admin shape diagnostics and the actual init result. It exists so
 * a broken sign-in (which blocks the authed /settings/system-readiness page) can
 * still be diagnosed on the deployed host.
 *
 * It NEVER returns a value: only booleans, lengths, and present/missing/yes/no.
 * A runtime invariant additionally suppresses the response if any known secret
 * substring is ever detected in the payload.
 *
 * REMOVE THIS ROUTE (and its entry in the middleware public allowlist) once the
 * sign-in diagnostic is complete.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACKED = [
  "BACKEND_PROVIDER",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

function visibility(name: string) {
  const value = process.env[name];
  return {
    name,
    present: value !== undefined,
    empty: (value ?? "").trim().length === 0,
    length: (value ?? "").length,
  };
}

export async function GET() {
  const payload = {
    warning:
      "TEMPORARY PUBLIC DIAGNOSTIC — value-free. Remove /api/debug/env-visibility and its middleware allowlist entry once sign-in works.",
    runtime: "nodejs",
    generatedAt: new Date().toISOString(),
    // Booleans that summarise the actual decision points, no values exposed.
    firebaseBackendSelected: getBackendProvider() === "firebase",
    adminEnvResolves: Boolean(getFirebaseAdminEnv()),
    adminInit: await testFirebaseAdminInitialisation(),
    // Per-var runtime visibility: present / empty / length only.
    envVisibility: TRACKED.map(visibility),
    // Value-free shape checks (present/missing, PEM header/footer, newline style).
    adminDiagnostics: getFirebaseAdminDiagnostics(),
  };

  // Value-free invariant (mirrors assertNoSecretValuesInReadinessReport): if any
  // known secret value somehow appears in the serialised payload, suppress it.
  const serialised = JSON.stringify(payload);
  const secrets = [
    process.env.FIREBASE_PRIVATE_KEY,
    process.env.FIREBASE_CLIENT_EMAIL,
    process.env.CRON_SECRET,
    process.env.OPENAI_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  ].filter((value): value is string => Boolean(value));

  if (secrets.some((secret) => serialised.includes(secret))) {
    return NextResponse.json(
      {
        error: {
          code: "diagnostic_suppressed",
          message: "Diagnostic suppressed to avoid leaking a secret value.",
        },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
