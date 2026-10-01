import { describe, expect, it } from "vitest";
import { eventSummary, reasonLabel, statusDisplay, statusLabel, titleCase } from "../src/lib/labels";
import { parseEmailSearch } from "../src/lib/search";
import { ALL, NAV_ITEMS, activeSection, isReservedSlug, link, legacyProjectHref, p, projectFromPath, slugError, slugify } from "../src/lib/nav";
import { hasEmailFilters, toEmailQuery } from "../src/lib/email-query";
import { nextTheme, parseTheme } from "../src/lib/theme";
import { formatAbsolute, num } from "../src/lib/format";

describe("labels: status display names and tones (section 2.4)", () => {
  const table: Array<[string, string, string]> = [
    ["queued", "Queued", "info"],
    ["scheduled", "Scheduled", "violet"],
    ["sending", "Sending", "info"],
    ["sent", "Sent", "info"],
    ["delivered", "Delivered", "success"],
    ["deferred", "Delivery delayed", "warning"],
    ["bounced", "Bounced", "danger"],
    ["complained", "Complained", "danger"],
    ["rejected", "Rejected", "danger"],
    ["failed", "Failed", "danger"],
    ["test", "Test", "muted"],
    ["canceled", "Canceled", "muted"],
    ["opened", "Opened", "teal"],
    ["clicked", "Clicked", "teal"],
    ["retrying", "Retrying", "warning"],
    ["onboarded", "Verified", "success"],
    ["pending", "Pending", "warning"],
    ["missing", "Not started", "danger"],
    ["unknown", "Unknown", "muted"],
    ["active", "Active", "success"],
    ["revoked", "Revoked", "muted"],
    ["expired", "Expired", "warning"],
    ["enabled", "Enabled", "success"],
    ["disabled", "Disabled", "muted"],
    ["success", "Success", "success"],
    ["draft", "Draft", "muted"],
    ["subscribed", "Subscribed", "success"],
    ["unsubscribed", "Unsubscribed", "muted"],
    ["published", "Published", "success"],
    ["unpublished", "Unpublished", "muted"],
    ["archived", "Archived", "muted"],
    ["skipped", "Skipped", "muted"],
  ];
  it.each(table)("%s -> %s (%s)", (code, label, tone) => {
    expect(statusDisplay(code)).toEqual({ label, tone });
  });
  it("strips the email. prefix from event types", () => {
    expect(statusDisplay("email.deferred")).toEqual({ label: "Delivery delayed", tone: "warning" });
    expect(statusLabel("email.opened")).toBe("Opened");
  });
  it("shows unknown codes in Title Case, muted", () => {
    expect(statusDisplay("brand_new_state")).toEqual({ label: "Brand new state", tone: "muted" });
    expect(statusDisplay(null)).toEqual({ label: "Unknown", tone: "muted" });
    expect(titleCase("hard_bounce")).toBe("Hard bounce");
  });
  it("names suppression reasons", () => {
    expect(reasonLabel("hard_bounce")).toBe("Hard bounce");
    expect(reasonLabel("complaint")).toBe("Complaint");
    expect(reasonLabel("manual")).toBe("Manual");
  });
});

