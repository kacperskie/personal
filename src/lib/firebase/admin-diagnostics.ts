import "server-only";

import { normaliseFirebasePrivateKey } from "@/lib/firebase/env";

/**
 * Server-only, value-free diagnostics for the Firebase Admin credentials.
 *
 * Reports only presence/shape of the Admin env (project id, client email, private
 * key, PEM header/footer, newline style) plus whether Admin initialisation
 * succeeds. It NEVER returns or logs the actual values: not the private key, not
 * the client email, not the project id. Safe to render in a server component.
 */

export type FirebaseAdminDiagnostic = {
  name: string;
  value: string;
};

export type FirebaseAdminInitialisationStatus =
  | "available"
  | "unavailable"
  | "not_tested";

export function getFirebaseAdminDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): FirebaseAdminDiagnostic[] {
  const rawKey = env.FIREBASE_PRIVATE_KEY;
  const normalised = normaliseFirebasePrivateKey(rawKey) ?? "";

  const hasEscapedNewlines = Boolean(rawKey && rawKey.includes("\\n"));
  const hasRealNewlines = Boolean(rawKey && rawKey.includes("\n"));
  const newlineStyle = hasEscapedNewlines
    ? hasRealNewlines
      ? "both"
      : "escaped"
    : hasRealNewlines
      ? "real"
      : "none";

  return [
    {
      name: "FIREBASE_PROJECT_ID",
      value: env.FIREBASE_PROJECT_ID ? "present" : "missing",
    },
    {
      name: "FIREBASE_CLIENT_EMAIL",
      value: env.FIREBASE_CLIENT_EMAIL ? "present" : "missing",
    },
    {
      name: "FIREBASE_PRIVATE_KEY",
      value: rawKey ? "present" : "missing",
    },
    {
      name: "FIREBASE_PRIVATE_KEY PEM header",
      value: normalised.includes("BEGIN PRIVATE KEY") ? "yes" : "no",
    },
    {
      name: "FIREBASE_PRIVATE_KEY PEM footer",
      value: normalised.includes("END PRIVATE KEY") ? "yes" : "no",
    },
    {
      name: "FIREBASE_PRIVATE_KEY newlines",
      value: newlineStyle,
    },
  ];
}

/**
 * Attempt a lazy Firebase Admin initialisation and report only the outcome.
 * Returns "not_tested" when required env is absent or the key is clearly
 * malformed (no point attempting), so we never throw or surface secret state.
 *
 * IMPORTANT: this exercises `createFirebaseAdminAuth`, not just app init, so it
 * imports `firebase-admin/auth` — the subpackage the sign-in path actually needs.
 * A previous version only tested app init and could report "available" while
 * `firebase-admin/auth` failed to load, masking the real sign-in failure.
 */
export async function testFirebaseAdminInitialisation(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FirebaseAdminInitialisationStatus> {
  const normalised = normaliseFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY) ?? "";
  const projectId = env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (
    !projectId ||
    !env.FIREBASE_CLIENT_EMAIL ||
    !env.FIREBASE_PRIVATE_KEY ||
    !normalised.includes("BEGIN PRIVATE KEY")
  ) {
    return "not_tested";
  }

  try {
    const { createFirebaseAdminAuth } = await import("@/lib/firebase/admin");
    const auth = await createFirebaseAdminAuth();
    return auth ? "available" : "unavailable";
  } catch {
    return "unavailable";
  }
}
