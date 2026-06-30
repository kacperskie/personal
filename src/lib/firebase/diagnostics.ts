/**
 * Safe, value-free diagnostics for the public Firebase web app configuration.
 *
 * Reports only whether each `NEXT_PUBLIC_FIREBASE_*` variable is present. It never
 * returns or logs the actual config values, and it never touches Firebase Admin
 * or the private key. Safe to render in server components (e.g. /sign-in and
 * /settings/system-readiness).
 */

export type FirebasePublicConfigDiagnostic = {
  name: string;
  present: boolean;
};

const PUBLIC_FIREBASE_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export function getFirebasePublicConfigDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): FirebasePublicConfigDiagnostic[] {
  return PUBLIC_FIREBASE_KEYS.map((name) => ({
    name,
    present: Boolean(env[name]),
  }));
}

/**
 * True when all required public Firebase keys are present. Storage bucket and
 * messaging sender id are optional for Auth and excluded from the requirement.
 */
export function isFirebasePublicConfigComplete(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}
