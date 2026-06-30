import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getBackendProvider } from "@/lib/backend/provider";
import { isFirebaseConfigured } from "@/lib/firebase/env";
import { FirebaseSignInForm } from "./firebase-sign-in-form";

export default function SignInPage() {
  const backendProvider = getBackendProvider();
  const firebaseConfigured = isFirebaseConfigured();
  const isFirebase = backendProvider === "firebase";

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <PageHeader
        eyebrow="Authentication"
        title="Sign in"
        description={
          isFirebase
            ? "Firebase authentication is used when Firebase is configured."
            : "Mock mode is active (BACKEND_PROVIDER=mock); no sign-in is required."
        }
      />
      {isFirebase ? (
        <FirebaseSignInForm firebaseConfigured={firebaseConfigured} />
      ) : (
        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <p className="text-sm text-ink/70">
            This deployment is running in mock/demo mode, so no account is needed.
            Set <code className="font-mono text-xs">BACKEND_PROVIDER=firebase</code> with
            Firebase configured to enable real authentication.
          </p>
        </div>
      )}
      {isFirebase && !firebaseConfigured ? (
        <Link className="inline-flex text-sm font-semibold text-teal" href="/">
          Continue to mock dashboard
        </Link>
      ) : null}
      {!isFirebase ? (
        <Link className="inline-flex text-sm font-semibold text-teal" href="/">
          Continue to mock dashboard
        </Link>
      ) : null}
    </div>
  );
}
