import { describe, expect, it } from "vitest";
import type { NewsletterDocument } from "@flaresend/types";
import { fromBlocks, plainText, rehydrateTokens, splitDraft, toBlocks, wordCount, type BnBlock } from "../src/lib/newsletter-doc";

const full: NewsletterDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: "p1",
      type: "paragraph",
      content: [
        { type: "text", text: "Hi " },
        { type: "personalization", field: "firstName", fallback: "there" },
        { type: "text", text: ", read ", bold: true },
        { type: "text", text: "this", italic: true, href: "https://example.com" },
      ],
    },
    { id: "h2", type: "heading2", content: [{ type: "text", text: "Big" }] },
    { id: "h3", type: "heading3", content: [{ type: "text", text: "Small" }] },
    { id: "q", type: "quote", content: [{ type: "text", text: "Said" }] },
    { id: "ul", type: "bulletList", items: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]] },
    { id: "ol", type: "orderedList", items: [[{ type: "text", text: "one" }]] },
    { id: "img", type: "image", assetId: "asset_1", alt: "A chart", decorative: false, caption: "Fig", href: "https://x.test", width: 320 },
    { id: "hr", type: "divider" },
    { id: "btn", type: "button", label: "Go", href: "https://go.test" },
  ],
};

describe("newsletter document conversion", () => {
  it("survives a round trip through BlockNote blocks", () => {
    const { blocks, imageMeta } = toBlocks(full);
    expect(fromBlocks(blocks, imageMeta)).toEqual(full);
  });
  it("groups consecutive list items into one list", () => {
    const blocks: BnBlock[] = ["x", "y", "z"].map((t, i) => ({
      id: `li${i}`,
      type: "bulletListItem",
      content: [{ type: "text", text: t, styles: {} }],
    }));
    const doc = fromBlocks(blocks);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({ id: "li0", type: "bulletList" });
    expect((doc.blocks[0] as { items: unknown[] }).items).toHaveLength(3);
  });
  it("flattens nested list items in reading order", () => {
    const doc = fromBlocks([
      {
        id: "a",
        type: "numberedListItem",
        content: [{ type: "text", text: "1", styles: {} }],
        children: [{ id: "b", type: "numberedListItem", content: [{ type: "text", text: "1.1", styles: {} }] }],
      },
    ]);
    expect(doc.blocks).toEqual([
      { id: "a", type: "orderedList", items: [[{ type: "text", text: "1" }], [{ type: "text", text: "1.1" }]] },
    ]);
  });
  it("maps heading levels to the two stored heading types", () => {
    const doc = fromBlocks([
      { id: "a", type: "heading", props: { level: 1 }, content: [] },
      { id: "b", type: "heading", props: { level: 4 }, content: [] },
    ]);
    expect(doc.blocks.map((b) => b.type)).toEqual(["heading2", "heading3"]);
  });
  it("drops an image that was never uploaded and trailing empty paragraphs", () => {
    const doc = fromBlocks([
      { id: "t", type: "paragraph", content: [{ type: "text", text: "Hi", styles: {} }] },
      { id: "i", type: "image", props: { url: "" } },
      { id: "e", type: "paragraph", content: [] },
    ]);
    expect(doc.blocks.map((b) => b.id)).toEqual(["t"]);
  });
  it("keeps the text of unknown pasted blocks and makes ids unique", () => {
    const doc = fromBlocks([
      { id: "same", type: "checkListItem", content: [{ type: "text", text: "todo", styles: {} }] },
      { id: "same", type: "paragraph", content: [{ type: "text", text: "next", styles: {} }] },
    ]);
    expect(doc.blocks[0]).toMatchObject({ type: "paragraph", content: [{ text: "todo" }] });
    expect(new Set(doc.blocks.map((b) => b.id)).size).toBe(2);
  });
  it("turns {{firstName|x}} text into personalization nodes", () => {
    const [b] = rehydrateTokens([
      { id: "p", type: "paragraph", content: [{ type: "text", text: "Hi {{firstName|there}}, welcome", styles: {} }] },
    ]);
    expect(b!.content).toEqual([
      { type: "text", text: "Hi ", styles: {} },
      { type: "personalization", props: { field: "firstName", fallback: "there" } },
      { type: "text", text: ", welcome", styles: {} },
    ]);
  });
  it("counts words and splits an AI draft", () => {
    const { blocks } = toBlocks(full);
    expect(wordCount(plainText(blocks))).toBeGreaterThan(5);
    expect(splitDraft("# A title\nA subtitle\n\n## Body\nText")).toEqual({
      title: "A title",
      subtitle: "A subtitle",
      body: "## Body\nText",
    });
    expect(splitDraft("Only a title\n\nBody")).toEqual({ title: "Only a title", subtitle: "", body: "Body" });
  });
});
