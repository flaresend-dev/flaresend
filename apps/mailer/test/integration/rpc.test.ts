import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeRpcError, FlaresendError } from "@flaresend/types";
import { rpcClient } from "@flaresend/client/rpc";
import { queueOps } from "../../src/queue/producer";
import {
  ADMIN_KEY,
  call,
  env,
  json,
  setupProject,
  type TestProject,
} from "../helpers";

vi.spyOn(queueOps, "send").mockResolvedValue();
vi.spyOn(queueOps, "sendBatch").mockResolvedValue();
vi.spyOn(queueOps, "webhooks").mockResolvedValue();

// Loopback service bindings to this Worker's own named entrypoints: real RPC, with serialization.
const mailer = (exports as any).MailerRpc;
const adminRpc = (exports as any).AdminRpc;

const basic = {
  from: "hello@acme.com",
  to: "user@example.com",
  subject: "Hi",
  text: "Hi",
};

let p: TestProject;
beforeEach(async () => {
  p = await setupProject();
});

describe("MailerRpc over a service binding", () => {
  it("exposes newsletter operations through both real RPC entrypoints", async () => {
    const pub = await mailer.createPublication(p.slug, {
      name: "RPC newsletter",
      slug: "rpc-newsletter",
    });
    const post = await adminRpc.createNewsletterPost(p.slug, pub.id, {
      title: "RPC draft",
    });
    expect(
      (await mailer.getNewsletterPost(p.slug, pub.id, post.id)).title,
    ).toBe("RPC draft");
    expect(
      await adminRpc.newsletterCapabilities(p.slug, pub.id),
    ).toMatchObject({ email: false, emailBlocker: "sender_missing" });
    // Without a sender the send is refused for that technical reason only.
    expect(
      decodeRpcError(
        await mailer
          .sendNewsletterEmail(p.slug, pub.id, post.id, {
            expectedRevision: post.revision,
            revisionId: post.draftRevisionId,
            idempotencyKey: "rpc-send",
          })
          .catch((e: unknown) => e),
      )?.code,
    ).toBe("newsletter_sender_not_ready");
  });
  it("send writes the same rows as HTTP apart from source and api_key_id", async () => {
    const viaRpc = await mailer.send(p.slug, basic);
    expect(viaRpc).toEqual({
      id: expect.stringMatching(/^email_/),
      status: "queued",
    });
    const viaHttp = await json(
      call("POST", "/v1/emails", { key: p.liveKey, body: basic }),
    );
    const cols =
      "mode, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, subject, text_preview, has_html, has_text, status, size_bytes";
    const a = await env.DB.prepare(
      `SELECT ${cols}, source, api_key_id FROM emails WHERE id = ?`,
    )
      .bind(viaRpc.id)
      .first<any>();
    const b = await env.DB.prepare(
      `SELECT ${cols}, source, api_key_id FROM emails WHERE id = ?`,
    )
      .bind(viaHttp.id)
      .first<any>();
    expect({ ...a, source: undefined, api_key_id: undefined }).toEqual({
      ...b,
      source: undefined,
      api_key_id: undefined,
    });
    expect(a.source).toBe("rpc");
    expect(a.api_key_id).toBeNull();
    expect(b.source).toBe("http");
    expect(b.api_key_id).toMatch(/^key_/);
  });

  it("get / list / sendBatch", async () => {
    const { id } = await mailer.send(p.slug, basic);
    expect((await mailer.get(p.slug, id)).id).toBe(id);
    expect(await mailer.get(p.slug, "email_nope")).toBeNull();
    expect(
      (await mailer.list(p.slug, { limit: 5 })).data.map((e: any) => e.id),
    ).toEqual([id]);
    const batch = await mailer.sendBatch(p.slug, [
      basic,
      { ...basic, from: "x@evil.com" },
    ]);
    expect(batch.data[0].status).toBe("queued");
    expect(batch.data[1].error.code).toBe("invalid_sender");
  });

  it("errors cross the binding and decode into FlaresendError", async () => {
    const err = await mailer
      .send(p.slug, { ...basic, from: "x@evil.com" })
      .catch((e: unknown) => e);
    const decoded = decodeRpcError(err);
    expect(decoded).toBeInstanceOf(FlaresendError);
    expect(decoded).toMatchObject({
      type: "permission_error",
      code: "invalid_sender",
      status: 403,
      param: "from",
    });
  });

  it("unknown, disabled and rpc-disabled projects are refused", async () => {
    expect(
      decodeRpcError(await mailer.send("nope", basic).catch((e: unknown) => e))
        ?.code,
    ).toBe("project_not_found");
    await call("PATCH", `/v1/admin/projects/${p.slug}`, {
      key: ADMIN_KEY,
      body: { rpcEnabled: false },
    });
    expect(
      decodeRpcError(await mailer.send(p.slug, basic).catch((e: unknown) => e))
        ?.code,
    ).toBe("rpc_disabled");
    await call("PATCH", `/v1/admin/projects/${p.slug}`, {
      key: ADMIN_KEY,
      body: { rpcEnabled: true, disabled: true },
    });
    expect(
      decodeRpcError(await mailer.send(p.slug, basic).catch((e: unknown) => e))
        ?.code,
    ).toBe("project_disabled");
  });

  it("works through @flaresend/client rpcClient", async () => {
    const client = rpcClient(mailer, { project: p.slug });
    const a = await client.send(basic, { idempotencyKey: "rpc-1" });
    const b = await client.send(basic, { idempotencyKey: "rpc-1" });
    expect(b).toEqual({ ...a, idempotent: true });
    await expect(
      client.send({ ...basic, from: "x@evil.com" }),
    ).rejects.toMatchObject({ code: "invalid_sender", status: 403 });
    const scheduled = await client.send({
      ...basic,
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(await client.cancel(scheduled.id)).toEqual({
      id: scheduled.id,
      status: "canceled",
    });
  });
});

describe("AdminRpc over a service binding", () => {
  it("exposes the admin operations as RPC methods", async () => {
    const projects = await adminRpc.listProjects();
    expect(projects.some((x: any) => x.slug === p.slug)).toBe(true);
    const key = await adminRpc.createApiKey(p.slug, {
      name: "dash",
      mode: "test",
    });
    expect(key.key).toMatch(/^fs_test_/);
    expect((await adminRpc.revokeApiKey(key.id)).revokedAt).toBeTruthy();
    const sent = await adminRpc.sendEmail(p.slug, basic);
    expect((await adminRpc.getEmail(sent.id)).id).toBe(sent.id);
    expect((await adminRpc.listEmails({ project: p.slug })).data).toHaveLength(
      1,
    );
    const wh = await adminRpc.createWebhook(p.slug, {
      url: "https://x.example.com/h",
    });
    expect(wh.secret).toMatch(/^whsec_/);
    expect((await adminRpc.listWebhooks(p.slug))[0].secret).toBeUndefined();
    expect(
      (await adminRpc.listTemplates(p.slug)).map((t: any) => t.name),
    ).toContain("welcome");
    expect(Array.isArray(await adminRpc.stats())).toBe(true);
    const err = await adminRpc.getProject("nope").catch((e: unknown) => e);
    expect(decodeRpcError(err)?.code).toBe("project_not_found");
  });
});
