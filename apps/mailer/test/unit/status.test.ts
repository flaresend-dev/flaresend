import { describe, expect, it } from "vitest";
import type { EmailStatus } from "@flaresend/types";
import { reduceEmailStatus, shouldUpdateRecipient } from "../../src/core/status";

describe("reduceEmailStatus", () => {
  const cases: Array<[EmailStatus, string[], EmailStatus]> = [
    ["sent", ["delivered", "delivered"], "delivered"],
    ["sent", ["delivered", "sent"], "sent"],
    ["sent", ["delivered", "deferred"], "deferred"],
    ["sent", ["deferred", "sent"], "deferred"],
    ["sent", ["failed", "delivered"], "failed"],
    ["sent", ["rejected", "failed"], "rejected"],
    ["sent", ["bounced", "rejected", "failed"], "bounced"],
    ["sent", ["complained", "bounced", "rejected", "failed"], "complained"],
    ["sent", ["delivered", "complained"], "complained"],
    ["delivered", ["complained"], "complained"],
    ["sent", [], "sent"],
    // terminal failures never go back
    ["bounced", ["delivered"], "bounced"],
    ["failed", ["deferred"], "failed"],
    // a lower-priority failure never replaces a higher one
    ["complained", ["bounced"], "complained"],
    ["rejected", ["failed"], "rejected"],
    // but a higher one does
    ["bounced", ["complained"], "complained"],
    ["deferred", ["delivered"], "delivered"],
  ];
  it.each(cases)("current=%s recipients=%j -> %s", (current, recipients, expected) => {
    expect(reduceEmailStatus(current, recipients)).toBe(expected);
  });
});

describe("shouldUpdateRecipient (no downgrade)", () => {
  it.each([
    ["sent", "deferred", true],
    ["deferred", "delivered", true],
    ["delivered", "deferred", false],
    ["bounced", "deferred", false],
    ["delivered", "complained", true],
    ["complained", "delivered", false],
    ["bounced", "delivered", false],
    ["deferred", "deferred", true],
    ["sent", "bounced", true],
  ] as const)("%s <- %s = %s", (cur, incoming, expected) => {
    expect(shouldUpdateRecipient(cur, incoming)).toBe(expected);
  });
});
