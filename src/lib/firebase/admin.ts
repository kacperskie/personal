import "server-only";

import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminEnv } from "@/lib/firebase/env";
import { logServerEvent } from "@/lib/observability/server-logger";

/**
 * Firebase Admin must never be imported at module top level. `firebase-admin/auth`
 * pulls in `jwks-rsa -> jose` (ESM), which breaks `require()` when bundled into
 * middleware or a page-render module graph on Netlify/Next.js. All `firebase-admin`
 * subpackages are therefore loaded lazily with dynamic `import()` inside async
 * functions, so they only initialise when actually invoked in a Node server/API
 * handler. These functions return `null` (never throw) when Admin env is missing
 * or initialisation fails, so public pages can render safely.
 *
 * Note: the `import type` lines above are erased at compile time and never emit a
 * runtime `require`, so they are safe.
 */

export async function createFirebaseAdminApp(): Promise<App | null> {
  const env = getFirebaseAdminEnv();

  if (!env) {
    // Non-secret signal: one or more of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL
    // / FIREBASE_PRIVATE_KEY is absent (or the key normalised to empty) at runtime.
    logServerEvent({
      level: "error",
      event: "auth_event",
      message:
        "Firebase Admin credentials missing or incomplete at runtime; session cookies unavailable.",
      metadata: { code: "firebase_admin_env_missing" },
    });
    return null;
  }

  try {
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");

    if (getApps().length > 0) {
      return getApps()[0];
    }

    return initializeApp({
      credential: cert({
        projectId: env.projectId,
        clientEmail: env.clientEmail,
        privateKey: env.privateKey,
      }),
    });
  } catch (error) {
    // Env is present but initialisation threw. Classify without ever logging key
    // material: we log only a code and the error's class name (never its message,
    // which is redacted-through the logger regardless). A cert/PEM parse failure
    // is the prime suspect for a malformed FIREBASE_PRIVATE_KEY.
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const looksLikeKeyProblem =
      error instanceof Error &&
      /private key|pem|decoder|asn1|der|secretorprivatekey/i.test(error.message);
    logServerEvent({
      level: "error",
      event: "auth_event",
      message: "Firebase Admin initialisation failed; session cookies unavailable.",
      metadata: {
        code: looksLikeKeyProblem
          ? "firebase_admin_cert_parse_failure"
          : "firebase_admin_init_failure",
        errorName,
      },
    });
    return null;
  }
}

export async function createFirebaseAdminAuth(): Promise<Auth | null> {
  const app = await createFirebaseAdminApp();

  if (!app) {
    return null;
  }

  try {
    const { getAuth } = await import("firebase-admin/auth");
    return getAuth(app);
  } catch (error) {
    // Previously a bare `catch { return null }` that silently masked a real
    // throw. The app subpackage can load while `firebase-admin/auth` (which
    // pulls jwks-rsa -> jose, ESM) fails to load in the deployed function — the
    // exact failure behind the session route. Log a non-secret code + error
    // name/message so it is legible; return contract unchanged (still null).
    logServerEvent({
      level: "error",
      event: "auth_event",
      message: "Firebase Admin auth subpackage failed to load; session cookies unavailable.",
      metadata: {
        code: "firebase_admin_auth_load_failure",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

export async function createFirebaseAdminFirestore(): Promise<Firestore | null> {
  const app = await createFirebaseAdminApp();

  if (!app) {
    return null;
  }

  try {
    const { getFirestore } = await import("firebase-admin/firestore");
    return getFirestore(app);
  } catch (error) {
    // Same rationale as createFirebaseAdminAuth: surface a masked load failure
    // of the firestore subpackage instead of silently returning null.
    logServerEvent({
      level: "error",
      event: "auth_event",
      message: "Firebase Admin firestore subpackage failed to load; server reads/writes unavailable.",
      metadata: {
        code: "firebase_admin_firestore_load_failure",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}
