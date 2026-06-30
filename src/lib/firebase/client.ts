"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFirebaseBrowserEnv } from "@/lib/firebase/env";

export function createFirebaseBrowserApp(): FirebaseApp | null {
  const env = getFirebaseBrowserEnv();

  if (!env) {
    return null;
  }

  return getApps().length > 0 ? getApps()[0] : initializeApp(env);
}

export function createFirebaseBrowserAuth() {
  const app = createFirebaseBrowserApp();

  return app ? getAuth(app) : null;
}

export function createFirebaseBrowserFirestore() {
  const app = createFirebaseBrowserApp();

  return app ? getFirestore(app) : null;
}
