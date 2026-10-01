import { type z } from "zod";
import {
  NewsletterTheme,
  type PublicationRecord,
  type NewsletterPostRecord,
  type NewsletterDocument,
  type NewsletterEmailSummary,
} from "@flaresend/types";
import { all, one, parseJson } from "../../db/client";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId } from "../ids";
import { publicBaseUrl } from "../../env";

export interface PublicationRow {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  status: PublicationRecord["status"];
  theme_json: string;
  logo_asset_id: string | null;
  site_enabled: number;
  form_enabled: number;
  from_address: string | null;
  from_name: string;
  reply_to: string | null;
  postal_address: string;
  ai_instructions: string;
  revision: number;
  created_at: string;
  updated_at: string;
  subscriber_count?: number;
  post_count?: number;
}
export interface PostRow {
  id: string;
  project_id: string;
  publication_id: string;
  slug: string;
  title: string;
  subtitle: string;
  subject: string;
  subject_overridden: number;
  preview_text: string;
  author_label: string;
  draft_revision_id: string;
  public_revision_id: string | null;
  web_status: NewsletterPostRecord["webStatus"];
  web_scheduled_at: string | null;
  web_scheduled_revision_id: string | null;
  schedule_timezone: string | null;
  published_at: string | null;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface RevisionRow {
  id: string;
  document_r2_key: string;
  metadata_json: string;
  content_hash: string;
  number: number;
  created_at: string;
}
export const emptyDocument: NewsletterDocument = {
  schemaVersion: 1,
  blocks: [{ id: "intro", type: "paragraph", content: [] }],
};
export const PUB_SELECT = `SELECT p.*, (SELECT COUNT(*) FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id WHERE s.publication_id=p.id AND s.status='subscribed' AND c.unsubscribed=0 AND NOT EXISTS(SELECT 1 FROM suppressions x WHERE x.address=c.email)) AS subscriber_count, (SELECT COUNT(*) FROM newsletter_posts n WHERE n.publication_id=p.id AND n.public_revision_id IS NOT NULL) AS post_count FROM publications p`;
export function parse<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw ApiError.fromZod(result.error);
  return result.data;
}
export function active(project: ProjectRow, publication?: PublicationRow) {
  if (project.disabled_at)
    throw ApiError.permission("project_disabled", "This project is paused.");
  if (publication?.status === "archived")
    throw ApiError.conflict(
      "publication_archived",
      "This newsletter is archived.",
    );
}
export async function requirePublication(
  env: Env,
  projectId: string,
  id: string,
): Promise<PublicationRow> {
  const row = await one<PublicationRow>(
    env.DB.prepare(`${PUB_SELECT} WHERE p.id=? AND p.project_id=?`).bind(
      id,
      projectId,
    ),
  );
  if (!row)
    throw ApiError.notFound(
      "publication_not_found",
      "The newsletter was not found.",
    );
  return row;
}
export async function requirePost(
  env: Env,
  projectId: string,
  publicationId: string,
  id: string,
): Promise<PostRow> {
  await requirePublication(env, projectId, publicationId);
  const row = await one<PostRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_posts WHERE id=? AND publication_id=? AND project_id=?",
    ).bind(id, publicationId, projectId),
  );
  if (!row)
    throw ApiError.notFound("post_not_found", "The post was not found.");
  return row;
}
export function publicationUrl(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
) {
  return `${publicBaseUrl(env)}/n/${encodeURIComponent(project.slug)}/${encodeURIComponent(p.slug)}`;
}
export function toPublication(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
): PublicationRecord {
  return {
    id: p.id,
    projectId: p.project_id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    timezone: p.timezone,
    status: p.status,
    theme: parse(NewsletterTheme, parseJson(p.theme_json, {})),
    logoAssetId: p.logo_asset_id,
    siteEnabled: p.site_enabled === 1,
    formEnabled: p.form_enabled === 1,
    fromAddress: p.from_address,
    fromName: p.from_name,
    replyTo: p.reply_to,
    postalAddress: p.postal_address,
    aiInstructions: p.ai_instructions ?? "",
    revision: p.revision,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    publicUrl: publicationUrl(env, project, p),
    subscriberCount: p.subscriber_count ?? 0,
    postCount: p.post_count ?? 0,
  };
}
export async function revision(
  env: Env,
  post: PostRow,
  id = post.draft_revision_id,
) {
  const row = await one<RevisionRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_post_revisions WHERE id=? AND post_id=? AND project_id=?",
    ).bind(id, post.id, post.project_id),
  );
  if (!row)
    throw ApiError.notFound(
      "revision_not_found",
      "The content revision was not found.",
    );
  const object = await env.PAYLOADS.get(row.document_r2_key);
  if (!object)
    throw ApiError.internal(
      "The document was not found in storage.",
      "document_missing",
    );
  const document = await object.json<NewsletterDocument>();
  return { row, document };
}
export async function toPost(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
  row: PostRow,
  email: NewsletterEmailSummary | null = null,
): Promise<NewsletterPostRecord> {
  return {
    id: row.id,
    projectId: row.project_id,
    publicationId: row.publication_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    subject: row.subject,
    subjectOverridden: row.subject_overridden === 1,
    previewText: row.preview_text,
    authorLabel: row.author_label,
    draftRevisionId: row.draft_revision_id,
    publicRevisionId: row.public_revision_id,
    webStatus: row.web_status,
    webScheduledAt: row.web_scheduled_at,
    scheduleTimezone: row.schedule_timezone,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    document: (await revision(env, row)).document,
    publicUrl: `${publicationUrl(env, project, p)}/p/${row.slug}`,
    email,
  };
}
export function guarded(
  env: Env,
  write: D1PreparedStatement,
  rest: D1PreparedStatement[] = [],
) {
  const id = newId("guard");
  return env.DB.batch([
    write,
    env.DB.prepare(
      "INSERT INTO newsletter_write_guards(id,changed) VALUES(?,changes())",
    ).bind(id),
    ...rest,
    env.DB.prepare("DELETE FROM newsletter_write_guards WHERE id=?").bind(id),
  ]).catch((error: unknown) => {
    if (String(error).includes("CHECK constraint failed"))
      throw ApiError.conflict(
        "revision_conflict",
        "This record changed. Reload the saved version.",
      );
    throw error;
  });
}
/** Fixed-window counter in D1. Throws 429 with `message` once `maximum` is reached in `window`. */
export async function rate(
  env: Env,
  key: string,
  window: string,
  maximum: number,
  message = "Too many subscription requests. Try again later.",
  code = "rate_limited",
) {
  const result = await env.DB.prepare(
    "INSERT INTO newsletter_rate_counters(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1 WHERE count<?",
  )
    .bind(key, window, maximum)
    .run();
  if (!result.meta.changes) throw ApiError.rateLimited(code, message);
}
export function limit(query: { limit?: number | string }) {
  return Math.min(100, Math.max(1, Number(query.limit) || 25));
}
export async function assertAssets(
  env: Env,
  p: PublicationRow,
  doc: NewsletterDocument,
) {
  const ids = [
    ...new Set([
      ...doc.blocks.flatMap((b) => (b.type === "image" ? [b.assetId] : [])),
      ...(p.logo_asset_id ? [p.logo_asset_id] : []),
    ]),
  ];
  for (const id of ids) {
    const asset = await one(
      env.DB.prepare(
        "SELECT id FROM newsletter_assets WHERE id=? AND publication_id=? AND project_id=? AND status!='deleted'",
      ).bind(id, p.id, p.project_id),
    );
    if (!asset)
      throw ApiError.validation(
        "invalid_asset",
        "An image does not belong to this newsletter.",
      );
  }
  return ids;
}
export function assetStatements(env: Env, revisionId: string, ids: string[]) {
  return ids.map((id) =>
    env.DB.prepare(
      "INSERT INTO newsletter_revision_assets(revision_id,asset_id) VALUES(?,?)",
    ).bind(revisionId, id),
  );
}
export const secret = (env: Env, name: string): string => {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" ? value : "";
};
export { all, one };
