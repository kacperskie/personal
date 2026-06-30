"use server";

import { redirect } from "next/navigation";
import { getBackendProvider } from "@/lib/backend/provider";
import { clearFirebaseSessionCookie } from "@/lib/firebase/session";

export async function signOutAction() {
  if (getBackendProvider() === "firebase") {
    await clearFirebaseSessionCookie();
  }

  redirect("/sign-in");
}
