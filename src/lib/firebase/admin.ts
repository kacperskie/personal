import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminEnv } from "@/lib/firebase/env";

export function createFirebaseAdminApp() {
  const env = getFirebaseAdminEnv();

  if (!env) {
    return null;
  }

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
}

export function createFirebaseAdminAuth() {
  const app = createFirebaseAdminApp();

  return app ? getAuth(app) : null;
}

export function createFirebaseAdminFirestore() {
  const app = createFirebaseAdminApp();

  return app ? getFirestore(app) : null;
}
