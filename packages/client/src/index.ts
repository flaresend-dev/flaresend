import type {
  AnalyticsQuery,
  AnalyticsResult,
  ApiKeyRecord,
  AudienceRecord,
  BatchDryRunResult,
  BatchResult,
  BroadcastRecord,
  ContactInput,
  ContactRecord,
  CreateBroadcastInput,
  CreateTemplateInput,
  CreateWebhookInput,
  DomainRecord,
  EmailContent,
  EmailRecord,
  EventRecord,
  ListEmailsQuery,
  ListEventsQuery,
  ListResponse,
  MeRecord,
  RenderedTemplate,
  SendEmailInput,
  SendEmailResult,
  TemplateRecord,
  TemplateVersionRecord,
  UpdateBroadcastInput,
  UpdateContactInput,
  UpdateTemplateInput,
  UpdateWebhookInput,
  WebhookDeliveryRecord,
  WebhookRecord,
} from "@flaresend/types";
import { HttpClient, enc, newIdempotencyKey } from "./http";
import type { SendOptions, TypedSend } from "./shared";

export { FlaresendError, ERROR_STATUS } from "./errors";
export type { ApiErrorShape, ErrorType } from "./errors";
export { attachmentFromBytes, bytesToBase64 } from "./shared";
export type { TypedSend, PlainSendInput, SendOptions } from "./shared";
export { verifyWebhookSignature, signWebhookPayload, computeWebhookSignature } from "./webhooks";
export type {
  AnalyticsQuery,
  AnalyticsResult,
  ApiKeyRecord,
  Attachment,
  AttachmentInput,
  AudienceRecord,
  BatchDryRunResult,
  BatchItemResult,
  BatchResult,
  BroadcastRecord,
  ContactInput,
  ContactRecord,
  CreateBroadcastInput,
  CreateTemplateInput,
  CreateWebhookInput,
  DomainRecord,
  EmailContent,
  EmailRecord,
  EventRecord,
  ListEmailsQuery,
  ListEventsQuery,
  ListResponse,
  MeRecord,
  RenderedTemplate,
  SendEmailInput,
  SendEmailResult,
  TemplateRecord,
  TemplateVersionRecord,
  UpdateBroadcastInput,
  UpdateContactInput,
  UpdateTemplateInput,
  UpdateWebhookInput,
  WebhookDeliveryRecord,
  WebhookPayload,
  WebhookRecord,
} from "@flaresend/types";

export interface FlaresendOptions {
  /** Project API key, `fs_live_...` or `fs_test_...`. */
  apiKey: string;
  /** Where your mailer Worker is deployed, for example `https://mailer.yourdomain.com`. Required. */
  baseUrl: string;
  /** Custom fetch. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Retries on 429, 5xx and network errors. Default 2 (so 3 attempts in total). */
  maxRetries?: number;
  /** Replaces the timer used between retries. Meant for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

export interface SendBatchOptions extends SendOptions {
  /** Validate every item and report what would be sent, without sending. */
  dryRun?: boolean;
}

type Data<T> = { data: T[] };

export class Flaresend {
  private readonly http: HttpClient;

  constructor(opts: FlaresendOptions) {
    this.http = new HttpClient(opts);
  }

  /** `GET /v1/me`. Cheap connectivity and key check. */
  me(): Promise<MeRecord> {
    return this.http.request("GET", "/v1/me");
  }

