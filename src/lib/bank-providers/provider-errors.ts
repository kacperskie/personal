export type ProviderErrorCode =
  | "provider_not_configured"
  | "provider_callback_failed"
  | "provider_sync_failed"
  | "provider_revoke_failed"
  | "provider_not_supported"
  | "provider_auth_required";

export class ProviderSafeError extends Error {
  code: ProviderErrorCode;
  status: number;
  userMessage: string;
  /**
   * Optional machine-readable, non-secret reason for the failure (e.g.
   * "truelayer_scope_or_permission_denied"). Used for safe diagnostics/tests and
   * surfaced to the UI to distinguish token problems from provider access denial.
   */
  safeReason?: string;

  constructor(
    code: ProviderErrorCode,
    userMessage: string,
    status = 400,
    safeReason?: string,
  ) {
    super(userMessage);
    this.name = "ProviderSafeError";
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.safeReason = safeReason;
  }
}

export function toProviderSafeError(error: unknown, fallbackCode: ProviderErrorCode) {
  if (error instanceof ProviderSafeError) {
    return error;
  }

  return new ProviderSafeError(
    fallbackCode,
    "The provider request could not be completed. No credentials or tokens were exposed.",
    500,
  );
}

export function createSafeErrorPayload(error: unknown, fallbackCode: ProviderErrorCode) {
  const safeError = toProviderSafeError(error, fallbackCode);

  return {
    error: {
      code: safeError.code,
      message: safeError.userMessage,
    },
  };
}
