import { describe, expect, it } from "vitest";
import { parse, renderMustache, TemplateSyntaxError } from "../../src/core/mustache";
import { checkRequiredVariables, htmlToText, renderDbTemplate } from "../../src/core/render";
import { ApiError } from "../../src/http/errors";

describe("renderMustache", () => {
  it("substitutes nested paths and escapes HTML", () => {
    expect(renderMustache("Hi {{user.name}}!", { user: { name: "<Jo>" } })).toBe("Hi &lt;Jo&gt;!");
  });
  it("leaves {{{raw}}} unescaped", () => {
    expect(renderMustache("{{{html}}}", { html: "<b>x</b>" })).toBe("<b>x</b>");
  });
  it("does not escape when escape=false", () => {
    expect(renderMustache("{{a}}", { a: "<x>" }, { escape: false })).toBe("<x>");
  });
  it("renders missing values as empty", () => {
    expect(renderMustache("[{{missing}}]", {})).toBe("[]");
  });
  it("supports if/else", () => {
    const t = "{{#if vip}}VIP{{else}}regular{{/if}}";
    expect(renderMustache(t, { vip: true })).toBe("VIP");
    expect(renderMustache(t, { vip: false })).toBe("regular");
    expect(renderMustache(t, { vip: [] })).toBe("regular");
  });
  it("supports each with this, this.field, @index and parent lookups", () => {
    const t = "{{#each items}}{{@index}}:{{this.name}}={{price}}{{currency}};{{/each}}";
    expect(renderMustache(t, { currency: "$", items: [{ name: "a", price: 1 }, { name: "b", price: 2 }] })).toBe("0:a=1$;1:b=2$;");
    expect(renderMustache("{{#each tags}}<{{this}}>{{/each}}", { tags: ["x", "<y>"] })).toBe("<x><&lt;y&gt;>");
  });
  it("supports nested blocks", () => {
    const t = "{{#each rows}}{{#if show}}{{label}}{{/if}}{{/each}}";
    expect(renderMustache(t, { rows: [{ show: true, label: "A" }, { show: false, label: "B" }] })).toBe("A");
  });
  it("rejects unbalanced or unknown blocks", () => {
    expect(() => parse("{{#if a}}x")).toThrow(TemplateSyntaxError);
    expect(() => parse("{{/if}}")).toThrow(TemplateSyntaxError);
    expect(() => parse("{{#each a}}{{/if}}")).toThrow(TemplateSyntaxError);
    expect(() => parse("{{#with a}}{{/with}}")).toThrow(TemplateSyntaxError);
  });
  it("never evaluates code", () => {
    expect(renderMustache("{{constructor.constructor}}", {})).not.toContain("function");
  });
});

describe("D1 template rendering", () => {
  it("checks required variables", () => {
    expect(() => checkRequiredVariables([{ name: "order.id", required: true }], { order: {} })).toThrow(ApiError);
    expect(() => checkRequiredVariables([{ name: "order.id", required: true }], { order: { id: 1 } })).not.toThrow();
  });
  it("renders subject, html and derives text when missing", () => {
    const r = renderDbTemplate(
      { subject: "Order {{id}}\nshipped", html: '<p>Hi {{name}}</p><p><a href="https://x.co/o/{{id}}">Track</a></p>', text: null, variables: null },
      { id: 7, name: "Ann" },
    );
    expect(r.subject).toBe("Order 7 shipped");
    expect(r.html).toContain("Hi Ann");
    expect(r.text).toContain("Hi Ann");
    expect(r.text).toContain("Track (https://x.co/o/7)");
  });
  it("htmlToText keeps paragraphs", () => {
    expect(htmlToText("<p>a</p><p>b</p>")).toBe("a\n\nb");
  });
});
