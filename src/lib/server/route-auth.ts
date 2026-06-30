import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAuthenticatedRouteUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { supabase, user };
}

export function unauthenticatedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "provider_auth_required",
        message: "Sign in is required before connecting accounts.",
      },
    },
    { status: 401 },
  );
}
