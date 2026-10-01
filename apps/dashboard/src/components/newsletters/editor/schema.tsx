"use client";
// The BlockNote schema for newsletter posts: only what the email renderer supports.
import {
  BlockNoteSchema,
  createDividerBlockSpec,
  createHeadingBlockSpec,
  createImageBlockSpec,
  createParagraphBlockSpec,
  createQuoteBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";

const FIELD_LABEL = { firstName: "First name", lastName: "Last name" } as const;

/** The subscriber's first or last name, with a fallback for readers without one. Click to edit the fallback. */
export const Personalization = createReactInlineContentSpec(
  {
    type: "personalization",
    propSchema: {
      field: { default: "firstName", values: ["firstName", "lastName"] as const },
      fallback: { default: "there" },
    },
    content: "none",
  },
  {
    render: function Render({ inlineContent, updateInlineContent, editor }) {
      const { field, fallback } = inlineContent.props;
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              contentEditable={false}
              disabled={!editor.isEditable}
              className="mx-0.5 inline-flex h-6 translate-y-[-1px] items-center gap-1 rounded-md border border-border bg-background-subtle px-1.5 align-middle text-[14px] font-medium text-foreground hover:bg-background-hover"
              title={fallback ? `Readers without a name see “${fallback}”` : "Readers without a name see nothing"}
            >
              <UserRound className="size-3.5 text-foreground-subtle" aria-hidden />
              {FIELD_LABEL[field as keyof typeof FIELD_LABEL]}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <FallbackField
              value={fallback}
              onChange={(v) =>
                updateInlineContent({ type: "personalization", props: { field, fallback: v } })
              }
            />
          </PopoverContent>
        </Popover>
      );
    },
    toExternalHTML: ({ inlineContent }) => (
      <span>{`{{${inlineContent.props.field}|${inlineContent.props.fallback}}}`}</span>
    ),
  },
);

function FallbackField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="pz-fallback">When a reader has no name, show</Label>
      <Input
        id="pz-fallback"
        value={v}
        maxLength={200}
        placeholder="Nothing"
        onChange={(e) => {
          setV(e.target.value);
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

/** A link styled as a button in the newsletter's accent colour. Click to edit its label and link. */
export const ButtonBlock = createReactBlockSpec(
  {
    type: "button",
    propSchema: { label: { default: "Read more" }, href: { default: "" } },
    content: "none",
  },
  {
    render: function Render({ block, editor }) {
      const { label, href } = block.props;
      const [open, setOpen] = useState(!href);
      const set = (patch: Partial<typeof block.props>) =>
        editor.updateBlock(block, { props: { ...block.props, ...patch } });
      return (
        <div className="py-2" contentEditable={false}>
          <Popover open={open && editor.isEditable} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-md px-5 text-[16px] font-semibold text-white shadow-card"
                style={{ background: "var(--nl-accent, #c2410c)" }}
              >
                {label || "Button label"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="flex w-80 flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`btn-l-${block.id}`}>Label</Label>
                <Input id={`btn-l-${block.id}`} value={label} maxLength={100} onChange={(e) => set({ label: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`btn-h-${block.id}`}>Link</Label>
                <Input
                  id={`btn-h-${block.id}`}
                  value={href}
                  placeholder="https://"
                  type="url"
                  aria-invalid={!!href && !/^(https?:\/\/|mailto:)/i.test(href)}
                  onChange={(e) => set({ href: e.target.value.trim() })}
                />
                {href && !/^(https?:\/\/|mailto:)/i.test(href) ? (
                  <p className="text-xs text-danger-fg">Start the link with https://, http:// or mailto:</p>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
          {!href ? <span className="ml-3 text-xs text-foreground-muted">Add a link, or this button is left out.</span> : null}
        </div>
      );
    },
    toExternalHTML: ({ block }) => <a href={block.props.href}>{block.props.label}</a>,
  },
);

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: createParagraphBlockSpec(),
    heading: createHeadingBlockSpec({ levels: [2, 3], defaultLevel: 2 }),
    quote: createQuoteBlockSpec(),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    image: createImageBlockSpec(),
    divider: createDividerBlockSpec(),
    button: ButtonBlock(),
  },
  inlineContentSpecs: {
    text: defaultInlineContentSpecs.text,
    link: defaultInlineContentSpecs.link,
    personalization: Personalization,
  },
  styleSpecs: { bold: defaultStyleSpecs.bold, italic: defaultStyleSpecs.italic },
});

export type NewsletterEditor = typeof schema.BlockNoteEditor;
export type NewsletterBlockNote = typeof schema.Block;
