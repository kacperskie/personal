import { getBackendProvider } from "@/lib/backend/provider";

export type FirebaseBrowserEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

export type FirebaseAdminEnv = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Normalise a Firebase Admin private key supplied via an environment variable.
 * Netlify (and many CI systems) store the multi-line PEM as a single line with
 * escaped `\n` sequences, and the value is sometimes wrapped in surrounding
 * quotes. This strips a single layer of surrounding single/double quotes and
 * converts escaped newlines to real newlines. The key is never logged.
 */
export function normaliseFirebasePrivateKey(
  rawKey: string | undefined,
): string | undefined {
  if (!rawKey) {
    return undefined;
  }

  let key = rawKey.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, "\n");
}

/**
 * True when a private key value is present but does not look like a PEM block.
 * Used by readiness to report a malformed key without initialising Admin.
 */
export function isFirebasePrivateKeyMalformed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = normaliseFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY);

  if (!key) {
    return false;
  }

  return !key.includes("BEGIN PRIVATE KEY");
}

export function getFirebaseBrowserEnv(
  env: NodeJS.ProcessEnv = process.env,
): FirebaseBrowserEnv | null {
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}

export function getFirebaseAdminEnv(
  env: NodeJS.ProcessEnv = process.env,
): FirebaseAdminEnv | null {
  const projectId = env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normaliseFirebasePrivateKey(env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

export function isFirebaseConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(getFirebaseBrowserEnv(env));
}

export function isFirebaseAdminConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(getFirebaseAdminEnv(env));
}

export function isFirebaseBackendConfigured(env: NodeJS.ProcessEnv = process.env) {
  return getBackendProvider(env) === "firebase" && isFirebaseConfigured(env);
}
