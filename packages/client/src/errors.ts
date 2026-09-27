import { ERROR_STATUS, FlaresendError } from "@flaresend/types";
import type { ApiErrorShape, ErrorType } from "@flaresend/types";

export { FlaresendError, ERROR_STATUS };
export type { ApiErrorShape, ErrorType };

function isErrorShape(v: unknown): v is ApiErrorShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.type === "string" &&
    Object.prototype.hasOwnProperty.call(ERROR_STATUS, o.type) &&
    typeof o.code === "string" &&
    typeof o.message === "string" &&
    (o.param === undefined || typeof o.param === "string")
  );
}

/**
 * Build a FlaresendError from a non-2xx response body.
 * `{ error: { type, code, message, param? } }` keeps its fields; anything else becomes
 * `internal_error` / `http_<status>`. The HTTP status is always the response status.
 */
export function errorFromBody(status: number, bodyText: string): FlaresendError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = undefined;
  }
  const shape = parsed && typeof parsed === "object" ? (parsed as { error?: unknown }).error : undefined;
  if (isErrorShape(shape)) {
    return new FlaresendError({
      type: shape.type,
      code: shape.code,
      message: shape.message,
      ...(shape.param !== undefined ? { param: shape.param } : {}),
      status,
    });
  }
  const snippet = bodyText.trim().slice(0, 200);
  return new FlaresendError({
    type: "internal_error",
    code: `http_${status}`,
    message: snippet ? `HTTP ${status}: ${snippet}` : `HTTP ${status}`,
    status,
  });
}

export function networkError(cause: unknown): FlaresendError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const err = new FlaresendError({
    type: "internal_error",
    code: "network_error",
    message: `network error: ${detail}`,
    status: 0,
  });
  err.cause = cause;
  return err;
}
