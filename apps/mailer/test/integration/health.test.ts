import { describe, expect, it } from "vitest";
import { call } from "../helpers";

describe("GET /health", () => {
  it("returns ok after a D1 query", async () => {
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});
