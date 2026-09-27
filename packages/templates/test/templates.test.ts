import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { isTemplateName, listTemplates, renderTemplate, templateNames, templates, type TemplateName } from "../src/index";

const expectedSubjects: Record<TemplateName, string> = {
  welcome: "Welcome to Acme",
  "password-reset": "Reset your password",
  "magic-link": "Your sign-in link",
  notification: "Your export is ready",
  invoice: "Invoice INV-2026-0042",
};

describe("templates", () => {
  it("has exactly the five templates from the plan", () => {
    expect([...templateNames].sort()).toEqual(["invoice", "magic-link", "notification", "password-reset", "welcome"]);
  });

  for (const name of Object.keys(expectedSubjects) as TemplateName[]) {
    it(`${name}: renders its example to html and text with the right subject`, async () => {
      const out = await renderTemplate(name, templates[name].example);
      expect(out.subject).toBe(expectedSubjects[name]);
      expect(out.html.startsWith("<!DOCTYPE html")).toBe(true);
      expect(out.html).toContain("</html>");
      expect(out.text.trim().length).toBeGreaterThan(0);
      expect(out.text).not.toContain("<");
    });

    it(`${name}: throws a ZodError for invalid data`, async () => {
      await expect(renderTemplate(name, { nope: true })).rejects.toBeInstanceOf(ZodError);
    });
  }

  it("puts data into the output", async () => {
    const out = await renderTemplate("invoice", templates.invoice.example);
    expect(out.html).toContain("Extra seats x3");
    expect(out.text).toContain("Extra seats x3");
    expect(out.text).toContain("$129.00");
  });

  it("applies schema defaults", async () => {
    const out = await renderTemplate("magic-link", { loginUrl: "https://example.com/l" });
    expect(out.text).toContain("15 minutes");
  });

  it("reports the path of the bad field", async () => {
    const err = await renderTemplate("welcome", { name: "A", appName: "B", loginUrl: "not a url" }).catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).issues[0]?.path).toEqual(["loginUrl"]);
  });

  it("escapes HTML in data", async () => {
    const out = await renderTemplate("notification", { title: "<script>x</script>", body: "hi" });
    expect(out.html).not.toContain("<script>x</script>");
  });

  it("isTemplateName", () => {
    expect(isTemplateName("welcome")).toBe(true);
    expect(isTemplateName("nope")).toBe(false);
    expect(isTemplateName("toString")).toBe(false);
  });

  it("listTemplates returns name, description, example and fields", () => {
    const list = listTemplates();
    expect(list).toHaveLength(5);
    const invoice = list.find((t) => t.name === "invoice");
    expect(invoice?.fields).toEqual(["invoiceNumber", "amount", "dueDate", "items", "payUrl"]);
    expect(invoice?.description.length).toBeGreaterThan(0);
    expect(invoice?.example).toEqual(templates.invoice.example);
  });
});