describe("eventSummary", () => {
  it("delivered: SMTP response and delivery time", () => {
    expect(eventSummary({ delivery: { status: "delivered", smtpStatusCode: "250", smtpResponse: "OK", deliveryTimeMs: 1200 }, terminal: true })).toBe("250 OK · 1.2 s");
    expect(eventSummary({ delivery: { status: "delivered", smtpStatusCode: "250", smtpResponse: "250 2.0.0 OK queued", deliveryTimeMs: 90 } })).toBe(
      "250 2.0.0 OK queued · 90 ms",
    );
  });
  it("bounced: the bounce type", () => {
    expect(eventSummary({ delivery: { status: "bounced", smtpStatusCode: "550" }, bounce: { type: "hard", classification: "x", reason: "y" } })).toBe("Hard bounce");
  });
  it("failed: the error code", () => {
    expect(eventSummary({ code: "provider_error", message: "boom" })).toBe("provider_error");
    expect(eventSummary({ delivery: { status: "failed" }, failure: { reason: "mailbox full" } })).toBe("mailbox full");
  });
  it("otherwise the first data key; empty data is empty", () => {
    expect(eventSummary({ messageId: "abc" })).toBe("messageId: abc");
    expect(eventSummary({ url: "https://x.test/a", userAgent: null })).toBe("url: https://x.test/a");
    expect(eventSummary({})).toBe("");
    expect(eventSummary(null)).toBe("");
    expect(eventSummary(undefined)).toBe("");
  });
});

describe("parseEmailSearch", () => {
  it("routes the search box text to the right filter", () => {
    expect(parseEmailSearch("ada@x.com")).toEqual({ kind: "filter", key: "to", value: "ada@x.com" });
    expect(parseEmailSearch("  email_01JABCDEFGHJKMNPQRSTVWXYZ0  ")).toEqual({ kind: "redirect", emailId: "email_01JABCDEFGHJKMNPQRSTVWXYZ0" });
    expect(parseEmailSearch("plan:pro")).toEqual({ kind: "filter", key: "tag", value: "plan:pro" });
    expect(parseEmailSearch("invoice")).toEqual({ kind: "filter", key: "q", value: "invoice" });
    expect(parseEmailSearch("   ")).toEqual({ kind: "empty" });
  });
  it("only treats a full ULID as an email id", () => {
    expect(parseEmailSearch("email_01JABC")).toEqual({ kind: "filter", key: "q", value: "email_01JABC" });
  });
});

