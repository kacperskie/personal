import { type NextRequest, NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/repositories/profiles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data.user) {
      await ensureUserProfile(data.user);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
