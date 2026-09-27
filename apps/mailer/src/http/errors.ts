import { FlaresendError, encodeRpcError, type ErrorType } from "@flaresend/types";
import type { ZodError } from "zod";

/** The only error type thrown out of core code. Maps 1:1 to the HTTP error body. */
export class ApiError extends FlaresendError {
  constructor(type: ErrorType, code: string, message: string, param?: string) {
    super({ type, code, message, param });
    this.name = "ApiError";
  }

  static validation(code: string, message: string, param?: string) {
    return new ApiError("validation_error", code, message, param);
  }
  static auth(code: string, message: string) {
    return new ApiError("authentication_error", code, message);
  }
  static permission(code: string, message: string, param?: string) {
    return new ApiError("permission_error", code, message, param);
  }
  static notFound(code: string, message: string, param?: string) {
    return new ApiError("not_found", code, message, param);
  }
  static conflict(code: string, message: string, param?: string) {
    return new ApiError("conflict", code, message, param);
  }
  static unprocessable(code: string, message: string, param?: string) {
    return new ApiError("unprocessable", code, message, param);
  }
  static rateLimited(code: string, message: string) {
    return new ApiError("rate_limit_error", code, message);
  }
  static internal(message = "internal error", code = "internal") {
    return new ApiError("internal_error", code, message);
  }

  static fromZod(err: ZodError, code = "invalid_body"): ApiError {
    const issue = err.issues[0];
    const path = issue?.path.join(".");
    const message = issue ? (path ? `${path}: ${issue.message}` : issue.message) : "invalid request";
    return new ApiError("validation_error", code, message, path || undefined);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof FlaresendError) return new ApiError(err.type, err.code, err.message, err.param);
  return ApiError.internal();
}

export function errorBody(err: FlaresendError) {
  return { error: err.toJSON() };
}

/**
 * RPC: custom Error properties do not survive the service binding, so the error shape is
 * encoded into the message. @flaresend/client decodes it back into a FlaresendError.
 */
export function toRpcError(err: unknown): Error {
  const api = toApiError(err);
  if (api.type === "internal_error" && !(err instanceof FlaresendError)) console.error("rpc internal error", err);
  const e = new Error(encodeRpcError(api.toJSON()));
  e.name = "FlaresendError";
  return e;
}
