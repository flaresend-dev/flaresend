import { describe, it, expect, vi } from "vitest";
import { Flaresend } from "../src/index";
import { rpcClient, type MailerRpcBinding } from "../src/rpc";
import { encodeRpcError } from "@flaresend/types";
describe("newsletter transports", () => {
  it("uses the key-scoped HTTP route and preserves the revision contract", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "pub_1", revision: 2 }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = new Flaresend({
      apiKey: "fs_test_example",
      baseUrl: "https://mailer.test",
      fetch,
      maxRetries: 0,
    });
    await client.newsletters.updatePublication("pub_1", {
      expectedRevision: 1,
      name: "Dispatch",
    });
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://mailer.test/v1/publications/pub_1",
    );
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
      expectedRevision: 1,
      name: "Dispatch",
    });
  });
  it("serializes the same subscriber filter for HTTP", async () => {
    const calls: string[] = [];
    const client = new Flaresend({
      apiKey: "fs_test_example",
      baseUrl: "https://mailer.test",
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({ data: [], nextCursor: null }));
      },
    });
    const filter = { q: "Ada", tags: ["tag_1"] };
    await client.newsletters.listNewsletterSubscribers("pub_1", { filter });
    expect(JSON.parse(new URL(calls[0]!).searchParams.get("filter")!)).toEqual(
      filter,
    );
  });
  it("binds the project over RPC and decodes the same error", async () => {
    const createPublication = vi.fn(async () => ({ id: "pub_rpc" }));
    const binding = {
      createPublication,
      sendNewsletterEmail: async () => {
        throw new Error(
          encodeRpcError({
            type: "conflict",
            code: "newsletter_sender_not_ready",
            message: "Add a from address in the newsletter settings.",
          }),
        );
      },
    } as unknown as MailerRpcBinding;
    const client = rpcClient(binding, { project: "acme" });
    await client.newsletters.createPublication({
      name: "Dispatch",
      slug: "dispatch",
    });
    expect(createPublication).toHaveBeenCalledWith("acme", {
      name: "Dispatch",
      slug: "dispatch",
    });
    await expect(
      client.newsletters.sendNewsletterEmail("pub_rpc", "post_rpc", {
        expectedRevision: 1,
        revisionId: "rev_1",
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({
      code: "newsletter_sender_not_ready",
      status: 409,
    });
  });
});
