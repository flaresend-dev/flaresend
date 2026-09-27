import { decodeRpcError } from "@flaresend/types";
import type {
  BatchResult,
  EmailRecord,
  ListEmailsQuery,
  ListResponse,
  SendEmailInput,
  SendEmailResult,
} from "@flaresend/types";
import type { SendOptions, TypedSend } from "./shared";

export { FlaresendError } from "./errors";
export { attachmentFromBytes } from "./shared";
export type { TypedSend, SendOptions } from "./shared";

/**
 * The methods of the mailer's `MailerRpc` WorkerEntrypoint, as seen through a service binding.
 * Bind it in wrangler with `{ "binding": "MAILER", "service": "flaresend", "entrypoint": "MailerRpc" }`.
 */
export interface MailerRpcBinding {
  send(project: string, input: SendEmailInput): Promise<SendEmailResult>;
  sendBatch(project: string, inputs: SendEmailInput[]): Promise<BatchResult>;
  get(project: string, emailId: string): Promise<EmailRecord | null>;
  list(project: string, query: ListEmailsQuery): Promise<ListResponse<EmailRecord>>;
  cancel(project: string, emailId: string): Promise<{ id: string; status: "canceled" }>;
}

export interface RpcSend {
  (input: SendEmailInput, opts?: SendOptions): Promise<SendEmailResult>;
  <TemplateMap extends object>(input: TypedSend<TemplateMap>, opts?: SendOptions): Promise<SendEmailResult>;
}

export interface RpcClient {
  /** `opts.idempotencyKey` is merged into `input.idempotencyKey` (it wins if both are set). */
  send: RpcSend;
  /** Up to 100 inputs. Results come back in input order. */
  sendBatch(inputs: SendEmailInput[]): Promise<BatchResult>;
  /** Null when the email does not exist in this project. */
  get(emailId: string): Promise<EmailRecord | null>;
  list(query?: ListEmailsQuery): Promise<ListResponse<EmailRecord>>;
  /** Cancel a scheduled email. */
  cancel(emailId: string): Promise<{ id: string; status: "canceled" }>;
}

/** Errors cross the binding as plain Errors; rebuild the FlaresendError encoded in the message. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw decodeRpcError(e) ?? e;
  }
}

export function rpcClient(binding: MailerRpcBinding, opts: { project: string }): RpcClient {
  if (!binding) throw new TypeError("Flaresend: rpcClient needs a service binding (e.g. env.MAILER)");
  if (!opts?.project) throw new TypeError("Flaresend: rpcClient needs { project: <slug> }");
  const { project } = opts;

  const send = ((input: SendEmailInput, sendOpts?: SendOptions) => {
    const merged: SendEmailInput = sendOpts?.idempotencyKey ? { ...input, idempotencyKey: sendOpts.idempotencyKey } : input;
    return call(() => binding.send(project, merged));
  }) as RpcSend;

  return {
    send,
    sendBatch: (inputs) => call(() => binding.sendBatch(project, inputs)),
    get: (emailId) => call(() => binding.get(project, emailId)),
    list: (query = {}) => call(() => binding.list(project, query)),
    cancel: (emailId) => call(() => binding.cancel(project, emailId)),
  };
}
