import { describe, expect, it, vi } from "vitest";
import { encodeRpcError } from "@flaresend/types";
import { FlaresendError, rpcClient } from "../src/rpc";
import type { MailerRpcBinding } from "../src/rpc";

function fakeBinding(overrides: Partial<MailerRpcBinding> = {}): MailerRpcBinding {
  return {
    send: vi.fn(async () => ({ id: "email_1", status: "queued" as const })),
    sendBatch: vi.fn(async () => ({ data: [] })),
    get: vi.fn(async () => null),
    list: vi.fn(async () => ({ data: [], nextCursor: null })),
    cancel: vi.fn(async (_p: string, id: string) => ({ id, status: "canceled" as const })),
    ...overrides,
  };
}

const input = { from: "hi@app.test", to: "a@b.test", subject: "Hi", text: "hello" };

describe("rpcClient", () => {
  it("passes the project and merges idempotencyKey into the input", async () => {
    const binding = fakeBinding();
    const mail = rpcClient(binding, { project: "acme" });
    await mail.send(input, { idempotencyKey: "k1" });
    expect(binding.send).toHaveBeenCalledWith("acme", { ...input, idempotencyKey: "k1" });
  });

  it("leaves the input alone without an idempotency key", async () => {
    const binding = fakeBinding();
    await rpcClient(binding, { project: "p" }).send(input);
    expect(binding.send).toHaveBeenCalledWith("p", input);
  });

  it("forwards get/list/cancel/sendBatch", async () => {
    const binding = fakeBinding();
    const mail = rpcClient(binding, { project: "p" });
    expect(await mail.get("email_x")).toBeNull();
    await mail.list();
    await mail.cancel("email_y");
    await mail.sendBatch([input]);
    expect(binding.get).toHaveBeenCalledWith("p", "email_x");
    expect(binding.list).toHaveBeenCalledWith("p", {});
    expect(binding.cancel).toHaveBeenCalledWith("p", "email_y");
    expect(binding.sendBatch).toHaveBeenCalledWith("p", [input]);
  });

  it("rebuilds FlaresendError from an encoded RPC error", async () => {
    const binding = fakeBinding({
      send: async () => {
        throw new Error(encodeRpcError({ type: "permission_error", code: "invalid_sender", message: "bad from", param: "from" }));
      },
    });
    const err = await rpcClient(binding, { project: "p" }).send(input).catch((e) => e);
    expect(err).toBeInstanceOf(FlaresendError);
    expect(err).toMatchObject({ type: "permission_error", code: "invalid_sender", param: "from", status: 403 });
  });

  it("rethrows errors it cannot decode", async () => {
    const original = new Error("binding exploded");
    const binding = fakeBinding({
      get: async () => {
        throw original;
      },
    });
    await expect(rpcClient(binding, { project: "p" }).get("x")).rejects.toBe(original);
  });
});
