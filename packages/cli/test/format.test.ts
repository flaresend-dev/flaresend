import { describe, expect, it } from "vitest";
import { cellText, keyValues, table, truncate } from "../src/format";

describe("table", () => {
  it("pads columns to the widest cell and adds a dash row", () => {
    const out = table(["ID", "NAME"], [["p_1", "Acme Co"], ["p_22", null]]);
    expect(out.split("\n")).toEqual(["ID    NAME", "----  -------", "p_1   Acme Co", "p_22  -"]);
  });

  it("right-aligns chosen columns and truncates long cells", () => {
    const out = table(["NAME", "N"], [["abcdefghij", 5], ["x", 120]], { maxWidths: [6], alignRight: [1] });
    expect(out.split("\n")).toEqual(["NAME      N", "------  ---", "abc...    5", "x       120"]);
  });

  it("prints headers when there are no rows", () => {
    expect(table(["A", "BB"], [])).toBe("A  BB\n-  --");
  });

  it("flattens newlines and shows - for empty values", () => {
    expect(cellText("a\nb")).toBe("a b");
    expect(cellText(undefined)).toBe("-");
    expect(cellText("")).toBe("-");
    expect(cellText(0)).toBe("0");
    expect(cellText(false)).toBe("false");
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => expect(truncate("abc", 5)).toBe("abc"));
  it("cuts long strings with ...", () => expect(truncate("abcdefgh", 6)).toBe("abc..."));
});

describe("keyValues", () => {
  it("aligns values", () => {
    expect(keyValues([["ID", "e_1"], ["Status", null]])).toBe("ID:      e_1\nStatus:  -");
  });
});
