import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  env,
  setupProject,
  call,
  json,
  ADMIN_KEY,
  makeBatch,
  makeMessage,
  type TestProject,
} from "../helpers";
import * as pubs from "../../src/core/newsletters/publications";
import * as posts from "../../src/core/newsletters/posts";
import * as imports from "../../src/core/newsletters/imports";
import * as subs from "../../src/core/newsletters/subscriptions";
import { capabilities } from "../../src/core/newsletters/policy";
import { sendEmail } from "../../src/core/send";
import { emailProvider } from "../../src/core/provider";
import worker from "../../src/index";
import { runNewsletterJobs } from "../../src/cron/newsletters";
import * as delivery from "../../src/core/newsletters/delivery";
import { removeContact } from "../../src/core/contacts";
import { queueOps } from "../../src/queue/producer";
import { getPayload } from "../../src/storage/payloads";
import * as domains from "../../src/core/domains";
import { requirePublication } from "../../src/core/newsletters/shared";
import { sha256Hex } from "../../src/core/keys";
import { renderNewsletter } from "../../src/core/newsletters/render";
import * as assets from "../../src/core/newsletters/assets";
const doc = {
  schemaVersion: 1 as const,
  blocks: [
    {
      id: "a",
      type: "paragraph" as const,
      content: [
        { type: "text" as const, text: "Hello <script>alert(1)</script>" },
        {
          type: "personalization" as const,
          field: "firstName" as const,
          fallback: "reader",
        },
      ],
    },
  ],
};
let p: TestProject, pub: Awaited<ReturnType<typeof pubs.createPublication>>;
beforeEach(async () => {
  p = await setupProject();
  pub = await pubs.createPublication(env, p.project, {
    name: "The Dispatch",
    slug: "dispatch",
  });
});
async function subscribed(csv = "email,firstName\nreader@example.com,Ada") {
  const preview = await imports.previewImport(env, p.project, pub.id, {
    csv,
    mapping: { email: "email", firstName: "firstName" },
  });
  const job = await imports.startImport(env, p.project, pub.id, {
    fileId: preview.fileId,
    previewToken: preview.previewToken,
    mapping: { email: "email", firstName: "firstName" },
    consent: { source: "Test opt-in", at: new Date().toISOString() },
    idempotencyKey: crypto.randomUUID(),
  });
  await imports.processImport(env, job.id);
  return (await subs.listSubscribers(env, p.project, pub.id)).data;
}
let nlQueue: ReturnType<typeof vi.fn>;
beforeEach(() => {
  nlQueue = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(env.NEWSLETTER_QUEUE, "send").mockImplementation(nlQueue as never);
  return () => vi.restoreAllMocks();
});
/** A verified sender and a public website: the technical requirements for sending. */
async function ready() {
  vi.spyOn(domains, "listDomainRecords").mockResolvedValue([
    {
      domain: "acme.com",
      verification: "onboarded",
      checkedAt: new Date().toISOString(),
      defaultFrom: "hello@acme.com",
    },
  ] as never);
  vi.spyOn(queueOps, "send").mockResolvedValue();
  pub = await pubs.updatePublication(env, p.project, pub.id, {
    expectedRevision: pub.revision,
    fromAddress: "hello@acme.com",
    siteEnabled: true,
  });
}
describe("newsletter isolation and drafts", () => {
  it("keeps draft assets private and preserves the published logo reference", async () => {
    const asset = await assets.uploadAsset(env, p.project, pub.id, {
      mimeType: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5VkAAAAASUVORK5CYII=",
    });
    expect((await call("GET", `/n/assets/${asset.id}`)).status).toBe(404);
    const other = await setupProject();
    await expect(
      assets.getAsset(env, other.project, pub.id, asset.id),
    ).rejects.toMatchObject({ code: "publication_not_found" });
    pub = await pubs.updatePublication(env, p.project, pub.id, {
      expectedRevision: pub.revision,
      siteEnabled: true,
      logoAssetId: asset.id,
    });
    const post = await posts.createPost(env, p.project, pub.id, {
      title: "Logo snapshot",
      document: doc,
    });
    await posts.publishWeb(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      revisionId: post.draftRevisionId,
      idempotencyKey: "logo-snapshot",
    });
    pub = await pubs.updatePublication(env, p.project, pub.id, {
      expectedRevision: pub.revision,
      logoAssetId: null,
    });
    expect((await call("GET", `/n/assets/${asset.id}`)).status).toBe(200);
    expect(
      (await posts.previewPost(env, p.project, pub.id, post.id, "web")).html,
    ).toContain(`newsletter-asset:${asset.id}`);
  });
  it("previews the same frozen identity and layout as the published revision", async () => {
    const post = await posts.createPost(env, p.project, pub.id, {
      title: "Snapshot",
      document: doc,
    });
    const original = await posts.previewPost(
      env,
      p.project,
      pub.id,
      post.id,
      "web",
    );
    pub = await pubs.updatePublication(env, p.project, pub.id, {
      expectedRevision: pub.revision,
      name: "New identity",
      theme: { layout: "announcement", font: "serif", accent: "#334455" },
      siteEnabled: true,
    });
    expect(
      await posts.previewPost(env, p.project, pub.id, post.id, "web"),
    ).toEqual(original);
    await posts.publishWeb(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      revisionId: post.draftRevisionId,
      idempotencyKey: "snapshot-theme",
    });
    const page = await call("GET", `/n/${p.slug}/${pub.slug}/p/${post.slug}`);
    expect(await page.text()).toContain("The Dispatch");
  });
  it("renders distinct layouts and an owned logo", () => {
    const base = {
      title: "Title",
      subtitle: "Summary",
      previewText: "Preview",
      publicationName: "Dispatch",
      postalAddress: "",
      target: "email" as const,
      assetUrl: (id: string) => `https://example.com/${id}`,
      logoAssetId: "logo",
    };
    const render = (layout: "letter" | "digest" | "announcement") =>
      renderNewsletter(doc, {
        ...base,
        theme: { layout, accent: "#ff5500", font: "sans" },
      }).html;
    expect(render("digest")).toContain("border-bottom:3px solid #ff5500");
    expect(render("announcement")).toContain("text-align:center");
    expect(render("letter")).not.toContain("border-bottom:3px");
    expect(render("letter")).toContain('src="https://example.com/logo"');
  });
  it("reports only technical blockers for email", async () => {
    expect(await capabilities(env, p.project, pub.id)).toMatchObject({
      email: false,
      emailBlocker: "sender_missing",
    });
    await ready();
    expect(await capabilities(env, p.project, pub.id)).toMatchObject({
      email: true,
      emailBlocker: null,
    });
  });
  it("rejects another project's publication", async () => {
    const other = await setupProject();
    await expect(
      pubs.getPublication(env, other.project, pub.id),
    ).rejects.toMatchObject({ code: "publication_not_found" });
  });
  it("rejects a stale draft without a partial database write", async () => {
    const post = await posts.createPost(env, p.project, pub.id, {
      title: "First",
      document: doc,
    });
    const fresh = await posts.updatePost(env, p.project, pub.id, post.id, {
      expectedRevision: 1,
      title: "Second",
    });
    await expect(
      posts.updatePost(env, p.project, pub.id, post.id, {
        expectedRevision: 1,
        title: "Lost",
      }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect((await posts.getPost(env, p.project, pub.id, post.id)).title).toBe(
      "Second",
    );
    expect(fresh.revision).toBe(2);
  });
  it("escapes content in previews", async () => {
    const post = await posts.createPost(env, p.project, pub.id, {
      title: "Article",
      document: doc,
    });
    const preview = await posts.previewPost(
      env,
      p.project,
      pub.id,
      post.id,
      "email",
    );
    expect(preview.html).not.toContain("<script>");
    expect(preview.html).toContain("&lt;script&gt;");
    expect(preview.text).toContain("Ada");
  });
});
describe("public articles", () => {
  it("keeps the published version separate from draft edits", async () => {
    pub = await pubs.updatePublication(env, p.project, pub.id, {
      expectedRevision: pub.revision,
      siteEnabled: true,
    });
    let post = await posts.createPost(env, p.project, pub.id, {
      title: "Published title",
      document: doc,
    });
    const input = {
      expectedRevision: post.revision,
      revisionId: post.draftRevisionId,
      idempotencyKey: "publish-one",
    };
    post = await posts.publishWeb(env, p.project, pub.id, post.id, input);
    expect(
      (await posts.publishWeb(env, p.project, pub.id, post.id, input)).revision,
    ).toBe(post.revision);
    await posts.updatePost(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      title: "Private revision",
    });
    const response = await call(
      "GET",
      `/n/${p.slug}/${pub.slug}/p/${post.slug}`,
    );
    const html = await response.text();
    expect(html).toContain("Published title");
    expect(html).not.toContain("Private revision");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
  });
  it("publishes a due web schedule once", async () => {
    pub = await pubs.updatePublication(env, p.project, pub.id, {
      expectedRevision: 1,
      siteEnabled: true,
    });
    const post = await posts.createPost(env, p.project, pub.id, {
      title: "Scheduled",
      document: doc,
    });
    const scheduled = await posts.publishWeb(env, p.project, pub.id, post.id, {
      expectedRevision: 1,
      revisionId: post.draftRevisionId,
      idempotencyKey: "schedule",
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      timezone: "Africa/Johannesburg",
    });
    await expect(
      posts.updatePost(env, p.project, pub.id, post.id, {
        expectedRevision: scheduled.revision,
        title: "Blocked",
      }),
    ).rejects.toMatchObject({ code: "post_scheduled" });
    await env.DB.prepare(
      "UPDATE newsletter_jobs SET due_at='2020-01-01T00:00:00.000Z' WHERE entity_id=?",
    )
      .bind(post.id)
      .run();
    await runNewsletterJobs(env);
    await runNewsletterJobs(env);
    expect(
      (await posts.getPost(env, p.project, pub.id, post.id)).webStatus,
    ).toBe("published");
  });
});
describe("subscriber records", () => {
  it("resumes an import across chunks without duplicate subscriptions or activity", async () => {
    const preview = await imports.previewImport(env, p.project, pub.id, {
      csv: [
        "email",
        ...Array.from({ length: 61 }, (_, i) => `reader${i}@example.com`),
      ].join("\n"),
      mapping: { email: "email" },
    });
    const job = await imports.startImport(env, p.project, pub.id, {
      fileId: preview.fileId,
      mapping: { email: "email" },
      previewToken: preview.previewToken,
      consent: { source: "Test opt-in", at: new Date().toISOString() },
      idempotencyKey: "chunk-test",
    });
    expect(await imports.processImport(env, job.id)).toBe(true);
    expect(await imports.processImport(env, job.id)).toBe(false);
    expect(await imports.processImport(env, job.id)).toBe(false);
    expect(
      await imports.getImport(env, p.project, pub.id, job.id),
    ).toMatchObject({ status: "completed", created: 61 });
    expect(
      (await subs.listSubscribers(env, p.project, pub.id, { limit: 100 })).data,
    ).toHaveLength(61);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM newsletter_subscription_events WHERE publication_id=?",
      )
        .bind(pub.id)
        .first<number>("n"),
    ).toBe(61);
  });
  it("replays an audience import and rejects a changed request after a receipt loss", async () => {
    const [subscriber] = await subscribed();
    const audience = await json(
      call("POST", "/v1/audiences", {
        key: p.liveKey,
        body: { name: "Readers" },
      }),
    );
    await call("POST", `/v1/audiences/${audience.id}/contacts`, {
      key: p.liveKey,
      body: { contactIds: [subscriber!.contactId] },
    });
    const input = {
      audienceId: audience.id,
      consent: { source: "Test opt-in", at: new Date().toISOString() },
      idempotencyKey: "audience-replay",
    };
    const first = await imports.importAudience(env, p.project, pub.id, input);
    await env.DB.prepare("DELETE FROM newsletter_commands WHERE project_id=?")
      .bind(p.project.id)
      .run();
    expect(
      (await imports.importAudience(env, p.project, pub.id, input)).id,
    ).toBe(first.id);
    await expect(
      imports.importAudience(env, p.project, pub.id, {
        ...input,
        consent: { ...input.consent, source: "Different consent" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_payload_mismatch" });
  });
  it("rechecks global opt-outs and suppressions before confirmation", async () => {
    const domain = vi.spyOn(domains, "listDomainRecords").mockResolvedValue([
      {
        domain: "acme.com",
        verification: "onboarded",
        checkedAt: new Date().toISOString(),
        defaultFrom: "hello@acme.com",
      },
    ]);
    const queue = vi.spyOn(queueOps, "send").mockResolvedValue();
    try {
      pub = await pubs.updatePublication(env, p.project, pub.id, {
        expectedRevision: 1,
        fromAddress: "hello@acme.com",
        siteEnabled: true,
        formEnabled: true,
      });
      await subs.requestSubscription(
        env,
        p.project,
        await requirePublication(env, p.project.id, pub.id),
        { email: "blocked@example.com", consent: "yes" },
        "127.0.0.1",
      );
      const email = await env.DB.prepare(
        "SELECT id FROM emails WHERE project_id=?",
      )
        .bind(p.project.id)
        .first<string>("id");
      const payload = await getPayload(env, email!);
      const token = /\/n\/confirm\/([A-Za-z0-9_-]+)/.exec(payload!.text!)![1]!;
      const hash = await sha256Hex(token);
      expect(await subs.confirmationEligible(env, hash)).toBe(true);
      await env.DB.prepare(
        "UPDATE contacts SET unsubscribed=1 WHERE project_id=?",
      )
        .bind(p.project.id)
        .run();
      expect(await subs.confirmationEligible(env, hash)).toBe(false);
      expect(await subs.confirmSubscription(env, token)).toBe(false);
      await env.DB.prepare(
        "UPDATE contacts SET unsubscribed=0 WHERE project_id=?",
      )
        .bind(p.project.id)
        .run();
      await env.DB.prepare(
        "INSERT INTO suppressions(address,reason,created_at) VALUES(?,'manual',?)",
      )
        .bind("blocked@example.com", new Date().toISOString())
        .run();
      expect(await subs.confirmationEligible(env, hash)).toBe(false);
      expect(await subs.confirmSubscription(env, token)).toBe(false);
      expect(
        (await subs.listSubscribers(env, p.project, pub.id)).data[0]!.status,
      ).toBe("pending");
    } finally {
      domain.mockRestore();
      queue.mockRestore();
    }
  });
  it("sends only a fixed transactional confirmation and consumes its token once", async () => {
    const domain = vi.spyOn(domains, "listDomainRecords").mockResolvedValue([
      {
        domain: "acme.com",
        verification: "onboarded",
        checkedAt: new Date().toISOString(),
        defaultFrom: "hello@acme.com",
      },
    ]);
    const queue = vi.spyOn(queueOps, "send").mockResolvedValue();
    try {
      pub = await pubs.updatePublication(env, p.project, pub.id, {
        expectedRevision: 1,
        fromAddress: "hello@acme.com",
        siteEnabled: true,
        formEnabled: true,
      });
      const row = await requirePublication(env, p.project.id, pub.id);
      await subs.requestSubscription(
        env,
        p.project,
        row,
        { email: "confirm@example.com", consent: "yes", firstName: "Reader" },
        "127.0.0.1",
      );
      const email = await env.DB.prepare(
        "SELECT id,purpose,track_opens,track_clicks FROM emails WHERE project_id=?",
      )
        .bind(p.project.id)
        .first<{
          id: string;
          purpose: string;
          track_opens: number;
          track_clicks: number;
        }>();
      expect(email).toMatchObject({
        purpose: "subscription_confirmation",
        track_opens: 0,
        track_clicks: 0,
      });
      const payload = await getPayload(env, email!.id),
        token = /\/n\/confirm\/([A-Za-z0-9_-]+)/.exec(payload!.text!)![1]!;
      expect(payload!.html).not.toContain("Hello &lt;script");
      expect(queue).toHaveBeenCalledTimes(1);
      await call("GET", `/n/confirm/${token}`);
      expect(
        (await subs.listSubscribers(env, p.project, pub.id)).data[0]!.status,
      ).toBe("pending");
      expect(await subs.confirmSubscription(env, token)).toBe(true);
      expect(await subs.confirmSubscription(env, token)).toBe(false);
      expect(
        (await subs.listSubscribers(env, p.project, pub.id)).data[0]!.status,
      ).toBe("subscribed");
      expect(await subs.confirmationEligible(env, await sha256Hex(token))).toBe(
        false,
      );
    } finally {
      domain.mockRestore();
      queue.mockRestore();
    }
  });
  it("blocks a confirmation after a project pause and prevents origin forgery", async () => {
    expect(
      (
        await call("POST", "/n/confirm/invalid", {
          headers: { Origin: "https://another.test" },
        })
      ).status,
    ).toBe(403);
    const domain = vi.spyOn(domains, "listDomainRecords").mockResolvedValue([
        {
          domain: "acme.com",
          verification: "onboarded",
          checkedAt: new Date().toISOString(),
          defaultFrom: "hello@acme.com",
        },
      ]),
      queue = vi.spyOn(queueOps, "send").mockResolvedValue();
    try {
      pub = await pubs.updatePublication(env, p.project, pub.id, {
        expectedRevision: 1,
        fromAddress: "hello@acme.com",
        siteEnabled: true,
        formEnabled: true,
      });
      await subs.requestSubscription(
        env,
        p.project,
        await requirePublication(env, p.project.id, pub.id),
        { email: "pause@example.com", consent: "yes" },
        "127.0.0.1",
      );
      const hash = await env.DB.prepare(
        "SELECT token_hash FROM newsletter_tokens WHERE publication_id=?",
      )
        .bind(pub.id)
        .first<string>("token_hash");
      expect(await subs.confirmationEligible(env, hash!)).toBe(true);
      await env.DB.prepare("UPDATE projects SET disabled_at=? WHERE id=?")
        .bind(new Date().toISOString(), p.project.id)
        .run();
      expect(await subs.confirmationEligible(env, hash!)).toBe(false);
    } finally {
      domain.mockRestore();
      queue.mockRestore();
    }
  });
  it("imports robust CSV data and preserves opt-outs", async () => {
    let rows = await subscribed(
      '\ufeffemail,firstName\nreader@example.com,"Ada, Test"\ninvalid,No\nreader@example.com,Duplicate',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.firstName).toBe("Ada, Test");
    const s = rows[0]!;
    await subs.unsubscribe(env, p.project, pub.id, s.id, s.revision);
    await subscribed();
    rows = (await subs.listSubscribers(env, p.project, pub.id)).data;
    expect(rows[0]!.status).toBe("unsubscribed");
  });
  it("keeps a deletion tombstone through a later import", async () => {
    const [s] = await subscribed();
    await subs.deleteSubscriber(env, p.project, pub.id, s!.id, s!.revision);
    expect(await subscribed()).toHaveLength(0);
  });
  it("keeps global contact deletion protected", async () => {
    const [s] = await subscribed();
    await removeContact(env, p.project.id, s!.contactId);
    expect(await subscribed()).toHaveLength(0);
  });
  it("uses a publication-specific unsubscribe token and GET does not mutate", async () => {
    const [s] = await subscribed();
    const token = await subs.unsubscribeToken(env, pub.id, s!.id);
    expect((await call("GET", `/n/u/${token}`)).status).toBe(200);
    expect(
      (await subs.getSubscriber(env, p.project, pub.id, s!.id)).status,
    ).toBe("subscribed");
    expect((await call("POST", `/n/u/${token}`)).status).toBe(200);
    expect((await call("POST", `/n/u/${token}`)).status).toBe(200);
    expect(
      (await subs.getSubscriber(env, p.project, pub.id, s!.id)).status,
    ).toBe("unsubscribed");
  });
  it("filters and exports the same subscriber set", async () => {
    await subscribed("email,firstName\na@example.com,Alice\nb@example.com,Bob");
    const filter = { q: "Alice" };
    const list = await subs.listSubscribers(env, p.project, pub.id, { filter });
    expect(list.data).toHaveLength(1);
    const csv = (
      await imports.exportSubscribers(env, p.project, pub.id, filter)
    ).csv;
    expect(csv).toContain("a@example.com");
    expect(csv).not.toContain("b@example.com");
  });
});
describe("newsletter email delivery", () => {
  async function draft(title = "Snapshot") {
    return posts.createPost(env, p.project, pub.id, { title, document: doc });
  }
  function send(
    post: Awaited<ReturnType<typeof draft>>,
    extra: Record<string, unknown> = {},
  ) {
    return delivery.createRun(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      revisionId: post.draftRevisionId,
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    });
  }
  async function drain(runId: string) {
    for (let i = 0; i < 10; i++) {
      const r = await delivery.processRun(env, runId);
      if (r.state !== "more") return r;
    }
    throw new Error("run did not finish");
  }
  async function runEmails(runId: string) {
    return (
      await env.DB.prepare(
        "SELECT id,purpose,to_addresses FROM emails WHERE newsletter_run_id=? ORDER BY to_addresses",
      )
        .bind(runId)
        .all<{ id: string; purpose: string; to_addresses: string }>()
    ).results;
  }
  const runCount = async () =>
    (
      await env.DB.prepare(
        "SELECT count(*) AS n FROM newsletter_email_runs WHERE project_id=?",
      )
        .bind(p.project.id)
        .first<{ n: number }>()
    )?.n;

  it("refuses to send without a verified sender", async () => {
    await subscribed();
    await expect(send(await draft())).rejects.toMatchObject({
      code: "newsletter_sender_not_ready",
    });
  });
  it("sends a frozen revision to every eligible subscriber once", async () => {
    await ready();
    await subscribed("email,firstName\nada@example.com,Ada\nbob@example.com,Bob");
    const post = await draft();
    const run = await send(post);
    expect(run).toMatchObject({ status: "sending", total: 2 });
    expect(nlQueue).toHaveBeenCalledWith({ kind: "newsletter-run", runId: run.id });
    // Edits after the run starts do not change what goes out.
    await posts.updatePost(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      title: "New draft",
    });
    expect(await drain(run.id)).toEqual({ state: "done" });
    expect(await delivery.processRun(env, run.id)).toEqual({ state: "done" });
    const emails = await runEmails(run.id);
    expect(emails).toHaveLength(2);
    expect(emails.every((e) => e.purpose === "newsletter")).toBe(true);
    const payload = (await getPayload(env, emails[0]!.id))!;
    expect(payload.subject).toBe("Snapshot");
    expect(payload.html).toContain("Ada");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(payload.headers["List-Unsubscribe"]).toContain("/n/u/");
    const detail = await delivery.getRun(env, p.project, pub.id, run.id);
    expect(detail).toMatchObject({ status: "sent", total: 2, processed: 2 });
    const listed = await posts.listPosts(env, p.project, pub.id);
    expect(listed.data[0]!.email).toMatchObject({ id: run.id, total: 2 });
  });
  it("returns the same run for a repeated request key", async () => {
    await ready();
    await subscribed();
    const post = await draft();
    const input = {
      expectedRevision: post.revision,
      revisionId: post.draftRevisionId,
      idempotencyKey: "same-key",
    };
    const first = await delivery.createRun(env, p.project, pub.id, post.id, input);
    const again = await delivery.createRun(env, p.project, pub.id, post.id, input);
    expect(again.id).toBe(first.id);
    await expect(
      delivery.createRun(env, p.project, pub.id, post.id, {
        ...input,
        filter: { q: "nobody" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_payload_mismatch" });
  });
  it("rejects a send when no subscriber matches", async () => {
    await ready();
    await expect(send(await draft())).rejects.toMatchObject({
      code: "no_recipients",
    });
    expect(await runCount()).toBe(0);
  });
  it("rejects content that changed after review", async () => {
    await ready();
    await subscribed();
    const post = await draft();
    await posts.updatePost(env, p.project, pub.id, post.id, {
      expectedRevision: post.revision,
      title: "Changed",
    });
    await expect(send(post)).rejects.toMatchObject({ code: "revision_conflict" });
  });
  it("skips a subscriber who unsubscribes before their turn", async () => {
    await ready();
    const [a] = await subscribed(
      "email,firstName\nada@example.com,Ada\nbob@example.com,Bob",
    );
    const run = await send(await draft());
    await subs.unsubscribe(env, p.project, pub.id, a!.id);
    await drain(run.id);
    expect(await runEmails(run.id)).toHaveLength(1);
    expect((await delivery.getRun(env, p.project, pub.id, run.id)).skipped).toBe(1);
  });
  it("waits for a scheduled time, then the cron starts it", async () => {
    await ready();
    await subscribed();
    const at = new Date(Date.now() + 3_600_000);
    const run = await send(await draft(), {
      scheduledAt: at.toISOString(),
      timezone: "Africa/Johannesburg",
    });
    expect(run).toMatchObject({
      status: "scheduled",
      scheduleTimezone: "Africa/Johannesburg",
    });
    expect(await delivery.processRun(env, run.id)).toEqual({ state: "done" });
    expect(await runEmails(run.id)).toHaveLength(0);
    await delivery.advanceRuns(env, Date.now());
    expect((await delivery.getRun(env, p.project, pub.id, run.id)).status).toBe(
      "scheduled",
    );
    await delivery.advanceRuns(env, at.getTime() + 1000);
    expect((await delivery.getRun(env, p.project, pub.id, run.id)).status).toBe(
      "sending",
    );
    await drain(run.id);
    expect(await runEmails(run.id)).toHaveLength(1);
  });
  it("cancels pending recipients", async () => {
    await ready();
    await subscribed();
    const run = await send(await draft());
    expect((await delivery.cancelRun(env, p.project, pub.id, run.id)).status).toBe(
      "canceled",
    );
    await drain(run.id);
    expect(await runEmails(run.id)).toHaveLength(0);
    await expect(
      delivery.cancelRun(env, p.project, pub.id, run.id),
    ).rejects.toMatchObject({ code: "not_cancelable" });
  });
  it("waits on the project's rate limit and sends each recipient once", async () => {
    await ready();
    await subscribed();
    const run = await send(await draft());
    const limiter = vi
      .spyOn(env.RATE_LIMITER, "limit")
      .mockResolvedValueOnce({ success: false });
    expect(await delivery.processRun(env, run.id)).toEqual({
      state: "wait",
      delaySeconds: 30,
    });
    expect(await runEmails(run.id)).toHaveLength(0);
    limiter.mockRestore();
    await drain(run.id);
    expect(await runEmails(run.id)).toHaveLength(1);
  });
  it("counts an unsubscribe from the email's own link", async () => {
    await ready();
    const [s] = await subscribed();
    const run = await send(await draft());
    await drain(run.id);
    const token = await subs.unsubscribeToken(env, pub.id, s!.id, run.id);
    expect((await call("POST", `/n/u/${token}`)).status).toBe(200);
    expect(
      (await delivery.getRun(env, p.project, pub.id, run.id)).unsubscribed,
    ).toBe(1);
  });
  it("sends a test to typed addresses without a run", async () => {
    await ready();
    const post = await draft();
    expect(
      await delivery.sendTest(env, p.project, pub.id, post.id, {
        to: ["me@example.com"],
      }),
    ).toEqual({ sent: 1 });
    const row = await env.DB.prepare(
      "SELECT subject,newsletter_run_id FROM emails WHERE project_id=? AND purpose='newsletter'",
    )
      .bind(p.project.id)
      .first<{ subject: string; newsletter_run_id: string | null }>();
    expect(row).toEqual({ subject: "[Test] Snapshot", newsletter_run_id: null });
    expect(await runCount()).toBe(0);
  });
  it("sends over HTTP", async () => {
    await ready();
    await subscribed();
    const post = await draft();
    const response = await call(
      "POST",
      `/v1/admin/projects/${p.slug}/publications/${pub.id}/posts/${post.id}/send-email`,
      {
        key: ADMIN_KEY,
        body: {
          expectedRevision: post.revision,
          revisionId: post.draftRevisionId,
          idempotencyKey: "http-send",
        },
      },
    );
    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ status: "sending", total: 1 });
  });
  it("reviews with channel-specific checks", async () => {
    const post = await draft();
    const review = await posts.reviewPost(env, p.project, pub.id, post.id);
    const check = (id: string) => review.checks.find((c) => c.id === id)!;
    expect(check("content")).toMatchObject({ ok: true, level: "error" });
    expect(check("sender")).toMatchObject({ ok: false, channel: "email" });
    expect(check("postal")).toMatchObject({ ok: false, level: "warning" });
    expect(review.lastRun).toBeNull();
  });
});
