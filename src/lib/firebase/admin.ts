import "server-only";

import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminEnv } from "@/lib/firebase/env";

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
  } catch {
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
  } catch {
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
  } catch {
    return null;
  }
}
