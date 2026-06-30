import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  const supabaseConfigured = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <PageHeader
        eyebrow="Authentication"
        title="Sign in"
        description="Use Supabase email/password or magic-link compatible authentication when Supabase is configured."
      />
      <SignInForm supabaseConfigured={supabaseConfigured} />
      {!supabaseConfigured ? (
        <Link className="inline-flex text-sm font-semibold text-teal" href="/">
          Continue to mock dashboard
        </Link>
      ) : null}
    </div>
  );
}