  readonly emails = {
    /**
     * `POST /v1/emails`. Retried on 429/5xx/network errors. Every call carries an idempotency key, so a
     * retry never sends twice: `opts.idempotencyKey`, else `input.idempotencyKey`, else a random one made
     * for this call. Pass your own key to dedupe across calls (for example `welcome-${user.id}`).
     *
     * Pass a template map as the type argument to type-check `data`:
     * `mail.emails.send<MyTemplates>({ template: "welcome", data: { ... }, to })`.
     */
    send: ((input: SendEmailInput, opts?: SendOptions): Promise<SendEmailResult> => {
      const idempotencyKey = opts?.idempotencyKey ?? input.idempotencyKey ?? newIdempotencyKey();
      return this.http.request("POST", "/v1/emails", { body: input, idempotencyKey });
    }) as {
      (input: SendEmailInput, opts?: SendOptions): Promise<SendEmailResult>;
      <TemplateMap extends object>(input: TypedSend<TemplateMap>, opts?: SendOptions): Promise<SendEmailResult>;
    },

    /**
     * `POST /v1/emails/batch` (≤ 100 inputs). Results come back in input order. Like `send`, a random
     * batch key is made for the call when `opts.idempotencyKey` is not set, so retries are safe.
     */
    sendBatch: ((inputs: SendEmailInput[], opts?: SendBatchOptions): Promise<BatchResult | BatchDryRunResult> => {
      return this.http.request("POST", "/v1/emails/batch", {
        body: inputs,
        idempotencyKey: opts?.idempotencyKey ?? newIdempotencyKey(),
        query: opts?.dryRun ? { dryRun: true } : undefined,
      });
    }) as {
      (inputs: SendEmailInput[], opts: SendBatchOptions & { dryRun: true }): Promise<BatchDryRunResult>;
      (inputs: SendEmailInput[], opts?: SendBatchOptions & { dryRun?: false }): Promise<BatchResult>;
    },

    get: (id: string): Promise<EmailRecord> => this.http.request("GET", `/v1/emails/${enc(id)}`),

    list: (q: ListEmailsQuery = {}): Promise<ListResponse<EmailRecord>> =>
      this.http.request("GET", "/v1/emails", { query: q }),

    content: (id: string): Promise<EmailContent> => this.http.request("GET", `/v1/emails/${enc(id)}/content`),

    /** Cancel a scheduled email. 409 `not_cancelable` once it has been handed to the queue. */
    cancel: (id: string): Promise<{ id: string; status: "canceled" }> =>
      this.http.request("DELETE", `/v1/emails/${enc(id)}`),

    /** Move a scheduled email. `scheduledAt` is an ISO 8601 date-time with offset. */
    reschedule: (id: string, scheduledAt: string): Promise<EmailRecord> =>
      this.http.request("PATCH", `/v1/emails/${enc(id)}`, { body: { scheduledAt } }),
  };

  readonly events = {
    list: (q: ListEventsQuery = {}): Promise<ListResponse<EventRecord>> =>
      this.http.request("GET", "/v1/events", { query: q }),
  };

  readonly domains = {
    list: async (): Promise<DomainRecord[]> => (await this.http.request<Data<DomainRecord>>("GET", "/v1/domains")).data,
  };

  readonly apiKeys = {
    list: async (): Promise<ApiKeyRecord[]> => (await this.http.request<Data<ApiKeyRecord>>("GET", "/v1/api-keys")).data,
  };

  readonly webhooks = {
    list: async (): Promise<WebhookRecord[]> =>
      (await this.http.request<Data<WebhookRecord>>("GET", "/v1/webhooks")).data,
    /** The response includes `secret`. It is shown only here and on `rotateSecret`. */
    create: (input: CreateWebhookInput): Promise<WebhookRecord> =>
      this.http.request("POST", "/v1/webhooks", { body: input }),
    get: (id: string): Promise<WebhookRecord> => this.http.request("GET", `/v1/webhooks/${enc(id)}`),
    update: (id: string, input: UpdateWebhookInput): Promise<WebhookRecord> =>
      this.http.request("PATCH", `/v1/webhooks/${enc(id)}`, { body: input }),
    remove: (id: string): Promise<{ id: string; deleted: true }> =>
      this.http.request("DELETE", `/v1/webhooks/${enc(id)}`),
    /** Sends a synthetic `email.delivered` event to the endpoint. */
    test: (id: string): Promise<{ deliveryId: string }> => this.http.request("POST", `/v1/webhooks/${enc(id)}/test`),
    rotateSecret: (id: string): Promise<WebhookRecord> =>
      this.http.request("POST", `/v1/webhooks/${enc(id)}/rotate-secret`),
    deliveries: (id: string, q: PageQuery = {}): Promise<ListResponse<WebhookDeliveryRecord>> =>
      this.http.request("GET", `/v1/webhooks/${enc(id)}/deliveries`, { query: q }),
  };

  readonly templates = {
    list: async (): Promise<TemplateRecord[]> =>
      (await this.http.request<Data<TemplateRecord>>("GET", "/v1/templates")).data,
    get: (name: string): Promise<TemplateRecord> => this.http.request("GET", `/v1/templates/${enc(name)}`),
    create: (input: CreateTemplateInput): Promise<TemplateRecord> =>
      this.http.request("POST", "/v1/templates", { body: input }),
    update: (name: string, input: UpdateTemplateInput): Promise<TemplateRecord> =>
      this.http.request("PATCH", `/v1/templates/${enc(name)}`, { body: input }),
    remove: (name: string): Promise<{ name: string; deleted: true }> =>
      this.http.request("DELETE", `/v1/templates/${enc(name)}`),
    versions: async (name: string): Promise<TemplateVersionRecord[]> =>
      (await this.http.request<Data<TemplateVersionRecord>>("GET", `/v1/templates/${enc(name)}/versions`)).data,
    restore: (name: string, version: number): Promise<TemplateRecord> =>
      this.http.request("POST", `/v1/templates/${enc(name)}/restore`, { body: { version } }),
    render: (name: string, data: Record<string, unknown> = {}): Promise<RenderedTemplate> =>
      this.http.request("POST", `/v1/templates/${enc(name)}/render`, { body: { data } }),
  };

