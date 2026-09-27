import { describe, expect, it } from "vitest";
import { CfEmailEventSchema } from "@flaresend/types";
import { DEV_EVENT_TYPES, bareAddress, buildDevEvent, buildDevEventsForEmail, type DevEventEmail } from "../src/dev-event";

const now = new Date("2026-09-25T12:00:00.000Z");

const email: DevEventEmail = {
  id: "em_1",
  from: "hello@acme.com",
  subject: "Welcome",
  status: "sent",
  cloudflareMessageId: "cf-msg-1",
  to: ["a@gmail.com"],
  cc: ["B <b@example.com>"],
  bcc: [],
  recipients: [{ address: "a@gmail.com" }, { address: "b@example.com" }],
};

describe("buildDevEvent", () => {
  it.each(DEV_EVENT_TYPES)("builds a valid %s event", (type) => {
    const ev = buildDevEvent({ type, messageId: "m1", sender: "Acme <hello@acme.com>", recipient: "a@gmail.com", subject: "Hi", now });
    expect(CfEmailEventSchema.safeParse(ev).success).toBe(true);
    expect(ev.type).toBe(`cf.email.sending.message.${type}`);
    expect(ev.source).toEqual({ type: "email.sending", zoneId: "dev-zone", domain: "acme.com" });
    expect(ev.payload.messageId).toBe("m1");
    expect(ev.payload.sender).toBe("hello@acme.com");
    expect(ev.payload.recipient).toBe("a@gmail.com");
    expect(ev.payload.delivery.status).toBe(type);
    expect(ev.payload.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ev.metadata.eventTimestamp).toBe("2026-09-25T12:00:00.000Z");
    expect(ev.metadata.eventSchemaVersion).toBe(1);
  });

  it("marks only deferred as non-terminal", () => {
    for (const type of DEV_EVENT_TYPES) {
      const ev = buildDevEvent({ type, messageId: "m", sender: "s@x.com", recipient: "r@y.com" });
      expect(ev.payload.terminal).toBe(type !== "deferred");
    }
  });

  it("adds the type-specific objects", () => {
    const d = buildDevEvent({ type: "delivered", messageId: "m", sender: "s@x.com", recipient: "r@gmail.com" });
    expect(d.payload.delivery.smtpStatusCode).toBe("250");
    expect(d.payload.delivery.provider).toBe("google");
    expect(typeof d.payload.delivery.deliveryTimeMs).toBe("number");

    const hard = buildDevEvent({ type: "bounced", messageId: "m", sender: "s@x.com", recipient: "r@y.com" });
    expect(hard.payload.bounce?.type).toBe("hard");
    expect(hard.payload.delivery.smtpEnhancedStatusCode).toBe("5.1.1");
    const soft = buildDevEvent({ type: "bounced", bounceType: "soft", messageId: "m", sender: "s@x.com", recipient: "r@y.com" });
    expect(soft.payload.bounce?.type).toBe("soft");

    expect(buildDevEvent({ type: "failed", messageId: "m", sender: "s@x.com", recipient: "r@y.com" }).payload.failure?.reason).toBeTruthy();
    const rej = buildDevEvent({ type: "rejected", messageId: "m", sender: "s@x.com", recipient: "r@y.com" }).payload.rejection;
    expect(rej?.party).toBe("recipient");
    expect(buildDevEvent({ type: "complained", messageId: "m", sender: "s@x.com", recipient: "r@y.com" }).payload.complaint?.type).toBe("abuse");
  });

  it("leaves the subject off complained events", () => {
    expect(buildDevEvent({ type: "complained", messageId: "m", sender: "s@x.com", recipient: "r@y.com", subject: "Hi" }).payload.subject).toBeUndefined();
    expect(buildDevEvent({ type: "delivered", messageId: "m", sender: "s@x.com", recipient: "r@y.com", subject: "Hi" }).payload.subject).toBe("Hi");
  });

  it("uses a new eventId each time", () => {
    const a = buildDevEvent({ type: "delivered", messageId: "m", sender: "s@x.com", recipient: "r@y.com" });
    const b = buildDevEvent({ type: "delivered", messageId: "m", sender: "s@x.com", recipient: "r@y.com" });
    expect(a.payload.eventId).not.toBe(b.payload.eventId);
  });
});

describe("buildDevEventsForEmail", () => {
  it("builds one event per recipient", () => {
    const evs = buildDevEventsForEmail(email, "delivered", { now });
    expect(evs.map((e) => e.payload.recipient)).toEqual(["a@gmail.com", "b@example.com"]);
    expect(evs.every((e) => e.payload.messageId === "cf-msg-1" && e.payload.subject === "Welcome")).toBe(true);
  });

  it("filters to --recipient, ignoring case and display name", () => {
    const evs = buildDevEventsForEmail(email, "bounced", { recipient: "Bee <B@Example.com>" });
    expect(evs).toHaveLength(1);
    expect(evs[0]!.payload.recipient).toBe("b@example.com");
  });

  it("rejects a recipient that is not on the email", () => {
    expect(() => buildDevEventsForEmail(email, "delivered", { recipient: "z@z.com" })).toThrow(/not a recipient/);
  });

  it("falls back to to/cc/bcc when there are no recipient rows", () => {
    const evs = buildDevEventsForEmail({ ...email, recipients: [] }, "delivered");
    expect(evs.map((e) => e.payload.recipient)).toEqual(["a@gmail.com", "b@example.com"]);
  });

  it("needs a cloudflareMessageId unless one is passed", () => {
    const queued = { ...email, cloudflareMessageId: null, status: "queued" as const };
    expect(() => buildDevEventsForEmail(queued, "delivered")).toThrow(/no cloudflareMessageId/);
    expect(buildDevEventsForEmail(queued, "delivered", { messageId: "x" })[0]!.payload.messageId).toBe("x");
  });
});

describe("bareAddress", () => {
  it("strips display names", () => {
    expect(bareAddress('"Doe, J" <j@x.com>')).toBe("j@x.com");
    expect(bareAddress(" j@x.com ")).toBe("j@x.com");
  });
});
