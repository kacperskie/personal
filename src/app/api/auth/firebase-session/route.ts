import { NextResponse } from "next/server";
import {
  clearFirebaseSessionCookie,
  createFirebaseSessionCookie,
  setFirebaseSessionCookie,
} from "@/lib/firebase/session";
import { createFirebaseAdminAuth } from "@/lib/firebase/admin";
import { ensureFirebaseUserProfile } from "@/lib/repositories/firebase-repository";

// Firebase Admin (firebase-admin/auth) requires the Node.js runtime; it cannot
// run in the Edge runtime and must not be bundled into middleware.
export const runtime = "nodejs";

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

  const auth = await createFirebaseAdminAuth();
  const sessionCookie = await createFirebaseSessionCookie(idToken);

  if (!sessionCookie || !auth) {
    return NextResponse.json(
      {
        error: {
          code: "firebase_admin_not_configured",
          message: "Firebase Admin is not configured for session cookies.",
        },
      },
      { status: 500 },
    );
  }

  const decoded = await auth.verifyIdToken(idToken);
  await ensureFirebaseUserProfile({
    id: decoded.uid,
    email: decoded.email,
    displayName: decoded.name,
  });
  await setFirebaseSessionCookie(sessionCookie);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearFirebaseSessionCookie();

  return NextResponse.json({ ok: true });
}
