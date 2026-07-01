import { NextResponse } from "next/server";
import {
  clearFirebaseSessionCookie,
  createFirebaseSessionCookie,
  setFirebaseSessionCookie,
} from "@/lib/firebase/session";
import { createFirebaseAdminAuth } from "@/lib/firebase/admin";
import { getFirebaseAdminEnv } from "@/lib/firebase/env";
import { ensureFirebaseUserProfile } from "@/lib/repositories/firebase-repository";

// Firebase Admin (firebase-admin/auth) requires the Node.js runtime; it cannot
// run in the Edge runtime and must not be bundled into middleware.
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// TEMPORARY DIAGNOSTIC — REMOVE BEFORE MERGE.
// The 500 response body below is temporarily made verbose (and value-free) to
// trace which step of the session-cookie flow fails on the deployed host, since
// Vercel's log UI is not surfacing our server-logger lines. It exposes ONLY:
// step name, error class name, and the Firebase error code (e.g.
// auth/argument-error) — never a message, token, key, email, or any value.
// Revert this route to the plain `firebase_admin_not_configured` response
// before this branch is merged.
// ---------------------------------------------------------------------------

type StepDiagnostic = {
  errorName: string;
  firebaseErrorCode: string | null;
};

function classifyError(error: unknown): StepDiagnostic {
  const candidate = error as { code?: unknown; errorInfo?: { code?: unknown } } | null;
  const code =
    (typeof candidate?.code === "string" && candidate.code) ||
    (typeof candidate?.errorInfo?.code === "string" && candidate.errorInfo.code) ||
    null;
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    firebaseErrorCode: code,
  };
}

function diagnosticResponse(
  diagnostic: Record<string, unknown>,
  idToken: string,
): NextResponse {
  const body = {
    error: {
      code: "firebase_admin_not_configured",
      message: "Firebase Admin is not configured for session cookies.",
    },
    // TEMPORARY value-free trace — remove before merge.
    diagnostic: {
      note: "TEMPORARY value-free diagnostic. Remove before merge. No values, tokens, or keys.",
      ...diagnostic,
    },
  };

  // Value-free invariant: never emit a known secret/token substring.
  const serialised = JSON.stringify(body);
  const secrets = [
    idToken,
    process.env.FIREBASE_PRIVATE_KEY,
    process.env.FIREBASE_CLIENT_EMAIL,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value));

  if (secrets.some((secret) => serialised.includes(secret))) {
    return NextResponse.json(
      {
        error: {
          code: "firebase_admin_not_configured",
          message: "Firebase Admin is not configured for session cookies.",
        },
        diagnostic: { note: "Diagnostic suppressed to avoid leaking a value." },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(body, { status: 500, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  const idToken = typeof body?.idToken === "string" ? body.idToken : null;

  if (!idToken) {
    return NextResponse.json(
      {
        error: {
          code: "firebase_id_token_required",
          message: "Firebase sign-in token is required.",
        },
      },
      { status: 400 },
    );
  }

  const diagnostic: Record<string, unknown> = {};

  // Step 1: acquire Admin Auth via the real helper — record null vs threw.
  let auth: Awaited<ReturnType<typeof createFirebaseAdminAuth>> = null;
  try {
    auth = await createFirebaseAdminAuth();
    diagnostic.createFirebaseAdminAuthThrew = false;
    diagnostic.createFirebaseAdminAuthReturnedNull = auth === null;
  } catch (error) {
    diagnostic.step = "createFirebaseAdminAuth";
    diagnostic.createFirebaseAdminAuthThrew = true;
    Object.assign(diagnostic, classifyError(error));
    return diagnosticResponse(diagnostic, idToken);
  }

  // If the helper swallowed an error and returned null, re-run the low-level
  // path to capture WHERE it fails: app import, auth import (jose/ESM bundling),
  // or getAuth. This is the prime suspect when standalone app-init "works" but
  // the session route does not, because the diagnostic endpoint never imported
  // firebase-admin/auth.
  if (auth === null) {
    try {
      const env = getFirebaseAdminEnv();
      diagnostic.adminEnvResolves = Boolean(env);

      if (env) {
        const { cert, getApps, initializeApp } = await import("firebase-admin/app");
        diagnostic.adminAppImportOk = true;
        const app = getApps().length
          ? getApps()[0]
          : initializeApp({ credential: cert(env) });
        diagnostic.adminAppCount = getApps().length; // >1 hints at double-init
        const { getAuth } = await import("firebase-admin/auth");
        diagnostic.adminAuthImportOk = true;
        getAuth(app);
        diagnostic.getAuthOk = true;
        diagnostic.step = "createFirebaseAdminAuth_returned_null_but_probe_succeeded";
      } else {
        diagnostic.step = "getFirebaseAdminEnv_null";
      }
    } catch (error) {
      diagnostic.step = "adminAuthProbe";
      Object.assign(diagnostic, classifyError(error));
    }
    return diagnosticResponse(diagnostic, idToken);
  }

  // Step 2: create the session cookie — capture throw vs null distinctly. This
  // is where an ID-token/Admin project mismatch (aud vs credential project) or a
  // disabled Identity Toolkit / IAM Service Account Credentials API surfaces.
  let sessionCookie: string | null = null;
  try {
    sessionCookie = await createFirebaseSessionCookie(idToken);
    diagnostic.createSessionCookieReturnedNull = sessionCookie === null;
  } catch (error) {
    diagnostic.step = "createSessionCookie";
    Object.assign(diagnostic, classifyError(error));
    return diagnosticResponse(diagnostic, idToken);
  }

  if (!sessionCookie) {
    diagnostic.step = "createSessionCookie_returned_null";
    return diagnosticResponse(diagnostic, idToken);
  }

  // Step 3: verify the ID token (also surfaces project/aud mismatch).
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch (error) {
    diagnostic.step = "verifyIdToken";
    Object.assign(diagnostic, classifyError(error));
    return diagnosticResponse(diagnostic, idToken);
  }

  // Step 4: upsert the user profile (Firestore write path).
  try {
    await ensureFirebaseUserProfile({
      id: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
    });
  } catch (error) {
    diagnostic.step = "ensureFirebaseUserProfile";
    Object.assign(diagnostic, classifyError(error));
    return diagnosticResponse(diagnostic, idToken);
  }

  await setFirebaseSessionCookie(sessionCookie);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearFirebaseSessionCookie();

  return NextResponse.json({ ok: true });
}
