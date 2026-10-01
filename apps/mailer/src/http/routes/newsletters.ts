import { Hono } from "hono";
import { z } from "zod";
import {
  NewsletterFilter,
  NewsletterTimezone,
  type NewsletterPageQuery,
  type NewsletterPublishInput,
  type NewsletterImportMapping,
  type NewsletterConsent,
} from "@flaresend/types";
import type { AppContext, AppEnv } from "../context";
import { ApiError } from "../errors";
import * as publications from "../../core/newsletters/publications";
import * as posts from "../../core/newsletters/posts";
import * as subs from "../../core/newsletters/subscriptions";
import * as imports from "../../core/newsletters/imports";
import * as assets from "../../core/newsletters/assets";
import { capabilities } from "../../core/newsletters/policy";
import * as delivery from "../../core/newsletters/delivery";
import { aiRun, aiStream } from "../../core/newsletters/ai";
import { parse } from "../../core/newsletters/shared";
import { reports } from "../../core/newsletters/reports";

// Bound bytes before decoding JSON, including chunked uploads without Content-Length.
async function body(c: AppContext): Promise<Record<string, unknown>> {
  const reader = c.req.raw.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 10 * 1024 * 1024) {
      await reader.cancel();
      throw ApiError.validation(
        "body_too_large",
        "The request exceeds 10 MiB.",
      );
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes) || "{}");
    return parse(z.record(z.unknown()), raw);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.validation(
      "invalid_body",
      "The request body must contain JSON.",
    );
  }
}
const revision = (v: unknown) => parse(z.number().int().positive(), v);
function query(c: AppContext): NewsletterPageQuery {
  const f = c.req.query("filter");
  let filter: unknown;
  try {
    filter = f ? JSON.parse(f) : undefined;
  } catch {
    throw ApiError.validation(
      "invalid_filter",
      "The filter must contain JSON.",
    );
  }
  return {
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
    state: c.req.query("state"),
    filter: filter ? parse(NewsletterFilter, filter) : undefined,
  };
}
const publication = (c: AppContext) => c.req.param("id")!;
const pid = (c: AppContext) => c.req.param("postId")!;
const sid = (c: AppContext) => c.req.param("subscriptionId")!;
const key = (c: AppContext, b: Record<string, unknown>) =>
  c.req.header("Idempotency-Key") || String(b.idempotencyKey ?? "");

