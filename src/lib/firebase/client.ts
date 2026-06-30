"use client";

import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Client-only Firebase initialiser.
 *
 * IMPORTANT: each `process.env.NEXT_PUBLIC_FIREBASE_*` must be referenced as a
 * literal here. Next.js only inlines literal `process.env.NEXT_PUBLIC_X` token
 * sequences into the browser bundle; reading them through an aliased variable
 * (e.g. `const env = process.env; env.NEXT_PUBLIC_X`) is NOT inlined and reads as
 * `undefined` in the browser. That is why a server-side presence check can pass
 * while the browser reports "not configured". Keep the literal reads.
 */
function readFirebaseBrowserConfig(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket,
    messagingSenderId,
  };
}

export function createFirebaseBrowserApp(): FirebaseApp | null {
  const config = readFirebaseBrowserConfig();

  if (!config) {
    return null;
  }

  return getApps().length > 0 ? getApps()[0] : initializeApp(config);
}

export function createFirebaseBrowserAuth() {
  const app = createFirebaseBrowserApp();

  return app ? getAuth(app) : null;
}

export function createFirebaseBrowserFirestore() {
  const app = createFirebaseBrowserApp();

  return app ? getFirestore(app) : null;
}
