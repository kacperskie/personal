import { NextResponse } from "next/server";
import { getBackendProvider } from "@/lib/backend/provider";
import { getFirebaseSessionUser } from "@/lib/firebase/session";

export type AuthenticatedRouteUser = {
  user: {
    id: string;
    email: string | null;
    user_metadata: { display_name: string | null };
  };
};

/**
 * Resolve the authenticated user for API routes. Firebase is the only primary
 * auth backend; mock mode has no authenticated user (protected API routes are
 * not part of the mock demo path).
 */
export async function requireAuthenticatedRouteUser(): Promise<AuthenticatedRouteUser | null> {
  if (getBackendProvider() !== "firebase") {
    return null;
  }

  const user = await getFirebaseSessionUser();

  if (!user) {
    return null;
  }

  return {
    user: {
      id: user.uid,
      email: user.email ?? null,
      user_metadata: {
        display_name: user.name ?? null,
      },
    },
  };
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
