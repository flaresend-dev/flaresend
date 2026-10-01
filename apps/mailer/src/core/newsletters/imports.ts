import { parse as parseCsv } from "csv-parse/sync";
import { allInChunks } from "../../db/client";
import { z } from "zod";
import type {
  NewsletterImportMapping,
  NewsletterImportPreview,
  NewsletterConsent,
  NewsletterImportRecord,
  NewsletterFilter,
} from "@flaresend/types";
import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId, nowIso } from "../ids";
import { sha256Hex } from "../keys";
import { canonicalJson } from "../idempotency";
import { parse, requirePublication, active, all, one, guarded } from "./shared";
import {
  addressHash,
  filterSql,
  SUB_SELECT,
  signToken,
  verifySignedToken,
} from "./subscriptions";
import { requireAudience } from "../contacts";

const Mapping = z
  .object({
    email: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    tags: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();
const Consent = z
  .object({
    source: z.string().trim().min(1).max(500),
    at: z
      .string()
      .datetime({ offset: true })
      .refine(
        (s) => new Date(s).getTime() <= Date.now(),
        "The consent date must not be in the future.",
      ),
  })
  .strict();
type CsvRow = Record<string, string>;
interface ImportRow {
  id: string;
  project_id: string;
  publication_id: string;
  file_r2_key: string;
  mapping_json: string;
  consent_json: string;
  status: NewsletterImportRecord["status"];
  total: number;
  cursor: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  lease_token: string | null;
  lease_until: string | null;
  request_hash: string;
  error_r2_key: string | null;
  last_error: string | null;
}
export function readCsv(csv: string): { headers: string[]; rows: CsvRow[] } {
  if (new TextEncoder().encode(csv).byteLength > 5 * 1024 * 1024)
    throw ApiError.validation(
      "import_too_large",
      "A CSV file must not exceed 5 MiB.",
    );
  try {
    const matrix = parseCsv(csv, {
      bom: true,
      skip_empty_lines: true,
      max_record_size: 100_000,
    }) as string[][];
    const headers = (matrix.shift() ?? []).map((s) => s.trim());
    if (
      !headers.length ||
      new Set(headers).size !== headers.length ||
      headers.some((s) => !s)
    )
      throw new Error("The column names must be unique and nonempty.");
    if (matrix.length > 5000)
      throw new Error("A file can contain at most 5,000 rows.");
    return {
      headers,
      rows: matrix.map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])),
      ),
    };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.validation("invalid_csv", String((e as Error).message));
  }
}
function validEmail(value: string) {
  const result = z.string().trim().toLowerCase().email().safeParse(value);
  return result.success ? result.data : null;
}
function mapped(rows: CsvRow[], mapping: NewsletterImportMapping) {
  const seen = new Set<string>();
  return rows.map((r, index) => {
    const email = validEmail(r[mapping.email] ?? "");
    const duplicate = !!email && seen.has(email);
    if (email) seen.add(email);
    return { row: r, index, email, duplicate };
  });
}
export const csvCell = (v: unknown) => {
  let value = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  return `"${value.replace(/"/g, '""')}"`;
};
export async function previewImport(
  env: Env,
  project: ProjectRow,
  id: string,
  input: { csv: string; mapping?: NewsletterImportMapping; fileId?: string },
): Promise<NewsletterImportPreview> {
  input = parse(
    z
      .object({
        csv: z.string().max(5 * 1024 * 1024),
        mapping: Mapping.optional(),
        fileId: z.string().optional(),
      })
      .strict(),
    input,
  );
  const pub = await requirePublication(env, project.id, id);
  active(project, pub);
  let csv = input.csv,
    fileId = input.fileId;
  if (fileId) {
    const f = await one<{ r2_key: string }>(
      env.DB.prepare(
        "SELECT * FROM newsletter_import_files WHERE id=? AND project_id=? AND publication_id=?",
      ).bind(fileId, project.id, id),
    );
    if (!f)
      throw ApiError.notFound(
        "import_file_not_found",
        "The import file was not found.",
      );
    const file = await env.PAYLOADS.get(f.r2_key);
    if (!file)
      throw ApiError.notFound(
        "import_file_not_found",
        "The import file expired.",
      );
    csv = await file.text();
  }
  const data = readCsv(csv);
  const mapping = parse(
    Mapping,
    input.mapping ?? {
      email:
        data.headers.find((h) => h.toLowerCase() === "email") ??
        data.headers[0] ??
        "email",
    },
  );
  for (const field of Object.values(mapping))
    if (!data.headers.includes(field))
      throw ApiError.validation(
        "invalid_mapping",
        "Select a column from this file.",
      );
  const hash = await sha256Hex(csv);
  if (!fileId) {
    fileId = newId("nf");
    const key = `newsletters/${project.id}/${id}/imports/${fileId}.csv`;
    await env.PAYLOADS.put(key, csv);
    await env.DB.prepare(
      "INSERT INTO newsletter_import_files(id,project_id,publication_id,r2_key,content_hash,created_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(fileId, project.id, id, key, hash, nowIso())
      .run();
  }
  const items = mapped(data.rows, mapping),
    emails = items.filter((i) => i.email && !i.duplicate).map((i) => i.email!);
  const hashes = await Promise.all(
    emails.map((email) => addressHash(env, email)),
  );
  const contacts = await allInChunks<{ email: string; blocked: number }>(
    env.DB,
    (ph) =>
      `SELECT c.email,(c.unsubscribed=1 OR EXISTS(SELECT 1 FROM suppressions x WHERE x.address=c.email)) AS blocked FROM contacts c WHERE c.project_id=? AND c.email IN (${ph})`,
    emails,
    [project.id],
  );
  const blocks = await allInChunks<{ address_hmac: string }>(
    env.DB,
    (ph) =>
      `SELECT address_hmac FROM newsletter_address_blocks WHERE publication_id=? AND address_hmac IN (${ph})`,
    hashes,
    [id],
  );
  const protectedAddresses = new Set(blocks.map((b) => b.address_hmac)),
    byEmail = new Map(contacts.map((c) => [c.email, c]));
  const existing = contacts.length,
    protectedCount = emails.filter(
      (email, i) =>
        byEmail.get(email)?.blocked || protectedAddresses.has(hashes[i]!),
    ).length;
  const payload = `${fileId}~${await sha256Hex(canonicalJson({ hash, mapping }))}~${Date.now() + 3600_000}`;
  return {
    fileId,
    headers: data.headers,
    rows: data.rows.length,
    valid: items.filter((i) => i.email && !i.duplicate).length,
    invalid: items.filter((i) => !i.email).length,
    duplicates: items.filter((i) => i.duplicate).length,
    existing,
    protected: protectedCount,
    previewToken: await signToken(env, "import-preview", payload),
    sample: data.rows.slice(0, 5),
  };
}
function importRecord(row: ImportRow): NewsletterImportRecord {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.cursor,
    created: row.created,
    updated: row.updated,
    skipped: row.skipped,
    failed: row.failed,
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}
export async function getImport(
  env: Env,
  project: ProjectRow,
  id: string,
  importId: string,
) {
  await requirePublication(env, project.id, id);
  const row = await one<ImportRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_imports WHERE id=? AND project_id=? AND publication_id=?",
    ).bind(importId, project.id, id),
  );
  if (!row)
    throw ApiError.notFound("import_not_found", "The import was not found.");
  const result = importRecord(row);
  if (row.error_r2_key)
    result.errorCsv = await (await env.PAYLOADS.get(row.error_r2_key))?.text();
  return result;
}
export async function startImport(
  env: Env,
  project: ProjectRow,
  id: string,
  raw: {
    fileId: string;
    mapping: NewsletterImportMapping;
    consent: NewsletterConsent;
    previewToken: string;
    idempotencyKey: string;
  },
  audienceRequestHash?: string,
) {
  active(project, await requirePublication(env, project.id, id));
  const input = parse(
    z
      .object({
        fileId: z.string(),
        mapping: Mapping,
        consent: Consent,
        previewToken: z.string().max(1024),
        idempotencyKey: z.string().min(1).max(200),
      })
      .strict(),
    raw,
  );
  const hash =
    audienceRequestHash ?? (await sha256Hex(canonicalJson({ id, input })));
  const prior = await one<ImportRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_imports WHERE project_id=? AND request_key=?",
    ).bind(project.id, input.idempotencyKey),
  );
  if (prior) {
    if (prior.request_hash !== hash)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "The request key has a different import.",
      );
    return getImport(env, project, id, prior.id);
  }
  const f = await one<{ r2_key: string; content_hash: string }>(
    env.DB.prepare(
      "SELECT * FROM newsletter_import_files WHERE id=? AND project_id=? AND publication_id=?",
    ).bind(input.fileId, project.id, id),
  );
  if (!f)
    throw ApiError.notFound(
      "import_file_not_found",
      "The import file was not found.",
    );
  const payload = await verifySignedToken(
    env,
    "import-preview",
    input.previewToken,
  );
  const expected = `${input.fileId}~${await sha256Hex(canonicalJson({ hash: f.content_hash, mapping: input.mapping }))}~`;
  if (
    !payload?.startsWith(expected) ||
    Number(payload.split("~")[2]) < Date.now()
  )
    throw ApiError.conflict(
      "import_preview_stale",
      "Review this file and its column mapping again.",
    );
  const object = await env.PAYLOADS.get(f.r2_key);
  if (!object)
    throw ApiError.notFound(
      "import_file_not_found",
      "The import file expired.",
    );
  const data = readCsv(await object.text());
  const importId = newId("imp"),
    now = nowIso();
  try {
    await env.DB.prepare(
      "INSERT INTO newsletter_imports(id,project_id,publication_id,status,file_r2_key,mapping_json,consent_json,total,request_key,request_hash,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?,?,?,?,?)",
    )
      .bind(
        importId,
        project.id,
        id,
        f.r2_key,
        JSON.stringify(input.mapping),
        JSON.stringify(input.consent),
        data.rows.length,
        input.idempotencyKey,
        hash,
        now,
        now,
      )
      .run();
  } catch (e) {
    const concurrent = await one<ImportRow>(
      env.DB.prepare(
        "SELECT * FROM newsletter_imports WHERE project_id=? AND request_key=?",
      ).bind(project.id, input.idempotencyKey),
    );
    if (concurrent?.request_hash === hash)
      return getImport(env, project, id, concurrent.id);
    if (concurrent)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "The request key has a different import.",
      );
    throw e;
  }
  await env.NEWSLETTER_QUEUE.send({ kind: "newsletter-import", importId });
  return getImport(env, project, id, importId);
}
export async function importAudience(
  env: Env,
  project: ProjectRow,
  id: string,
  input: {
    audienceId: string;
    consent: NewsletterConsent;
    idempotencyKey: string;
  },
) {
  input = parse(
    z
      .object({
        audienceId: z.string().min(1),
        consent: Consent,
        idempotencyKey: z.string().min(1).max(200),
      })
      .strict(),
    input,
  );
  await requirePublication(env, project.id, id);
  const requestHash = await sha256Hex(canonicalJson({ id, input }));
  const prior = await one<ImportRow>(
    env.DB.prepare(
      "SELECT * FROM newsletter_imports WHERE project_id=? AND request_key=?",
    ).bind(project.id, `audience:${input.idempotencyKey}`),
  );
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "The request key has a different import.",
      );
    return getImport(env, project, id, prior.id);
  }
  const receipt = await one<{ request_hash: string; result_json: string }>(
    env.DB.prepare(
      "SELECT request_hash,result_json FROM newsletter_commands WHERE project_id=? AND idempotency_key=?",
    ).bind(project.id, `audience:${input.idempotencyKey}`),
  );
  if (receipt) {
    if (receipt.request_hash !== requestHash)
      throw ApiError.conflict(
        "idempotency_payload_mismatch",
        "The request key has a different import.",
      );
    return getImport(
      env,
      project,
      id,
      JSON.parse(receipt.result_json).importId,
    );
  }
  await requireAudience(env, project.id, input.audienceId);
  const rows = await all<{
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    env.DB.prepare(
      "SELECT c.email,c.first_name,c.last_name FROM audience_contacts ac JOIN contacts c ON c.id=ac.contact_id WHERE ac.audience_id=? AND c.project_id=? ORDER BY c.id LIMIT 5001",
    ).bind(input.audienceId, project.id),
  );
  if (rows.length > 5000)
    throw ApiError.validation(
      "import_too_large",
      "Import at most 5,000 audience contacts at once.",
    );
  const csv = [
    "email,firstName,lastName",
    ...rows.map((r) =>
      [r.email, r.first_name, r.last_name].map(csvCell).join(","),
    ),
  ].join("\n");
  const mapping = {
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
  };
  const preview = await previewImport(env, project, id, { csv, mapping });
  const result = await startImport(
    env,
    project,
    id,
    {
      mapping,
      consent: input.consent,
      idempotencyKey: `audience:${input.idempotencyKey}`,
      fileId: preview.fileId,
      previewToken: preview.previewToken,
    },
    requestHash,
  );
  await env.DB.prepare(
    "INSERT OR IGNORE INTO newsletter_commands(project_id,idempotency_key,request_hash,result_json,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(
      project.id,
      `audience:${input.idempotencyKey}`,
      requestHash,
      JSON.stringify({ importId: result.id }),
      nowIso(),
    )
    .run();
  return result;
}
export async function processImport(
  env: Env,
  importId: string,
): Promise<boolean> {
  const row = await one<ImportRow>(
    env.DB.prepare("SELECT * FROM newsletter_imports WHERE id=?").bind(
      importId,
    ),
  );
  if (!row || !["queued", "processing"].includes(row.status)) return false;
  const owner = await one<{ disabled_at: string | null; status: string }>(
    env.DB.prepare(
      "SELECT pr.disabled_at,p.status FROM publications p JOIN projects pr ON pr.id=p.project_id WHERE p.id=?",
    ).bind(row.publication_id),
  );
  if (!owner || owner.status === "archived") {
    await env.DB.prepare(
      "UPDATE newsletter_imports SET status='canceled' WHERE id=?",
    )
      .bind(importId)
      .run();
    return false;
  }
  if (owner.disabled_at) return false;
  const lease = newId("lease"),
    now = nowIso();
  const claim = await env.DB.prepare(
    "UPDATE newsletter_imports SET status='processing',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)",
  )
    .bind(
      lease,
      new Date(Date.now() + 120_000).toISOString(),
      now,
      importId,
      now,
    )
    .run();
  if (!claim.meta.changes) return false;
  try {
    const file = await env.PAYLOADS.get(row.file_r2_key);
    if (!file) throw new Error("The import file expired.");
    const data = readCsv(await file.text());
    const mapping = JSON.parse(row.mapping_json) as NewsletterImportMapping;
    const consent = JSON.parse(row.consent_json) as NewsletterConsent;
    const items = mapped(data.rows, mapping);
    const chunk = items.slice(row.cursor, row.cursor + 50);
    for (const item of chunk) {
      const done = await one(
        env.DB.prepare(
          "SELECT row_number FROM newsletter_import_rows WHERE import_id=? AND row_number=?",
        ).bind(importId, item.index),
      );
      if (done) continue;
      let outcome = !item.email
        ? "failed"
        : item.duplicate
          ? "skipped"
          : "created";
      let reason = !item.email
        ? "invalid_email"
        : item.duplicate
          ? "duplicate"
          : null;
      const statements: D1PreparedStatement[] = [];
      if (item.email && !item.duplicate) {
        const hash = await addressHash(env, item.email);
        const existing = await one<{ id: string; unsubscribed: number }>(
          env.DB.prepare(
            "SELECT id,unsubscribed FROM contacts WHERE project_id=? AND email=?",
          ).bind(row.project_id, item.email),
        );
        const contactId = existing?.id ?? newId("ct");
        const blocked =
          existing?.unsubscribed ||
          !!(await one(
            env.DB.prepare(
              "SELECT 1 FROM suppressions WHERE address=? UNION ALL SELECT 1 FROM newsletter_address_blocks WHERE publication_id=? AND address_hmac=?",
            ).bind(item.email, row.publication_id, hash),
          ));
        const sub = existing
          ? await one<{ status: string }>(
              env.DB.prepare(
                "SELECT status FROM newsletter_subscriptions WHERE publication_id=? AND contact_id=?",
              ).bind(row.publication_id, contactId),
            )
          : null;
        outcome =
          blocked || sub?.status === "unsubscribed"
            ? "skipped"
            : sub
              ? "updated"
              : "created";
        if (outcome === "skipped") reason = "protected_unsubscribe";
        if (outcome !== "skipped") {
          statements.push(
            env.DB.prepare(
              "INSERT INTO contacts(id,project_id,email,first_name,last_name,newsletter_address_hmac,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET first_name=COALESCE(excluded.first_name,contacts.first_name),last_name=COALESCE(excluded.last_name,contacts.last_name),newsletter_address_hmac=excluded.newsletter_address_hmac,updated_at=excluded.updated_at",
            ).bind(
              contactId,
              row.project_id,
              item.email,
              mapping.firstName ? item.row[mapping.firstName] || null : null,
              mapping.lastName ? item.row[mapping.lastName] || null : null,
              hash,
              now,
              now,
            ),
          );
          const subscriptionId = newId("sub");
          statements.push(
            env.DB.prepare(
              "INSERT OR IGNORE INTO newsletter_subscriptions(id,project_id,publication_id,contact_id,status,source,consent_source,consent_at,created_at,updated_at) SELECT ?,?,?,c.id,'subscribed',?,?,?,?,? FROM contacts c WHERE c.project_id=? AND c.email=? AND c.unsubscribed=0 AND NOT EXISTS(SELECT 1 FROM suppressions WHERE address=c.email) AND NOT EXISTS(SELECT 1 FROM newsletter_address_blocks WHERE publication_id=? AND address_hmac=?)",
            ).bind(
              subscriptionId,
              row.project_id,
              row.publication_id,
              mapping.source
                ? item.row[mapping.source] || "csv_import"
                : "csv_import",
              consent.source,
              consent.at,
              now,
              now,
              row.project_id,
              item.email,
              row.publication_id,
              hash,
            ),
          );
          statements.push(
            env.DB.prepare(
              "INSERT INTO newsletter_subscription_events(id,project_id,publication_id,subscription_id,type,occurred_at,actor_kind,data_json) SELECT ?,?,?,?,'subscribed',?,'import',? WHERE EXISTS(SELECT 1 FROM newsletter_subscriptions WHERE id=?)",
            ).bind(
              newId("nse"),
              row.project_id,
              row.publication_id,
              subscriptionId,
              now,
              JSON.stringify({
                consentSource: consent.source,
                consentAt: consent.at,
              }),
              subscriptionId,
            ),
          );
          if (mapping.tags && item.row[mapping.tags])
            for (const tagName of item.row[mapping.tags]!.split(";")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 20)) {
              const tagId = newId("tag");
              statements.push(
                env.DB.prepare(
                  "INSERT OR IGNORE INTO newsletter_tags(id,project_id,publication_id,name) VALUES(?,?,?,?)",
                ).bind(
                  tagId,
                  row.project_id,
                  row.publication_id,
                  tagName.slice(0, 100),
                ),
                env.DB.prepare(
                  "INSERT OR IGNORE INTO newsletter_subscription_tags(project_id,publication_id,subscription_id,tag_id) SELECT ?,?,s.id,t.id FROM newsletter_subscriptions s JOIN contacts c ON c.id=s.contact_id JOIN newsletter_tags t ON t.publication_id=s.publication_id WHERE s.publication_id=? AND c.email=? AND t.name=? AND s.status='subscribed'",
                ).bind(
                  row.project_id,
                  row.publication_id,
                  row.publication_id,
                  item.email,
                  tagName.slice(0, 100),
                ),
              );
            }
        }
      }
      await guarded(
        env,
        env.DB.prepare(
          "UPDATE newsletter_imports SET updated_at=? WHERE id=? AND lease_token=?",
        ).bind(nowIso(), importId, lease),
        [
          env.DB.prepare(
            "INSERT INTO newsletter_import_rows(import_id,row_number,outcome,error_code) VALUES(?,?,?,?)",
          ).bind(importId, item.index, outcome, reason),
          ...statements,
        ],
      );
    }
    const cursor = Math.min(data.rows.length, row.cursor + chunk.length);
    const counts = await all<{ outcome: string; n: number }>(
      env.DB.prepare(
        "SELECT outcome,COUNT(*) AS n FROM newsletter_import_rows WHERE import_id=? GROUP BY outcome",
      ).bind(importId),
    );
    const n = (s: string) => counts.find((c) => c.outcome === s)?.n ?? 0;
    let errorKey: string | null = null;
    if (cursor === data.rows.length) {
      const errors = await all<{ row_number: number; error_code: string }>(
        env.DB.prepare(
          "SELECT row_number,error_code FROM newsletter_import_rows WHERE import_id=? AND error_code IS NOT NULL ORDER BY row_number",
        ).bind(importId),
      );
      if (errors.length) {
        errorKey = `${row.file_r2_key}.errors.csv`;
        await env.PAYLOADS.put(
          errorKey,
          [
            "row,error",
            ...errors.map((e) =>
              [e.row_number + 2, e.error_code].map(csvCell).join(","),
            ),
          ].join("\n"),
        );
      }
    }
    await env.DB.prepare(
      "UPDATE newsletter_imports SET cursor=?,created=?,updated=?,skipped=?,failed=?,status=?,error_r2_key=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?",
    )
      .bind(
        cursor,
        n("created"),
        n("updated"),
        n("skipped"),
        n("failed"),
        cursor === data.rows.length ? "completed" : "processing",
        errorKey,
        nowIso(),
        importId,
        lease,
      )
      .run();
    return cursor < data.rows.length;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE newsletter_imports SET lease_token=NULL,lease_until=NULL,last_error=?,updated_at=? WHERE id=? AND lease_token=?",
    )
      .bind(String(error).slice(0, 500), nowIso(), importId, lease)
      .run();
    throw error;
  }
}
export async function exportSubscribers(
  env: Env,
  project: ProjectRow,
  id: string,
  filter: NewsletterFilter = {},
) {
  await requirePublication(env, project.id, id);
  const f = filterSql(filter);
  const rows = await all<Record<string, unknown>>(
    env.DB.prepare(
      `${SUB_SELECT} WHERE s.publication_id=? AND s.project_id=?${f.where.length ? ` AND ${f.where.join(" AND ")}` : ""} ORDER BY s.id LIMIT 10001`,
    ).bind(id, project.id, ...f.args),
  );
  if (rows.length > 10000)
    throw ApiError.validation(
      "export_too_large",
      "Use filters to export at most 10,000 subscribers.",
    );
  const headers = [
    "email",
    "first_name",
    "last_name",
    "status",
    "source",
    "consent_source",
    "consent_at",
    "created_at",
  ];
  return {
    csv: [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")),
    ].join("\r\n"),
  };
}