describe("nav", () => {
  it("builds project URLs", () => {
    expect(p("acme", "api-keys")).toBe("/acme/api-keys");
    expect(p("acme")).toBe("/acme");
    expect(p("acme", "templates", "a b")).toBe("/acme/templates/a%20b");
  });
  it("rejects reserved slugs", () => {
    for (const s of ["projects", "api", "new", "_next", "favicon.ico"]) expect(isReservedSlug(s)).toBe(true);
    expect(isReservedSlug("acme")).toBe(false);
    expect(slugError("projects")).toMatch(/reserved/);
    expect(slugError("Bad Slug")).toMatch(/lowercase/);
    expect(slugError("acme")).toBeNull();
  });
  it("slugifies names", () => {
    expect(slugify("Acme Mail!")).toBe("acme-mail");
    expect(slugify("  Café  Déjà ")).toBe("cafe-deja");
  });
  it("finds the project and section in a path", () => {
    expect(projectFromPath("/acme/emails/email_1")).toBe("acme");
    expect(projectFromPath("/projects/new")).toBeNull();
    expect(projectFromPath("/_next/static/x.js")).toBeNull();
    expect(projectFromPath("/favicon.ico")).toBeNull();
    expect(projectFromPath("/")).toBeNull();
    expect(activeSection("/acme/webhooks/wh_1")).toBe("webhooks");
    expect(activeSection("/acme")).toBeNull();
  });
  it("handles the All projects view", () => {
    expect(isReservedSlug(ALL)).toBe(true);
    expect(slugError("all")).toMatch(/reserved/);
    expect(projectFromPath("/all/emails")).toBe(ALL);
    expect(activeSection("/all/domains")).toBe("domains");
    expect(p(ALL, "emails", "email_1")).toBe("/all/emails/email_1");
  });
  it("keeps project links inside the view", () => {
    expect(link("acme", "acme", "webhooks", "wh_1")).toBe("/acme/webhooks/wh_1");
    expect(link("acme", "acme", "webhooks")).toBe("/acme/webhooks");
    expect(link(ALL, "acme", "webhooks", "wh_1")).toBe("/all/webhooks/acme/wh_1");
    expect(link(ALL, "acme", "webhooks")).toBe("/all/webhooks");
    expect(link(ALL, "acme", "templates", "a b")).toBe("/all/templates/acme/a%20b");
    expect(link(ALL, "acme", "contacts")).toBe("/all/contacts/acme");
    expect(link(ALL, "acme", "settings")).toBe("/all/settings/acme");
    expect(link(ALL, "acme", "emails", "email_1")).toBe("/all/emails/email_1");
    expect(link(ALL, "acme", "logs")).toBe("/all/logs");
  });
  it("keeps the sidebar order", () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual([
      "Emails", "Broadcasts", "Newsletters", "Audiences", "Contacts", "Templates", "Metrics", "Logs",
      "Domains", "API Keys", "Webhooks", "Suppressions", "Settings",
    ]);
  });
  it("maps every old project tab URL (section 2.3)", () => {
    expect(legacyProjectHref("h", {})).toBe("/h/emails");
    expect(legacyProjectHref("h", { tab: "emails" })).toBe("/h/emails");
    expect(legacyProjectHref("h", { tab: "domains" })).toBe("/h/domains");
    expect(legacyProjectHref("h", { tab: "keys" })).toBe("/h/api-keys");
    expect(legacyProjectHref("h", { tab: "webhooks" })).toBe("/h/webhooks");
    expect(legacyProjectHref("h", { tab: "webhooks", webhook: "wh_1" })).toBe("/h/webhooks/wh_1");
    expect(legacyProjectHref("h", { tab: "templates" })).toBe("/h/templates");
    expect(legacyProjectHref("h", { tab: "templates", new: "1" })).toBe("/h/templates/new");
    expect(legacyProjectHref("h", { tab: "templates", template: "welcome" })).toBe("/h/templates/welcome");
    expect(legacyProjectHref("h", { tab: "contacts" })).toBe("/h/contacts");
    expect(legacyProjectHref("h", { tab: "audiences" })).toBe("/h/audiences");
    expect(legacyProjectHref("h", { tab: "audiences", audience: "aud_1" })).toBe("/h/audiences/aud_1");
    expect(legacyProjectHref("h", { tab: "broadcasts" })).toBe("/h/broadcasts");
    expect(legacyProjectHref("h", { tab: "broadcasts", new: "1" })).toBe("/h/broadcasts/new");
    expect(legacyProjectHref("h", { tab: "broadcasts", broadcast: "bc_1" })).toBe("/h/broadcasts/bc_1");
    expect(legacyProjectHref("h", { tab: "settings" })).toBe("/h/settings");
  });
});

describe("email list date range", () => {
  it("turns range into a since bound relative to now", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    expect(toEmailQuery({ range: "24h" }, { now }).since).toBe("2026-09-24T12:00:00.000Z");
    expect(toEmailQuery({ range: "7d", since: "2026-01-01" }, { now }).since).toBe("2026-09-18T12:00:00.000Z");
    expect(toEmailQuery({ range: "bogus", since: "2026-09-01" }, { now }).since).toBe("2026-09-01T00:00:00.000Z");
  });
  it("knows when filters are set", () => {
    expect(hasEmailFilters({})).toBe(false);
    expect(hasEmailFilters({ cursor: "x" })).toBe(false);
    expect(hasEmailFilters({ range: "7d" })).toBe(true);
  });
});

describe("theme and format", () => {
  it("parses and cycles the theme", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("nonsense")).toBe("system");
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
  it("formats absolute dates and numbers", () => {
    expect(formatAbsolute("2026-09-25T14:03:11.000Z", { timeZone: "UTC" })).toBe("Sep 25, 2026, 2:03 PM");
    expect(formatAbsolute("2026-09-25T14:03:11.000Z", { timeZone: "UTC", dateOnly: true })).toBe("Sep 25, 2026");
    expect(num(12480)).toBe("12,480");
  });
});
