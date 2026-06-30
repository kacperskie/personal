import "server-only";

export type ServerLogEvent =
  | "auth_event"
  | "provider_sync_event"
  | "webhook_event"
  | "ai_request_failure"
  | "notification_delivery_failure"
  | "scheduled_job_failure";

export type ServerLogLevel = "info" | "warn" | "error";

const sensitiveKeyPattern =
  /(token|secret|password|credential|authorization|access|refresh|private|account_number|accountnumber|raw_payload|payload|openai|service_role|vapid|p256dh|auth)/i;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\b\d{6,}\b/g, "[redacted-number]").replace(/[A-Za-z0-9_-]{24,}/g, "[redacted-id]");
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : redactValue(nested),
    ]),
  );
}

export function createServerLogPayload({
  level,
  event,
  message,
  metadata = {},
}: {
  level: ServerLogLevel;
  event: ServerLogEvent;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    level,
    event,
    message,
    metadata: redactValue(metadata),
    timestamp: new Date().toISOString(),
  };
}

export function logServerEvent(input: {
  level: ServerLogLevel;
  event: ServerLogEvent;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const payload = createServerLogPayload(input);
  const line = JSON.stringify(payload);

  if (input.level === "error") {
    console.error(line);
  } else if (input.level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }

  return payload;
}
