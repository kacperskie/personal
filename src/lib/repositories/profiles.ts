import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function ensureUserProfile(user: User) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const displayName =
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "Personal Finance HQ user";

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        user_id: user.id,
        display_name: displayName,
        locale: "en-GB",
        currency: "GBP",
        payday_day_of_month: 25,
        minimum_buffer: 350,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
