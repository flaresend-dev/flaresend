import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

// Acts like a Workers RPC stub: every property read, on the stub and on each method it returns, is a remote method
// name. So `stub.someMethod.call(...)` asks for a remote method named "call", which does not exist.
const calls: { name: string; args: unknown[] }[] = [];
const noSuchMethod: ProxyHandler<object> = {
  get: (_t, name) => {
    throw new Error(`The RPC receiver does not implement the method "${String(name)}".`);
  },
};
const stub = new Proxy(
  {},
  {
    get: (_t, name) => {
      if (name === "then") return undefined;
      const method = (...args: unknown[]) => {
        calls.push({ name: String(name), args });
        return Promise.resolve({ id: "pub_1" });
      };
      return new Proxy(method, noSuchMethod);
    },
  },
);
vi.mock("@/lib/mailer", () => ({
  mailerCall: async <T>(fn: (m: unknown) => Promise<T>) => {
    try {
      return { ok: true, data: await fn(stub) };
    } catch (e) {
      return { ok: false, error: { code: "x", message: (e as Error).message } };
    }
  },
}));

const { newsletterAction } = await import("../src/app/newsletter-actions");

describe("newsletterAction", () => {
  beforeEach(() => {
    calls.length = 0;
    revalidatePath.mockClear();
  });

  it("calls the method directly on the RPC stub and revalidates after a mutation", async () => {
    const r = await newsletterAction("acme", "createPublication", { name: "Weekly" } as never);
    expect(r).toEqual({ ok: true, data: { id: "pub_1" } });
    expect(calls).toEqual([{ name: "createPublication", args: ["acme", { name: "Weekly" }] }]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("does not revalidate after a read", async () => {
    await newsletterAction("acme", "getPublication", "pub_1");
    expect(calls).toEqual([{ name: "getPublication", args: ["acme", "pub_1"] }]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects names that are not newsletter operations", async () => {
    const call = newsletterAction as (slug: string, method: string) => Promise<unknown>;
    for (const name of ["constructor", "toString", "__proto__", "listDomains"]) {
      await expect(call("acme", name)).rejects.toThrow("Unknown newsletter operation.");
    }
    expect(calls).toEqual([]);
  });
});
