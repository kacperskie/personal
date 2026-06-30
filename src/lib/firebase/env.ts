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
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

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
