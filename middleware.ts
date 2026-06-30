import { type NextRequest, NextResponse } from "next/server";
import { getBackendProvider } from "@/lib/backend/provider";
import { firebaseSessionCookieName } from "@/lib/firebase/constants";

const publicRoutes = ["/sign-in", "/api/auth/firebase-session"];

export async function middleware(request: NextRequest) {
  const backendProvider = getBackendProvider();

  // Mock mode is open; no authentication is required for the demo workspace.
  if (backendProvider === "mock") {
    return NextResponse.next();
  }

  if (publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Firebase: require a session cookie, otherwise redirect to sign-in.
  if (request.cookies.has(firebaseSessionCookieName)) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/sign-in";
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
