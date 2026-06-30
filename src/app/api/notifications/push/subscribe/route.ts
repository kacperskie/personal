import { NextResponse } from "next/server";
import { savePushSubscription } from "@/lib/notifications/push-subscriptions";
import { getClientWebPushConfig } from "@/lib/notifications/web-push";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

// Uses Firebase Admin/Firestore or session verification; force the Node.js runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  try {
    const body = (await request.json()) as {
      subscription?: {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      permission?: NotificationPermission | "unsupported";
      browser?: string;
    };
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const authKey = body.subscription?.keys?.auth;

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json(
        {
          error: {
            code: "push_subscription_invalid",
            message: "A complete browser push subscription is required.",
          },
        },
        { status: 400 },
      );
    }

    const record = await savePushSubscription({
      endpoint,
      keys: { p256dh, auth: authKey },
      browser: body.browser ?? "unknown browser",
      permission: body.permission ?? "default",
    });

    return NextResponse.json({
      id: record.id,
      endpointHash: record.endpointHash,
      status: record.status,
      permission: record.permission,
      webPush: getClientWebPushConfig(),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "push_subscription_failed",
          message: "Push subscription could not be saved.",
        },
      },
      { status: 500 },
    );
  }
}
