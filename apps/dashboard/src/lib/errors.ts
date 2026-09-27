import { decodeRpcError } from "@flaresend/types";

export interface UiError {
  code: string;
  message: string;
  param?: string;
}

/**
 * Turns anything thrown by a mailer call into `{ code, message }` for display.
 * Errors from the MAILER_ADMIN binding carry an encoded FlaresendError in their message (decodeRpcError).
 * Anything else (binding missing, network, bugs) becomes `internal_error`.
 */
export function toUiError(err: unknown): UiError {
  const fe = decodeRpcError(err);
  if (fe) return { code: fe.code, message: fe.message, ...(fe.param ? { param: fe.param } : {}) };
  if (err instanceof Error) return { code: "internal_error", message: err.message || err.name };
  return { code: "internal_error", message: typeof err === "string" ? err : "unknown error" };
}

export function formatUiError(e: UiError): string {
  return `${e.code}: ${e.message}${e.param ? ` (${e.param})` : ""}`;
}
