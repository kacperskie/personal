export type BackendProvider = "firebase" | "mock";

export const supportedBackendProviders: BackendProvider[] = ["firebase", "mock"];

/**
 * v2 backend selection. The primary user-facing paths are:
 * - `firebase`: the deployed default (Firebase Auth + Firestore + Admin SDK).
 * - `mock`: local/demo fallback with no backend.
 *
 * Supabase has been removed from the primary path. `BACKEND_PROVIDER=supabase`
 * (or any unknown value) resolves to `mock` so the app degrades safely rather
 * than failing. Legacy Supabase repository branches remain only as dead code on
 * the mock fallback and are never selected when Supabase env vars are unset.
 */
export function getBackendProvider(
  env: NodeJS.ProcessEnv = process.env,
): BackendProvider {
  const configured = env.BACKEND_PROVIDER;

  if (configured === "firebase") {
    return "firebase";
  }

  if (configured === "mock") {
    return "mock";
  }

  // Auto-detect Firebase from public web config when no explicit selection.
  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    return "firebase";
  }

  return "mock";
}

export function isFirebaseBackend(env: NodeJS.ProcessEnv = process.env) {
  return getBackendProvider(env) === "firebase";
}

export function isMockBackend(env: NodeJS.ProcessEnv = process.env) {
  return getBackendProvider(env) === "mock";
}
