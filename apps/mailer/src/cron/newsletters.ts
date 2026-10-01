import {
  all,
  one,
  guarded,
  revision,
  type PostRow,
} from "../core/newsletters/shared";
import { nowIso } from "../core/ids";
import { advanceRuns } from "../core/newsletters/delivery";

export async function runNewsletterJobs(env: Env, time = Date.now()) {
  const now = new Date(time).toISOString();
  const jobs = await all<{ id: string; entity_id: string; generation: number }>(
    env.DB.prepare(
      "SELECT j.id,j.entity_id,j.generation FROM newsletter_jobs j JOIN publications p ON p.id=j.publication_id JOIN projects pr ON pr.id=j.project_id WHERE j.kind='web' AND j.status='pending' AND j.due_at<=? AND p.status='active' AND pr.disabled_at IS NULL ORDER BY j.due_at LIMIT 50",
    ).bind(now),
  );
  for (const job of jobs) {
    const post = await one<PostRow>(
      env.DB.prepare(
        "SELECT * FROM newsletter_posts WHERE id=? AND revision=? AND web_status='scheduled'",
      ).bind(job.entity_id, job.generation),
    );
    if (!post?.web_scheduled_revision_id) {
      await env.DB.prepare(
        "UPDATE newsletter_jobs SET status='canceled' WHERE id=?",
      )
        .bind(job.id)
        .run();
      continue;
    }
    try {
      await revision(env, post, post.web_scheduled_revision_id);
      await guarded(
        env,
        env.DB.prepare(
          "UPDATE newsletter_posts SET public_revision_id=web_scheduled_revision_id,web_status='published',published_at=COALESCE(published_at,?),web_scheduled_at=NULL,web_scheduled_revision_id=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND web_status='scheduled' AND EXISTS(SELECT 1 FROM publications p JOIN projects pr ON pr.id=p.project_id WHERE p.id=newsletter_posts.publication_id AND p.status='active' AND pr.disabled_at IS NULL)",
        ).bind(now, now, post.id, job.generation),
        [
          env.DB.prepare(
            "UPDATE newsletter_jobs SET status='completed',updated_at=? WHERE id=?",
          ).bind(now, job.id),
        ],
      );
    } catch (err) {
      if (!String(err).includes("revision_conflict"))
        console.error("newsletter web job failed", {
          jobId: job.id,
          message: String(err),
        });
    }
  }
  await advanceRuns(env, time);
  const imports = await all<{ id: string }>(
    env.DB.prepare(
      "SELECT id FROM newsletter_imports WHERE status IN ('queued','processing') AND (lease_until IS NULL OR lease_until<?) LIMIT 10",
    ).bind(now),
  );
  for (const item of imports)
    await env.NEWSLETTER_QUEUE.send({
      kind: "newsletter-import",
      importId: item.id,
    });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM newsletter_tokens WHERE expires_at<?").bind(
      now,
    ),
    env.DB.prepare("DELETE FROM newsletter_commands WHERE created_at<?").bind(
      new Date(time - 86400_000).toISOString(),
    ),
    env.DB.prepare("DELETE FROM newsletter_rate_counters WHERE window<?").bind(
      new Date(time - 86400_000).toISOString().slice(0, 13),
    ),
  ]);
  const files = await all<{ id: string; r2_key: string }>(
    env.DB.prepare(
      "SELECT id,r2_key FROM newsletter_import_files WHERE created_at<? LIMIT 50",
    ).bind(new Date(time - 7 * 86400_000).toISOString()),
  );
  for (const file of files) {
    const busy = await one(
      env.DB.prepare(
        "SELECT id FROM newsletter_imports WHERE file_r2_key=? AND status IN ('queued','processing')",
      ).bind(file.r2_key),
    );
    if (!busy) {
      await env.PAYLOADS.delete([file.r2_key, `${file.r2_key}.errors.csv`]);
      await env.DB.prepare("DELETE FROM newsletter_import_files WHERE id=?")
        .bind(file.id)
        .run();
    }
  }
  // Bound orphan inspection. Retain the cursor between ticks to visit the whole prefix.
  const state = await one<{ result_json: string }>(
    env.DB.prepare(
      "SELECT result_json FROM newsletter_commands WHERE project_id='_maintenance' AND idempotency_key='r2_cursor'",
    ),
  );
  const cursor = state?.result_json || undefined;
  const objects = await env.PAYLOADS.list({
    prefix: "newsletters/",
    limit: 100,
    ...(cursor ? { cursor } : {}),
  });
  for (const object of objects.objects) {
    if (
      object.uploaded.getTime() > time - 86400_000 ||
      !object.key.includes("/revisions/")
    )
      continue;
    const referenced = await one(
      env.DB.prepare(
        "SELECT id FROM newsletter_post_revisions WHERE document_r2_key=?",
      ).bind(object.key),
    );
    if (!referenced) await env.PAYLOADS.delete(object.key);
  }
  await env.DB.prepare(
    "INSERT INTO newsletter_commands(project_id,idempotency_key,request_hash,result_json,created_at) VALUES('_maintenance','r2_cursor','',?,?) ON CONFLICT(project_id,idempotency_key) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at",
  )
    .bind(objects.truncated ? objects.cursor : "", now)
    .run();
}
