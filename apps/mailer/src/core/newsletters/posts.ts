import {
  CreateNewsletterPostInput,
  UpdateNewsletterPostInput,
  NewsletterDocument,
  NewsletterTheme,
  NewsletterTimezone,
  type NewsletterPageQuery,
  type NewsletterPublishInput,
  type NewsletterPreview,
  type NewsletterFilter,
  type NewsletterReview,
  type NewsletterReviewCheck,
} from "@flaresend/types";
import { pageClause, paginate, parseJson } from "../../db/client";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId, nowIso } from "../ids";
import { sha256Hex } from "../keys";
import { canonicalJson } from "../idempotency";
import {
  active,
  all,
  one,
  guarded,
  limit,
  parse,
  requirePublication,
  requirePost,
  toPost,
  revision,
  emptyDocument,
  assertAssets,
  assetStatements,
  publicationUrl,
  type PostRow,
  type PublicationRow,
} from "./shared";
import { capabilities, EMAIL_BLOCKER_MESSAGE, publicHostReady } from "./policy";
import { renderNewsletter } from "./render";
import { subscriberCounts, getSubscriber } from "./subscriptions";
import { emailSummaries, latestRun } from "./delivery";

function metadata(p: PostRow, pub: PublicationRow) {
  return {
    title: p.title,
    subtitle: p.subtitle,
    subject: p.subject,
    previewText: p.preview_text,
    authorLabel: p.author_label,
    slug: p.slug,
    theme: JSON.parse(pub.theme_json),
    publicationName: pub.name,
    postalAddress: pub.postal_address,
    logoAssetId: pub.logo_asset_id,
  };
}
export async function listPosts(
  env: Env,
  project: ProjectRow,
  id: string,
  query: NewsletterPageQuery = {},
) {
  const p = await requirePublication(env, project.id, id);
  const where = [
    "publication_id=?",
    "project_id=?",
    query.state === "archived"
      ? "archived_at IS NOT NULL"
      : "archived_at IS NULL",
  ];
  const args: unknown[] = [id, project.id];
  if (query.state === "scheduled") {
    // Scheduled on the website or by email.
    where.push(
      "(web_status='scheduled' OR EXISTS(SELECT 1 FROM newsletter_email_runs r WHERE r.post_id=newsletter_posts.id AND r.status='scheduled'))",
    );
  } else if (
    query.state &&
    ["draft", "published", "unpublished"].includes(query.state)
  ) {
    where.push("web_status=?");
    args.push(query.state);
  }
  pageClause(query.cursor, where, args);
  const rows = await all<PostRow>(
    env.DB.prepare(
      `SELECT * FROM newsletter_posts WHERE ${where.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`,
    ).bind(...args, limit(query) + 1),
  );
  const page = paginate(rows, limit(query));
  const email = await emailSummaries(
    env,
    page.rows.map((r) => r.id),
  );
  return {
    data: await Promise.all(
      page.rows.map((r) => toPost(env, project, p, r, email.get(r.id) ?? null)),
    ),
    nextCursor: page.nextCursor,
  };
}
export async function getPost(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
) {
  const p = await requirePublication(env, project.id, id);
  const email = await emailSummaries(env, [postId]);
  return toPost(
    env,
    project,
    p,
    await requirePost(env, project.id, id, postId),
    email.get(postId) ?? null,
  );
}
export async function createPost(
  env: Env,
  project: ProjectRow,
  id: string,
  raw: unknown,
) {
  const p = await requirePublication(env, project.id, id);
  active(project, p);
  const input = parse(CreateNewsletterPostInput, raw);
  const doc = input.document ?? emptyDocument;
  const assets = await assertAssets(env, p, doc);
  const postId = newId("post"),
    revId = newId("rev"),
    now = nowIso();
  const key = `newsletters/${project.id}/${id}/revisions/${revId}.json`;
  await env.PAYLOADS.put(key, JSON.stringify(doc));
  const meta = {
    title: input.title,
    subtitle: "",
    subject: input.title,
    previewText: "",
    authorLabel: "",
    slug: `post-${postId.slice(-12).toLowerCase()}`,
    theme: JSON.parse(p.theme_json),
    publicationName: p.name,
    postalAddress: p.postal_address,
    logoAssetId: p.logo_asset_id,
  };
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO newsletter_posts(id,project_id,publication_id,slug,title,subject,draft_revision_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).bind(
      postId,
      project.id,
      id,
      meta.slug,
      input.title,
      input.title,
      revId,
      now,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO newsletter_post_revisions(id,project_id,publication_id,post_id,number,document_r2_key,render_r2_prefix,content_hash,metadata_json,created_at) VALUES(?,?,?,?,1,?,?,?,?,?)",
    ).bind(
      revId,
      project.id,
      id,
      postId,
      key,
      key,
      await sha256Hex(canonicalJson({ doc, meta })),
      JSON.stringify(meta),
      now,
    ),
    ...assetStatements(env, revId, assets),
  ]);
  return getPost(env, project, id, postId);
}
export async function updatePost(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
  raw: unknown,
) {
  const p = await requirePublication(env, project.id, id);
  active(project, p);
  const post = await requirePost(env, project.id, id, postId);
  if (post.web_status === "scheduled")
    throw ApiError.conflict(
      "post_scheduled",
      "Cancel the web schedule before an edit.",
    );
  const input = parse(UpdateNewsletterPostInput, raw);
  const doc = input.document ?? (await revision(env, post)).document;
  parse(NewsletterDocument, doc);
  const assets = await assertAssets(env, p, doc);
  const revId = newId("rev"),
    now = nowIso();
  const key = `newsletters/${project.id}/${id}/revisions/${revId}.json`;
  await env.PAYLOADS.put(key, JSON.stringify(doc));
  if (post.published_at && input.slug && input.slug !== post.slug)
    throw ApiError.conflict(
      "published_slug_fixed",
      "The article address cannot change after publication.",
    );
  const next: PostRow = {
    ...post,
    title: input.title ?? post.title,
    subtitle: input.subtitle ?? post.subtitle,
    subject:
      input.subject ??
      (input.title !== undefined && !post.subject_overridden
        ? input.title
        : post.subject),
    subject_overridden:
      input.subjectOverridden === undefined
        ? post.subject_overridden
        : Number(input.subjectOverridden),
    preview_text: input.previewText ?? post.preview_text,
    author_label: input.authorLabel ?? post.author_label,
    slug: input.slug ?? post.slug,
  };
  const meta = metadata(next, p);
  try {
    await guarded(
      env,
      env.DB.prepare(
        "UPDATE newsletter_posts SET title=?,subtitle=?,subject=?,subject_overridden=?,preview_text=?,author_label=?,slug=?,draft_revision_id=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?",
      ).bind(
        next.title,
        next.subtitle,
        next.subject,
        next.subject_overridden,
        next.preview_text,
        next.author_label,
        next.slug,
        revId,
        now,
        postId,
        project.id,
        input.expectedRevision,
      ),
      [
        env.DB.prepare(
          "INSERT INTO newsletter_post_revisions(id,project_id,publication_id,post_id,number,document_r2_key,render_r2_prefix,content_hash,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          revId,
          project.id,
          id,
          postId,
          input.expectedRevision + 1,
          key,
          key,
          await sha256Hex(canonicalJson({ doc, meta })),
          JSON.stringify(meta),
          now,
        ),
        ...assetStatements(env, revId, assets),
      ],
    );
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw ApiError.conflict(
        "post_slug_exists",
        "This article address already exists.",
      );
    throw err;
  }
  return getPost(env, project, id, postId);
}
export async function postCommand(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
  command:
    | "duplicate"
    | "archive"
    | "delete"
    | "unpublish-web"
    | "cancel-web-schedule",
  expectedRevision: number,
) {
  const pub = await requirePublication(env, project.id, id);
  active(project, pub);
  const post = await requirePost(env, project.id, id, postId);
  if (command === "duplicate") {
    const copy = await createPost(env, project, id, {
      title: post.title,
      document: (await revision(env, post)).document,
    });
    return updatePost(env, project, id, copy.id, {
      expectedRevision: copy.revision,
      subtitle: post.subtitle,
      subject: post.subject,
      subjectOverridden: !!post.subject_overridden,
      previewText: post.preview_text,
      authorLabel: post.author_label,
    });
  }
  const scheduled = env.DB.prepare(
    "UPDATE newsletter_jobs SET status='canceled',updated_at=? WHERE entity_id=? AND status IN ('pending','leased')",
  ).bind(nowIso(), postId);
  if (command === "delete") {
    if (
      post.published_at ||
      post.public_revision_id ||
      post.web_status === "scheduled" ||
      (await one(
        env.DB.prepare(
          "SELECT id FROM newsletter_email_runs WHERE post_id=? LIMIT 1",
        ).bind(postId),
      ))
    )
      throw ApiError.conflict(
        "post_active",
        "Only an unpublished draft without a delivery can be deleted.",
      );
    await guarded(
      env,
      env.DB.prepare(
        "DELETE FROM newsletter_posts WHERE id=? AND project_id=? AND revision=?",
      ).bind(postId, project.id, expectedRevision),
    );
    return { deleted: true as const };
  }
  const sql =
    command === "archive"
      ? "archived_at=?"
      : command === "unpublish-web"
        ? "public_revision_id=NULL,web_status='unpublished',web_scheduled_at=NULL,web_scheduled_revision_id=NULL"
        : "web_status=CASE WHEN public_revision_id IS NULL THEN 'draft' ELSE 'published' END,web_scheduled_at=NULL,web_scheduled_revision_id=NULL";
  await guarded(
    env,
    env.DB.prepare(
      `UPDATE newsletter_posts SET ${sql},revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?`,
    ).bind(
      ...(command === "archive" ? [nowIso()] : []),
      nowIso(),
      postId,
      project.id,
      expectedRevision,
    ),
    [scheduled],
  );
  return getPost(env, project, id, postId);
}
export async function publishWeb(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
  input: NewsletterPublishInput,
) {
  if (input.timezone) parse(NewsletterTimezone, input.timezone);
  const p = await requirePublication(env, project.id, id);
  active(project, p);
  const post = await requirePost(env, project.id, id, postId);
  if (!input.idempotencyKey || input.idempotencyKey.length > 200)
    throw ApiError.validation(
      "idempotency_key_required",
      "Supply an Idempotency-Key.",
    );
  const hash = await sha256Hex(canonicalJson({ id, postId, input }));
  const replay = async () => {
    const prior = await one<{ request_hash: string; result_json: string }>(
      env.DB.prepare(
        "SELECT * FROM newsletter_commands WHERE project_id=? AND idempotency_key=?",
      ).bind(project.id, input.idempotencyKey),
    );
    if (!prior) return null;
    if (prior.request_hash !== hash)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "The request key has a different payload.",
      );
    return JSON.parse(prior.result_json) as Awaited<ReturnType<typeof getPost>>;
  };
  const prior = await replay();
  if (prior) return prior;
  if (!publicHostReady(env) || !p.site_enabled)
    throw ApiError.conflict(
      "public_site_not_configured",
      "Publish the newsletter website first.",
    );
  if (
    post.draft_revision_id !== input.revisionId ||
    post.revision !== input.expectedRevision
  )
    throw ApiError.conflict(
      "revision_conflict",
      "Review the current saved version first.",
    );
  if (
    !post.title.trim() ||
    !(await revision(env, post)).document.blocks.length ||
    post.archived_at
  )
    throw ApiError.validation(
      "invalid_document",
      "Add a title and content before publication.",
    );
  let at: string | null = null;
  if (input.scheduledAt) {
    const date = new Date(input.scheduledAt);
    if (
      !/([zZ]|[+-]\d\d:\d\d)$/.test(input.scheduledAt) ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now()
    )
      throw ApiError.validation(
        "invalid_schedule",
        "Select a future date with a UTC offset.",
      );
    at = date.toISOString();
  }
  const now = nowIso();
  const email = (await emailSummaries(env, [postId])).get(postId) ?? null;
  const result = await toPost(env, project, p, {
    ...post,
    web_status: at ? "scheduled" : "published",
    public_revision_id: at ? post.public_revision_id : input.revisionId,
    web_scheduled_revision_id: at ? input.revisionId : null,
    web_scheduled_at: at,
    schedule_timezone: at ? input.timezone || p.timezone : null,
    published_at: at ? post.published_at : post.published_at || now,
    revision: post.revision + 1,
    updated_at: now,
  }, email);
  try {
    await guarded(
      env,
      env.DB.prepare(
        "UPDATE newsletter_posts SET web_status=?,public_revision_id=?,web_scheduled_revision_id=?,web_scheduled_at=?,schedule_timezone=?,published_at=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=? AND draft_revision_id=?",
      ).bind(
        result.webStatus,
        result.publicRevisionId,
        at ? input.revisionId : null,
        at,
        result.scheduleTimezone,
        result.publishedAt,
        now,
        postId,
        project.id,
        input.expectedRevision,
        input.revisionId,
      ),
      [
        env.DB.prepare(
          "UPDATE newsletter_jobs SET status='canceled' WHERE entity_id=? AND status IN ('pending','leased')",
        ).bind(postId),
        ...(at
          ? [
              env.DB.prepare(
                "INSERT INTO newsletter_jobs(id,project_id,publication_id,kind,entity_id,generation,due_at,status,created_at,updated_at) VALUES(?,?,?,'web',?,?,?,'pending',?,?)",
              ).bind(
                newId("job"),
                project.id,
                id,
                postId,
                result.revision,
                at,
                now,
                now,
              ),
            ]
          : []),
        env.DB.prepare(
          "INSERT INTO newsletter_commands(project_id,idempotency_key,request_hash,result_json,created_at) VALUES(?,?,?,?,?)",
        ).bind(
          project.id,
          input.idempotencyKey,
          hash,
          JSON.stringify(result),
          now,
        ),
      ],
    );
  } catch (err) {
    const retry = await replay();
    if (retry) return retry;
    throw err;
  }
  return result;
}
export async function previewPost(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
  target: "email" | "web" | "text",
  subscriptionId?: string,
): Promise<NewsletterPreview> {
  await requirePublication(env, project.id, id);
  const post = await requirePost(env, project.id, id, postId);
  const snapshot = await revision(env, post);
  const meta = JSON.parse(snapshot.row.metadata_json) as ReturnType<
    typeof metadata
  >;
  const sample = subscriptionId
    ? await getSubscriber(env, project, id, subscriptionId)
    : { firstName: "Ada", lastName: "Lovelace" };
  const out = renderNewsletter(snapshot.document, {
    title: meta.title,
    subtitle: meta.subtitle,
    previewText: meta.previewText,
    publicationName: meta.publicationName,
    postalAddress: meta.postalAddress,
    logoAssetId: meta.logoAssetId,
    theme: parse(NewsletterTheme, meta.theme),
    target,
    assetUrl: (asset) => `newsletter-asset:${asset}`,
    values: target === "web" ? undefined : sample,
  });
  return { ...out, subject: meta.subject };
}
export async function reviewPost(
  env: Env,
  project: ProjectRow,
  id: string,
  postId: string,
  filter: NewsletterFilter = {},
): Promise<NewsletterReview> {
  const post = await getPost(env, project, id, postId);
  const p = await requirePublication(env, project.id, id);
  const { status: _ignored, ...recipients } = filter;
  const counts = await subscriberCounts(env, project, id, recipients);
  const caps = await capabilities(env, project, id);
  const blocks = post.document.blocks;
  const hasContent =
    !!post.title.trim() &&
    blocks.some(
      (b) =>
        b.type !== "paragraph" ||
        b.content.some((i) => i.type === "personalization" || !!i.text.trim()),
    );
  const images = blocks.filter((b) => b.type === "image");
  const undescribed = images.filter(
    (b) => b.type === "image" && !b.decorative && !b.alt.trim(),
  ).length;
  const unfinishedButtons = blocks.filter(
    (b) => b.type === "button" && (!b.label.trim() || !b.href),
  ).length;
  const checks: NewsletterReviewCheck[] = [
    {
      id: "content",
      label: "Title and content",
      ok: hasContent,
      level: "error",
      channel: "both",
      message: "Add a title and some text.",
      fix: "editor",
    },
    {
      id: "website",
      label: "Website is on",
      ok: !!p.site_enabled && publicHostReady(env),
      level: "error",
      channel: "web",
      message: publicHostReady(env)
        ? "Turn on the newsletter website."
        : "Set PUBLIC_BASE_URL on the mailer to an HTTPS address.",
      fix: "website",
    },
    {
      id: "sender",
      label: p.from_address ? `Sender ready · ${p.from_address}` : "Sender ready",
      ok: caps.email,
      level: "error",
      channel: "email",
      message: caps.emailBlocker
        ? EMAIL_BLOCKER_MESSAGE[caps.emailBlocker]
        : undefined,
      fix: "settings",
    },
    {
      id: "recipients",
      label: "Has subscribers to send to",
      ok: counts.eligible > 0,
      level: "error",
      channel: "email",
      message: "No subscribers match this selection.",
      fix: "subscribers",
    },
    {
      id: "postal",
      label: "Postal address in the footer",
      ok: !!p.postal_address.trim(),
      level: "warning",
      channel: "email",
      message: "Many inboxes expect a postal address in newsletter footers.",
      fix: "settings",
    },
  ];
  if (images.length)
    checks.push({
      id: "alt",
      label: "Image descriptions",
      ok: !undescribed,
      level: "warning",
      channel: "both",
      message: `${undescribed} ${undescribed === 1 ? "image has" : "images have"} no description.`,
      fix: "editor",
    });
  if (unfinishedButtons)
    checks.push({
      id: "buttons",
      label: "Buttons",
      ok: false,
      level: "warning",
      channel: "both",
      message: `${unfinishedButtons} ${unfinishedButtons === 1 ? "button has" : "buttons have"} no label or link and will be left out.`,
      fix: "editor",
    });
  return {
    post,
    capabilities: caps,
    ...counts,
    checks,
    sender: { fromAddress: p.from_address, fromName: p.from_name || p.name },
    lastRun: await latestRun(env, project, postId),
  };
}
