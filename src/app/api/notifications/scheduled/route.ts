import { NextResponse } from "next/server";
import { runScheduledNotificationGeneration } from "@/lib/notifications/scheduled-alerts";

function requestCronSecret(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

export function isScheduledNotificationRequestAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = requestCronSecret(request);

  return Boolean(expected && provided && provided === expected);
}

export async function GET(request: Request) {
  if (!isScheduledNotificationRequestAuthorized(request)) {
    return NextResponse.json(
      {
        error: {
          code: "cron_secret_invalid",
          message: "Scheduled notifications are not authorised.",
        },
      },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const asOfDate = url.searchParams.get("asOfDate") ?? "2026-06-30";
  const result = await runScheduledNotificationGeneration(asOfDate);

  return NextResponse.json(result);
}

export const POST = GET;
