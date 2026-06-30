"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const env = getSupabaseBrowserEnv();

  if (!env) {
    return null;
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
