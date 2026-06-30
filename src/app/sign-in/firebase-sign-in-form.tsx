"use client";

import { useState, useTransition } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { createFirebaseBrowserAuth } from "@/lib/firebase/client";

export function FirebaseSignInForm({ firebaseConfigured }: { firebaseConfigured: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!firebaseConfigured) {
    return (
      <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-ink/70">
          Firebase is selected but not configured. Add Firebase web app values to enable
          email/password sign-in, or switch to mock backend mode for local development.
        </p>
      </div>
    );
  }

  async function submit(formData: FormData) {
    const auth = createFirebaseBrowserAuth();
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const mode = String(formData.get("mode") ?? "sign-in");

    if (!auth) {
      setMessage("Firebase is not configured in this browser build.");
      return;
    }

    if (!email || !password) {
      setMessage("Enter an email address and password.");
      return;
    }

    const credential =
      mode === "create-account"
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
    const idToken = await credential.user.getIdToken();
    const response = await fetch("/api/auth/firebase-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      throw new Error(payload?.error?.message ?? "Firebase session could not be created.");
    }

    window.location.assign("/");
  }

  return (
    <form
      action={(formData) => {
        setMessage(null);
        startTransition(() => {
          void submit(formData).catch((error: Error) => setMessage(error.message));
        });
      }}
      className="rounded-lg border border-line bg-white p-5 shadow-panel"
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-ink/70">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-teal"
          />
        </label>
        <label className="block text-sm font-medium text-ink/70">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-teal"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="submit"
            name="mode"
            value="sign-in"
            disabled={isPending}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Sign in
          </button>
          <button
            type="submit"
            name="mode"
            value="create-account"
            disabled={isPending}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
          >
            Create account
          </button>
        </div>
        {message ? <p className="text-sm text-berry">{message}</p> : null}
      </div>
    </form>
  );
}
