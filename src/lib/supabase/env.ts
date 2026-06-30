/**
 * @deprecated Supabase has been removed from the primary path in v2.
 *
 * These helpers are retained only so legacy call sites keep compiling while the
 * remaining Supabase repository branches are removed in a later stage. They are
 * hard-disabled: Supabase is never configured or selected, so the app always
 * uses Firebase or mock. Do not reintroduce Supabase selection here.
 */

export function isSupabaseConfigured(): boolean {
  return false;
}

export function getSupabaseBrowserEnv(): { url: string; anonKey: string } | null {
  return null;
}

export function getSupabaseServiceRoleEnv(): {
  url: string;
  serviceRoleKey: string;
} | null {
  return null;
}
