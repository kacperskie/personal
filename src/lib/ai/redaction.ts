const sensitiveKeyPattern =
  /(token|secret|password|credential|authorization|access|refresh|private|jwks|iban|pan|accountnumber|account_number|provideraccountid|provider_account_id|providerconnectionid|provider_connection_id|connectionid|connection_id|userid|user_id|raw_payload)/i;

function maskString(value: string) {
  const withoutLongNumbers = value.replace(/\b\d{6,}\b/g, "[redacted-number]");
  const withoutEmails = withoutLongNumbers.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted-email]",
  );
  return withoutEmails.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted-id]");
}

export function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return maskString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : redactSensitiveValue(nestedValue),
    ]),
  );
}

export function redactFinanceContext<T>(context: T): T {
  return redactSensitiveValue(context) as T;
}

export function summariseRedactedContext(context: unknown) {
  const redacted = redactSensitiveValue(context);
  const serialised = JSON.stringify(redacted);
  return serialised.length <= 1800 ? serialised : `${serialised.slice(0, 1800)}...`;
}

export function limitContextSize(context: unknown, maxCharacters = 18_000) {
  const serialised = JSON.stringify(redactSensitiveValue(context));

  if (serialised.length <= maxCharacters) {
    return JSON.parse(serialised) as unknown;
  }

  return {
    truncated: true,
    maxCharacters,
    contextPreview: serialised.slice(0, maxCharacters),
  };
}