  readonly analytics = {
    get: (q: AnalyticsQuery = {}): Promise<AnalyticsResult> => this.http.request("GET", "/v1/analytics", { query: q }),
  };

  readonly contacts = {
    list: (q: PageQuery & { q?: string } = {}): Promise<ListResponse<ContactRecord>> =>
      this.http.request("GET", "/v1/contacts", { query: q }),
    /** Upserts by email. */
    create: (input: ContactInput): Promise<ContactRecord> => this.http.request("POST", "/v1/contacts", { body: input }),
    get: (id: string): Promise<ContactRecord> => this.http.request("GET", `/v1/contacts/${enc(id)}`),
    update: (id: string, input: UpdateContactInput): Promise<ContactRecord> =>
      this.http.request("PATCH", `/v1/contacts/${enc(id)}`, { body: input }),
    remove: (id: string): Promise<{ id: string; deleted: true }> =>
      this.http.request("DELETE", `/v1/contacts/${enc(id)}`),
    /** Up to 5000 contacts per call, upserted by email. */
    import: (contacts: ContactInput[]): Promise<{ created: number; updated: number }> =>
      this.http.request("POST", "/v1/contacts/import", { body: contacts }),
  };

  readonly audiences = {
    list: async (): Promise<AudienceRecord[]> =>
      (await this.http.request<Data<AudienceRecord>>("GET", "/v1/audiences")).data,
    create: (input: { name: string }): Promise<AudienceRecord> =>
      this.http.request("POST", "/v1/audiences", { body: input }),
    get: (id: string): Promise<AudienceRecord> => this.http.request("GET", `/v1/audiences/${enc(id)}`),
    update: (id: string, input: { name: string }): Promise<AudienceRecord> =>
      this.http.request("PATCH", `/v1/audiences/${enc(id)}`, { body: input }),
    remove: (id: string): Promise<{ id: string; deleted: true }> =>
      this.http.request("DELETE", `/v1/audiences/${enc(id)}`),
    contacts: (id: string, q: PageQuery = {}): Promise<ListResponse<ContactRecord>> =>
      this.http.request("GET", `/v1/audiences/${enc(id)}/contacts`, { query: q }),
    addContacts: (id: string, contactIds: string[]): Promise<{ added: number }> =>
      this.http.request("POST", `/v1/audiences/${enc(id)}/contacts`, { body: { contactIds } }),
    removeContacts: (id: string, contactIds: string[]): Promise<{ removed: number }> =>
      this.http.request("DELETE", `/v1/audiences/${enc(id)}/contacts`, { body: { contactIds } }),
  };

  readonly broadcasts = {
    list: async (): Promise<BroadcastRecord[]> =>
      (await this.http.request<Data<BroadcastRecord>>("GET", "/v1/broadcasts")).data,
    /** Creates a draft. Call `send` to start it. */
    create: (input: CreateBroadcastInput): Promise<BroadcastRecord> =>
      this.http.request("POST", "/v1/broadcasts", { body: input }),
    get: (id: string): Promise<BroadcastRecord> => this.http.request("GET", `/v1/broadcasts/${enc(id)}`),
    update: (id: string, input: UpdateBroadcastInput): Promise<BroadcastRecord> =>
      this.http.request("PATCH", `/v1/broadcasts/${enc(id)}`, { body: input }),
    remove: (id: string): Promise<{ id: string; deleted: true }> =>
      this.http.request("DELETE", `/v1/broadcasts/${enc(id)}`),
    send: (id: string, opts: { scheduledAt?: string } = {}): Promise<BroadcastRecord> =>
      this.http.request("POST", `/v1/broadcasts/${enc(id)}/send`, { body: opts }),
    cancel: (id: string): Promise<BroadcastRecord> => this.http.request("POST", `/v1/broadcasts/${enc(id)}/cancel`),
  };
}
