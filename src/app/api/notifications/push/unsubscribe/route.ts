import { NextResponse } from "next/server";
import { deletePushSubscriptionByEndpoint } from "@/lib/notifications/push-subscriptions";
import {
  requireAuthenticatedRouteUser,
  unauthenticatedResponse,
} from "@/lib/server/route-auth";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedRouteUser();

  if (!auth) {
    return unauthenticatedResponse();
  }

  try {
    const body = (await request.json()) as { endpoint?: string };

    if (!body.endpoint) {
      return NextResponse.json(
        {
          error: {
            code: "push_endpoint_required",
            message: "A push subscription endpoint is required.",
          },
        },
        { status: 400 },
      );
    }

    const result = await deletePushSubscriptionByEndpoint(body.endpoint);

    return NextResponse.json({
      id: result.id,
      status: "revoked",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "push_unsubscribe_failed",
          message: "Push subscription could not be removed.",
        },
      },
      { status: 500 },
    );
  }
}
