import {
  CreatePublicationInput,
  UpdatePublicationInput,
  type NewsletterPageQuery,
} from "@flaresend/types";
import { pageClause, paginate } from "../../db/client";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId, nowIso } from "../ids";
import { resolveSender } from "../validate";
import {
  active,
  all,
  one,
  guarded,
  limit,
  parse,
  PUB_SELECT,
  requirePublication,
  toPublication,
  type PublicationRow,
} from "./shared";
import { confirmationReady, publicHostReady } from "./policy";

export async function listPublications(
  env: Env,
  project: ProjectRow,
  query: NewsletterPageQuery = {},
) {
  const where = ["p.project_id=?"];
  const params: unknown[] = [project.id];
  pageClause(query.cursor, where, params, "p");
  const rows = await all<PublicationRow>(
    env.DB.prepare(
      `${PUB_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`,
    ).bind(...params, limit(query) + 1),
  );
  const page = paginate(rows, limit(query));
  return {
    data: page.rows.map((r) => toPublication(env, project, r)),
    nextCursor: page.nextCursor,
  };
}
export async function getPublication(
  env: Env,
  project: ProjectRow,
  id: string,
) {
  return toPublication(
    env,
    project,
    await requirePublication(env, project.id, id),
  );
}
export async function createPublication(
  env: Env,
  project: ProjectRow,
  raw: unknown,
) {
  active(project);
  const input = parse(CreatePublicationInput, raw);
  const id = newId("pub");
  const now = nowIso();
  try {
    await env.DB.prepare(
      "INSERT INTO publications(id,project_id,name,slug,description,timezone,status,theme_json,from_name,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,?,?,?)",
    )
      .bind(
        id,
        project.id,
        input.name,
        input.slug,
        input.description,
        input.timezone,
        JSON.stringify(input.theme),
        input.name,
        now,
        now,
      )
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw ApiError.conflict(
        "publication_slug_exists",
        "This newsletter address already exists.",
        "slug",
      );
    throw err;
  }
  return getPublication(env, project, id);
}
export async function updatePublication(
  env: Env,
  project: ProjectRow,
  id: string,
  raw: unknown,
) {
  const p = await requirePublication(env, project.id, id);
  active(project, p);
  const input = parse(UpdatePublicationInput, raw);
  if (input.fromAddress) resolveSender(input.fromAddress, project);
  if (input.siteEnabled && !publicHostReady(env))
    throw ApiError.conflict(
      "public_site_not_configured",
      "Set an HTTPS PUBLIC_BASE_URL before publication.",
    );
  if (input.logoAssetId) {
    const asset = await one(
      env.DB.prepare(
        "SELECT id FROM newsletter_assets WHERE id=? AND publication_id=? AND project_id=? AND status!='deleted'",
      ).bind(input.logoAssetId, id, project.id),
    );
    if (!asset)
      throw ApiError.validation(
        "invalid_asset",
        "Select an image from this newsletter.",
      );
  }
  const merged = {
    ...p,
    from_address:
      input.fromAddress === undefined ? p.from_address : input.fromAddress,
    from_name: input.fromName ?? p.from_name,
  };
  if (input.formEnabled && !(await confirmationReady(env, project, merged)))
    throw ApiError.conflict(
      "confirmation_sender_unready",
      "Configure the verified confirmation sender and newsletter secrets first.",
    );
  try {
    await guarded(
      env,
      env.DB.prepare(
        `UPDATE publications SET name=?,slug=?,description=?,timezone=?,theme_json=?,logo_asset_id=?,site_enabled=?,form_enabled=?,from_address=?,from_name=?,reply_to=?,postal_address=?,ai_instructions=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?`,
      ).bind(
        input.name ?? p.name,
        input.slug ?? p.slug,
        input.description ?? p.description,
        input.timezone ?? p.timezone,
        input.theme ? JSON.stringify(input.theme) : p.theme_json,
        input.logoAssetId === undefined ? p.logo_asset_id : input.logoAssetId,
        input.siteEnabled === undefined
          ? p.site_enabled
          : Number(input.siteEnabled),
        input.formEnabled === undefined
          ? p.form_enabled
          : Number(input.formEnabled),
        merged.from_address,
        merged.from_name,
        input.replyTo === undefined ? p.reply_to : input.replyTo,
        input.postalAddress ?? p.postal_address,
        input.aiInstructions ?? p.ai_instructions,
        nowIso(),
        id,
        project.id,
        input.expectedRevision,
      ),
    );
  } catch (err) {
    if (String(err).includes("UNIQUE"))
      throw ApiError.conflict(
        "publication_slug_exists",
        "This newsletter address already exists.",
        "slug",
      );
    throw err;
  }
  return getPublication(env, project, id);
}
export async function archivePublication(
  env: Env,
  project: ProjectRow,
  id: string,
  expectedRevision: number,
) {
  active(project);
  await requirePublication(env, project.id, id);
  const busy = await one(
    env.DB.prepare(
      "SELECT id FROM newsletter_email_runs WHERE publication_id=? AND status IN ('scheduled','sending') LIMIT 1",
    ).bind(id),
  );
  if (busy)
    throw ApiError.conflict(
      "delivery_active",
      "Cancel the scheduled or sending email first.",
    );
  await guarded(
    env,
    env.DB.prepare(
      "UPDATE publications SET status='archived',form_enabled=0,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?",
    ).bind(nowIso(), id, project.id, expectedRevision),
    [
      env.DB.prepare(
        "UPDATE newsletter_jobs SET status='canceled' WHERE publication_id=? AND status IN ('pending','leased')",
      ).bind(id),
    ],
  );
  return getPublication(env, project, id);
}