export const newsletterRoutes = new Hono<AppEnv>()
  .get("/newsletter-capabilities", async (c) =>
    c.json(
      await capabilities(c.env, c.var.project, c.req.query("publicationId")),
    ),
  )
  .get("/publications", async (c) =>
    c.json(await publications.listPublications(c.env, c.var.project, query(c))),
  )
  .post("/publications", async (c) =>
    c.json(
      await publications.createPublication(c.env, c.var.project, await body(c)),
      201,
    ),
  )
  .get("/publications/:id", async (c) =>
    c.json(
      await publications.getPublication(c.env, c.var.project, publication(c)),
    ),
  )
  .patch("/publications/:id", async (c) =>
    c.json(
      await publications.updatePublication(
        c.env,
        c.var.project,
        publication(c),
        await body(c),
      ),
    ),
  )
  .post("/publications/:id/archive", async (c) => {
    const b = await body(c);
    return c.json(
      await publications.archivePublication(
        c.env,
        c.var.project,
        publication(c),
        revision(b.expectedRevision),
      ),
    );
  })
  .post("/publications/:id/site/:command", async (c) => {
    const command = c.req.param("command");
    if (!["publish", "unpublish"].includes(command))
      throw ApiError.notFound(
        "route_not_found",
        "The operation was not found.",
      );
    const b = await body(c);
    return c.json(
      await publications.updatePublication(
        c.env,
        c.var.project,
        publication(c),
        {
          expectedRevision: revision(b.expectedRevision),
          siteEnabled: command === "publish",
        },
      ),
    );
  })
  .get("/publications/:id/posts", async (c) =>
    c.json(
      await posts.listPosts(c.env, c.var.project, publication(c), query(c)),
    ),
  )
  .post("/publications/:id/posts", async (c) =>
    c.json(
      await posts.createPost(
        c.env,
        c.var.project,
        publication(c),
        await body(c),
      ),
      201,
    ),
  )
  .get("/publications/:id/posts/:postId", async (c) =>
    c.json(await posts.getPost(c.env, c.var.project, publication(c), pid(c))),
  )
  .patch("/publications/:id/posts/:postId", async (c) =>
    c.json(
      await posts.updatePost(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        await body(c),
      ),
    ),
  )
  .delete("/publications/:id/posts/:postId", async (c) => {
    const b = await body(c);
    return c.json(
      await posts.postCommand(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        "delete",
        revision(b.expectedRevision),
      ),
    );
  })
  .post("/publications/:id/posts/:postId/preview", async (c) => {
    const b = await body(c);
    return c.json(
      await posts.previewPost(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        parse(z.enum(["web", "email", "text"]), b.target ?? "email"),
        b.subscriptionId === undefined
          ? undefined
          : parse(z.string(), b.subscriptionId),
      ),
    );
  })
  .post("/publications/:id/posts/:postId/review", async (c) => {
    const b = await body(c);
    return c.json(
      await posts.reviewPost(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        parse(NewsletterFilter, b.filter ?? {}),
      ),
    );
  })
  .post("/publications/:id/posts/:postId/publish-web", async (c) => {
    const b = await body(c);
    const input = parse(
      z.object({
        expectedRevision: z.number().int().positive(),
        revisionId: z.string(),
        scheduledAt: z.string().datetime({ offset: true }).optional(),
        timezone: NewsletterTimezone.optional(),
      }),
      b,
    );
    return c.json(
      await posts.publishWeb(c.env, c.var.project, publication(c), pid(c), {
        ...input,
        idempotencyKey: key(c, b),
      } satisfies NewsletterPublishInput),
    );
  })
  .post("/publications/:id/posts/:postId/send-email", async (c) => {
    const b = await body(c);
    return c.json(
      await delivery.createRun(c.env, c.var.project, publication(c), pid(c), {
        ...b,
        idempotencyKey: key(c, b),
      }),
      201,
    );
  })
  .post("/publications/:id/posts/:postId/send-test", async (c) =>
    c.json(
      await delivery.sendTest(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        await body(c),
      ),
    ),
  )
  .post("/publications/:id/posts/:postId/:command", async (c) => {
    const command = c.req.param("command");
    const op = parse(
      z.enum(["duplicate", "archive", "unpublish-web", "cancel-web-schedule"]),
      command,
    );
    const b = await body(c);
    return c.json(
      await posts.postCommand(
        c.env,
        c.var.project,
        publication(c),
        pid(c),
        op,
        revision(b.expectedRevision),
      ),
    );
  })
  .get("/publications/:id/subscribers", async (c) =>
    c.json(
      await subs.listSubscribers(
        c.env,
        c.var.project,
        publication(c),
        query(c),
      ),
    ),
  )
  .get("/publications/:id/subscribers/:subscriptionId", async (c) =>
    c.json(
      await subs.getSubscriber(c.env, c.var.project, publication(c), sid(c)),
    ),
  )
  .patch("/publications/:id/subscribers/:subscriptionId", async (c) =>
    c.json(
      await subs.updateSubscriber(
        c.env,
        c.var.project,
        publication(c),
        sid(c),
        await body(c),
      ),
    ),
  )
  .post(
    "/publications/:id/subscribers/:subscriptionId/unsubscribe",
    async (c) => {
      const b = await body(c);
      return c.json(
        await subs.unsubscribe(
          c.env,
          c.var.project,
          publication(c),
          sid(c),
          revision(b.expectedRevision),
        ),
      );
    },
  )
  .delete("/publications/:id/subscribers/:subscriptionId", async (c) => {
    const b = await body(c);
    return c.json(
      await subs.deleteSubscriber(
        c.env,
        c.var.project,
        publication(c),
        sid(c),
        revision(b.expectedRevision),
      ),
    );
  })
  .get("/publications/:id/tags", async (c) =>
    c.json({ data: await subs.listTags(c.env, c.var.project, publication(c)) }),
  )
  .post("/publications/:id/tags", async (c) => {
    const b = await body(c);
    return c.json(
      await subs.createTag(
        c.env,
        c.var.project,
        publication(c),
        parse(z.string(), b.name),
      ),
    );
  })
  .delete("/publications/:id/tags/:tagId", async (c) =>
    c.json(
      await subs.deleteTag(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("tagId"),
      ),
    ),
  )
  .post("/publications/:id/assets", async (c) => {
    const b = await body(c);
    return c.json(
      await assets.uploadAsset(
        c.env,
        c.var.project,
        publication(c),
        parse(
          z.object({ base64: z.string(), mimeType: z.string() }).strict(),
          b,
        ),
      ),
      201,
    );
  })
  .get("/publications/:id/assets/:assetId", async (c) =>
    c.json(
      await assets.getAsset(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("assetId"),
      ),
    ),
  )
  .post("/publications/:id/imports/preview", async (c) =>
    c.json(
      await imports.previewImport(
        c.env,
        c.var.project,
        publication(c),
        (await body(c)) as {
          csv: string;
          mapping?: NewsletterImportMapping;
          fileId?: string;
        },
      ),
    ),
  )
  .post("/publications/:id/imports/from-audience", async (c) => {
    const b = await body(c);
    return c.json(
      await imports.importAudience(c.env, c.var.project, publication(c), {
        ...b,
        idempotencyKey: key(c, b),
      } as {
        audienceId: string;
        consent: NewsletterConsent;
        idempotencyKey: string;
      }),
    );
  })
  .post("/publications/:id/imports", async (c) => {
    const b = await body(c);
    return c.json(
      await imports.startImport(c.env, c.var.project, publication(c), {
        ...b,
        idempotencyKey: key(c, b),
      } as Parameters<typeof imports.startImport>[3]),
      202,
    );
  })
  .get("/publications/:id/imports/:importId", async (c) =>
    c.json(
      await imports.getImport(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("importId"),
      ),
    ),
  )
  .post("/publications/:id/export", async (c) => {
    const b = await body(c);
    return c.json(
      await imports.exportSubscribers(
        c.env,
        c.var.project,
        publication(c),
        parse(NewsletterFilter, b.filter ?? {}),
      ),
    );
  })
  .get("/publications/:id/reports", async (c) =>
    c.json(
      await reports(c.env, c.var.project, publication(c), {
        since: c.req.query("since"),
        until: c.req.query("until"),
      }),
    ),
  )
  .get("/publications/:id/email-runs", async (c) =>
    c.json(
      await delivery.listRuns(c.env, c.var.project, publication(c), {
        postId: c.req.query("postId"),
        limit: c.req.query("limit"),
        cursor: c.req.query("cursor"),
      }),
    ),
  )
  .get("/publications/:id/email-runs/:runId", async (c) =>
    c.json(
      await delivery.getRun(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("runId"),
      ),
    ),
  )
  .get("/publications/:id/email-runs/:runId/recipients", async (c) =>
    c.json(
      await delivery.listRunRecipients(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("runId"),
        {
          status: c.req.query("status"),
          q: c.req.query("q"),
          limit: c.req.query("limit"),
          cursor: c.req.query("cursor"),
        },
      ),
    ),
  )
  .post("/publications/:id/email-runs/:runId/cancel", async (c) =>
    c.json(
      await delivery.cancelRun(
        c.env,
        c.var.project,
        publication(c),
        c.req.param("runId"),
      ),
    ),
  )
  .post("/publications/:id/ai", async (c) =>
    c.json(await aiRun(c.env, c.var.project, publication(c), await body(c))),
  )
  .post("/publications/:id/ai/stream", async (c) =>
    new Response(
      await aiStream(c.env, c.var.project, publication(c), await body(c)),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    ),
  );
