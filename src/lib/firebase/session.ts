import "server-only";

import { cookies } from "next/headers";
import { createFirebaseAdminAuth } from "@/lib/firebase/admin";
import { firebaseSessionCookieName } from "@/lib/firebase/constants";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 5;

export async function createFirebaseSessionCookie(idToken: string) {
  const auth = createFirebaseAdminAuth();

  if (!auth) {
    return null;
  }

  return auth.createSessionCookie(idToken, {
    expiresIn: sessionMaxAgeSeconds * 1000,
  });
}

export async function getFirebaseSessionUser() {
  const auth = createFirebaseAdminAuth();

  if (!auth) {
    return null;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(firebaseSessionCookieName)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    return await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

export async function setFirebaseSessionCookie(sessionCookie: string) {
  const cookieStore = await cookies();

  cookieStore.set(firebaseSessionCookieName, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: sessionMaxAgeSeconds,
    path: "/",
  });
}

export async function clearFirebaseSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(firebaseSessionCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
