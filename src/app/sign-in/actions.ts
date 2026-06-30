"use server";

import { redirect } from "next/navigation";
import { ensureUserProfile } from "@/lib/repositories/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = {
  message: string | null;
};

export async function signInAction(
  _state: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "password");

  if (!email) {
    return { message: "Enter an email address." };
  }

  if (mode === "magic-link") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/`,
      },
    });

    if (error) {
      return { message: error.message };
    }

    return { message: "Magic link requested. Check your email." };
  }

  if (!password) {
    return { message: "Enter a password or choose magic link." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { message: error.message };
  }

  if (data.user) {
    await ensureUserProfile(data.user);
  }

  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/sign-in");
}
