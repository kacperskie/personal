import { signOutAction } from "@/app/sign-in/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/70"
      >
        Sign out
      </button>
    </form>
  );
}
