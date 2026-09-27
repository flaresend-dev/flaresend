import type { Attachment, SendEmailInput } from "@flaresend/types";

/** A send input with no template. `template` and `data` are not allowed. */
export type PlainSendInput = Omit<SendEmailInput, "template" | "data"> & { template?: undefined; data?: undefined };

/**
 * Typed send input for Git templates.
 *
 * ```ts
 * import type { TemplateData } from "@flaresend/templates"; // { welcome: { name: string; ... }, ... }
 * await mail.emails.send<TemplateData>({ to, template: "welcome", data: { name: "Ada", ... } });
 * ```
 *
 * For each key K of `TemplateMap`, `template: K` requires `data: TemplateMap[K]`.
 * A send without a template is still allowed.
 */
export type TypedSend<TemplateMap extends object> =
  | {
      [K in keyof TemplateMap & string]: Omit<SendEmailInput, "template" | "data"> & {
        template: K;
        data: TemplateMap[K];
      };
    }[keyof TemplateMap & string]
  | PlainSendInput;

export interface SendOptions {
  /** Sent as the `Idempotency-Key` header (HTTP) or merged into `input.idempotencyKey` (RPC). */
  idempotencyKey?: string;
}

const CHUNK = 0x8000;

/** Base64-encode bytes without Buffer, so it works in Workers, browsers and Node. */
export function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

/** Build an attachment from raw bytes. `content` is base64, as the API requires. */
export function attachmentFromBytes(filename: string, bytes: ArrayBuffer | Uint8Array, type?: string): Attachment {
  return {
    filename,
    content: bytesToBase64(bytes),
    ...(type ? { type } : {}),
    disposition: "attachment",
  };
}
