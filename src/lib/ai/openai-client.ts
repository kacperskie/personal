import "server-only";

import type { AIMoneyCoachResponse } from "@/lib/domain";
import { limitContextSize } from "@/lib/ai/redaction";
import {
  buildMoneyCoachSystemPrompt,
  moneyCoachResponseJsonSchema,
  parseMoneyCoachResponse,
} from "@/lib/ai/prompts";

export type OpenAIClientConfig = {
  configured: boolean;
  model: string;
  missing: string[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

export function getOpenAIClientConfig(env: NodeJS.ProcessEnv = process.env): OpenAIClientConfig {
  const missing = ["OPENAI_API_KEY"].filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    missing,
  };
}

function extractResponseText(payload: OpenAIResponsePayload) {
  if (payload.output_text) {
    return payload.output_text;
  }

  const textParts =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text" || content.text)
      .map((content) => content.text)
      .filter(Boolean) ?? [];

  return textParts.join("\n");
}

export async function createStructuredMoneyCoachResponse({
  question,
  context,
  fallbackDataUsed,
  signal,
}: {
  question: string;
  context: unknown;
  fallbackDataUsed: AIMoneyCoachResponse["dataUsed"];
  signal?: AbortSignal;
}) {
  const config = getOpenAIClientConfig();

  if (!config.configured) {
    throw new Error(`OpenAI is not configured: ${config.missing.join(", ")}`);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  if (process.env.OPENAI_ORG_ID) {
    headers["OpenAI-Organization"] = process.env.OPENAI_ORG_ID;
  }

  if (process.env.OPENAI_PROJECT_ID) {
    headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: buildMoneyCoachSystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify(limitContextSize({ question, context })),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "money_coach_response",
          strict: true,
          schema: moneyCoachResponseJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenAIResponsePayload;
  const responseText = extractResponseText(payload);

  if (!responseText) {
    throw new Error("OpenAI response did not include output text.");
  }

  return parseMoneyCoachResponse(responseText, fallbackDataUsed);
}
