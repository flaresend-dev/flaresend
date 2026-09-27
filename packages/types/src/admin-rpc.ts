// The AdminRpc service-binding surface. The dashboard calls these over `env.MAILER_ADMIN`.
// Every method throws an Error whose message carries an encoded FlaresendError (see decodeRpcError).
import type {
  AnalyticsQuery, AnalyticsResult,
} from "./analytics";
import type {
  ApiKeyRecord, CreateApiKeyInput, CreateProjectInput, CreatedApiKey, DomainRecord, DomainSetupResult, MailerInfo, ProjectRecord, StatsRecord,
  SuppressionRecord, UpdateProjectInput,
} from "./admin";
import type {
  AudienceRecord, BroadcastRecord, ContactInput, ContactRecord, CreateBroadcastInput, UpdateBroadcastInput, UpdateContactInput,
} from "./contacts";
import type {
  AdminListEmailsQuery, EmailContent, EmailRecord, EventRecord, ListEventsQuery, ListResponse, SendEmailInput, SendEmailResult,
} from "./email";
import type {
  CreateTemplateInput, RenderedTemplate, TemplateRecord, TemplateVersionRecord, UpdateTemplateInput,
} from "./templates";
import type { CreateWebhookInput, UpdateWebhookInput, WebhookDeliveryRecord, WebhookRecord } from "./webhooks";

export interface PageQuery {
  limit?: number | string;
  cursor?: string;
}

export interface AdminRpcApi {
  // the mailer itself
  info(): Promise<MailerInfo>;

  // projects
  listProjects(): Promise<ProjectRecord[]>;
  getProject(slug: string): Promise<ProjectRecord>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  updateProject(slug: string, patch: UpdateProjectInput): Promise<ProjectRecord>;
  disableProject(slug: string): Promise<ProjectRecord>;
  listDomains(slug: string, opts?: { refresh?: boolean }): Promise<DomainRecord[]>;
  /** Onboards one of the project's domains in Cloudflare Email Sending: sending domain, DNS, DMARC, delivery events. */
  setupDomain(slug: string, domain: string): Promise<DomainSetupResult>;

  // API keys
  listApiKeys(slug?: string | null): Promise<ApiKeyRecord[]>;
  createApiKey(slug: string, input: CreateApiKeyInput): Promise<CreatedApiKey>;
  renameApiKey(id: string, name: string): Promise<ApiKeyRecord>;
  revokeApiKey(id: string): Promise<ApiKeyRecord>;

  // emails
  listEmails(query?: AdminListEmailsQuery): Promise<ListResponse<EmailRecord>>;
  getEmail(id: string): Promise<EmailRecord>;
  getContent(id: string): Promise<EmailContent>;
  resendEmail(id: string): Promise<SendEmailResult>;
  cancelEmail(id: string): Promise<{ id: string; status: "canceled" }>;
  rescheduleEmail(id: string, scheduledAt: string): Promise<EmailRecord>;
  sendEmail(slug: string, input: SendEmailInput): Promise<SendEmailResult>;
  listEvents(query?: ListEventsQuery & { project?: string }): Promise<ListResponse<EventRecord>>;

  // suppressions + stats + analytics
  listSuppressions(query?: PageQuery & { q?: string }): Promise<ListResponse<SuppressionRecord> & { note: string }>;
  addSuppression(input: { address: string; reason?: "hard_bounce" | "complaint" | "manual" }): Promise<SuppressionRecord & { note: string }>;
  removeSuppression(address: string): Promise<{ address: string; deleted: boolean; note: string }>;
  stats(): Promise<StatsRecord[]>;
  analytics(query?: AnalyticsQuery & { project?: string }): Promise<AnalyticsResult>;

  // webhooks
  listWebhooks(slug: string): Promise<WebhookRecord[]>;
  createWebhook(slug: string, input: CreateWebhookInput): Promise<WebhookRecord>;
  getWebhook(slug: string, id: string): Promise<WebhookRecord>;
  updateWebhook(slug: string, id: string, patch: UpdateWebhookInput): Promise<WebhookRecord>;
  deleteWebhook(slug: string, id: string): Promise<{ id: string; deleted: true }>;
  testWebhook(slug: string, id: string): Promise<{ deliveryId: string }>;
  rotateWebhookSecret(slug: string, id: string): Promise<WebhookRecord>;
  listWebhookDeliveries(slug: string, id: string, query?: PageQuery): Promise<ListResponse<WebhookDeliveryRecord>>;

  // templates
  listTemplates(slug: string): Promise<TemplateRecord[]>;
  getTemplate(slug: string, name: string): Promise<TemplateRecord>;
  createTemplate(slug: string, input: CreateTemplateInput): Promise<TemplateRecord>;
  updateTemplate(slug: string, name: string, patch: UpdateTemplateInput): Promise<TemplateRecord>;
  deleteTemplate(slug: string, name: string): Promise<{ name: string; deleted: true }>;
  templateVersions(slug: string, name: string): Promise<TemplateVersionRecord[]>;
  restoreTemplate(slug: string, name: string, version: number): Promise<TemplateRecord>;
  renderTemplate(slug: string, name: string, data?: Record<string, unknown>): Promise<RenderedTemplate>;

  // contacts + audiences
  listContacts(slug: string, query?: PageQuery & { q?: string }): Promise<ListResponse<ContactRecord>>;
  upsertContact(slug: string, input: ContactInput): Promise<ContactRecord>;
  getContact(slug: string, id: string): Promise<ContactRecord>;
  updateContact(slug: string, id: string, patch: UpdateContactInput): Promise<ContactRecord>;
  deleteContact(slug: string, id: string): Promise<{ id: string; deleted: true }>;
  importContacts(slug: string, contacts: ContactInput[]): Promise<{ created: number; updated: number }>;
  listAudiences(slug: string): Promise<AudienceRecord[]>;
  createAudience(slug: string, name: string): Promise<AudienceRecord>;
  getAudience(slug: string, id: string): Promise<AudienceRecord>;
  renameAudience(slug: string, id: string, name: string): Promise<AudienceRecord>;
  deleteAudience(slug: string, id: string): Promise<{ id: string; deleted: true }>;
  listAudienceContacts(slug: string, id: string, query?: PageQuery): Promise<ListResponse<ContactRecord>>;
  addAudienceContacts(slug: string, id: string, contactIds: string[]): Promise<{ added: number }>;
  removeAudienceContacts(slug: string, id: string, contactIds: string[]): Promise<{ removed: number }>;

  // broadcasts
  listBroadcasts(slug: string): Promise<BroadcastRecord[]>;
  createBroadcast(slug: string, input: CreateBroadcastInput): Promise<BroadcastRecord>;
  getBroadcast(slug: string, id: string): Promise<BroadcastRecord>;
  updateBroadcast(slug: string, id: string, patch: UpdateBroadcastInput): Promise<BroadcastRecord>;
  deleteBroadcast(slug: string, id: string): Promise<{ id: string; deleted: true }>;
  sendBroadcast(slug: string, id: string, scheduledAt?: string): Promise<BroadcastRecord>;
  cancelBroadcast(slug: string, id: string): Promise<BroadcastRecord>;
}
