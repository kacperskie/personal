"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = {
  message: null,
};

export function SignInForm({ supabaseConfigured }: { supabaseConfigured: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initialState);

  if (!supabaseConfigured) {
    return (
      <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <p className="text-sm text-ink/70">
          Supabase is not configured, so the app is running in mock local mode and no
          sign-in is required.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-lg border border-line bg-white p-5 shadow-panel">
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
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-teal"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="submit"
            name="mode"
            value="password"
            disabled={pending}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Sign in
          </button>
          <button
            type="submit"
            name="mode"
            value="magic-link"
            disabled={pending}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
          >
            Send magic link
          </button>
        </div>
        {state.message ? <p className="text-sm text-berry">{state.message}</p> : null}
      </div>
    </form>
  );
}
