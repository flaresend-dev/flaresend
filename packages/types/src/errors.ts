import { z } from "zod";

export const ErrorType = z.enum([
  "validation_error",
  "authentication_error",
  "permission_error",
  "not_found",
  "conflict",
  "unprocessable",
  "rate_limit_error",
  "internal_error",
]);
export type ErrorType = z.infer<typeof ErrorType>;

export const ApiErrorShape = z.object({
  type: ErrorType,
  code: z.string(),
  message: z.string(),
  param: z.string().optional(),
});
export type ApiErrorShape = z.infer<typeof ApiErrorShape>;

export const ApiErrorResponse = z.object({ error: ApiErrorShape });
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;

export const ERROR_STATUS: Record<ErrorType, number> = {
  validation_error: 400,
  authentication_error: 401,
  permission_error: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limit_error: 429,
  internal_error: 500,
};

/** Thrown by both the HTTP client and the RPC client, and by the mailer itself. */
export class FlaresendError extends Error {
  readonly type: ErrorType;
  readonly code: string;
  readonly param?: string;
  readonly status: number;

  constructor(shape: ApiErrorShape & { status?: number }) {
    super(shape.message);
    this.name = "FlaresendError";
    this.type = shape.type;
    this.code = shape.code;
    this.param = shape.param;
    this.status = shape.status ?? ERROR_STATUS[shape.type] ?? 500;
  }

  toJSON(): ApiErrorShape {
    return { type: this.type, code: this.code, message: this.message, ...(this.param ? { param: this.param } : {}) };
  }
}

/**
 * RPC errors lose their class across the service binding; only the message survives.
 * The mailer encodes the error shape into the message with this prefix so clients can rebuild it.
 */
export const RPC_ERROR_PREFIX = "FLARESEND_ERROR:";

export function encodeRpcError(e: ApiErrorShape): string {
  return RPC_ERROR_PREFIX + JSON.stringify(e);
}

export function decodeRpcError(err: unknown): FlaresendError | null {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : null;
  if (!msg) return null;
  const i = msg.indexOf(RPC_ERROR_PREFIX);
  if (i === -1) return null;
  try {
    const parsed = ApiErrorShape.safeParse(JSON.parse(msg.slice(i + RPC_ERROR_PREFIX.length)));
    return parsed.success ? new FlaresendError(parsed.data) : null;
  } catch {
    return null;
  }
}
