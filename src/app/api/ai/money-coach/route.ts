import { NextResponse } from "next/server";
import { answerMoneyCoachQuestion } from "@/lib/ai/money-coach";
import { validateMoneyCoachMode } from "@/lib/ai/guardrails";
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
    const body = (await request.json()) as {
      question?: unknown;
      mode?: unknown;
      depth?: unknown;
    };
    const question = String(body.question ?? "").trim();

    if (question.length < 3) {
      return NextResponse.json(
        {
          error: {
            code: "ai_question_required",
            message: "Ask a finance question before using the money coach.",
          },
        },
        { status: 400 },
      );
    }

    const result = await answerMoneyCoachQuestion({
      userId: auth.user.id,
      question: question.slice(0, 1000),
      mode: validateMoneyCoachMode(body.mode),
      depth: body.depth === "deep" ? "deep" : "summary",
    });

    return NextResponse.json({
      answer: result.response,
      model: result.model,
      usedOpenAI: result.usedOpenAI,
      insightId: result.insightId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "ai_money_coach_failed",
          message:
            error instanceof Error
              ? error.message
              : "The money coach could not answer safely.",
        },
      },
      { status: 500 },
    );
  }
}
