import { describe, it, expect } from "vitest";
import { newsletterScheduleUtc } from "../src/lib/newsletter-time";
describe("newsletter schedule time", () => {
  it("uses the publication timezone instead of the browser timezone", () =>
    expect(
      newsletterScheduleUtc("2026-10-10T09:30", "Africa/Johannesburg"),
    ).toBe("2026-10-10T07:30:00.000Z"));
  it("rejects a daylight-saving gap", () =>
    expect(() =>
      newsletterScheduleUtc("2026-03-08T02:30", "America/New_York"),
    ).toThrow("does not exist"));
  it("rejects an ambiguous daylight-saving time", () =>
    expect(() =>
      newsletterScheduleUtc("2026-11-01T01:30", "America/New_York"),
    ).toThrow("occurs twice"));
  it("rejects an invalid calendar date", () =>
    expect(() => newsletterScheduleUtc("2026-02-30T09:00", "UTC")).toThrow(
      "valid date",
    ));
});
