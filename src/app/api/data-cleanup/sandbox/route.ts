import { NextResponse } from "next/server";
import { runSandboxCleanup } from "@/lib/repositories/sandbox-cleanup";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Deletes only the signed-in user's sandbox/mock records via Firebase Admin.
export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  const counts = await runSandboxCleanup(auth.user.id);

  return NextResponse.json({
    ok: true,
    removed: counts,
    message: `Removed sandbox/mock data: ${counts.connections} connections, ${counts.accounts} accounts, ${counts.transactions} transactions, ${counts.providerTokens} tokens, ${counts.syncRuns} sync runs.`,
  });
}
