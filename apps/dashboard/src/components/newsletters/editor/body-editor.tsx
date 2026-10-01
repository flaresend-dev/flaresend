"use client";
// The post body: a BlockNote editor restricted to the newsletter schema. Loaded with next/dynamic (ssr: false).
import "@blocknote/mantine/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  FileCaptionButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
  SuggestionMenuController,
  blockTypeSelectItems,
  getDefaultReactSlashMenuItems,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useEditorState,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import {
  ChevronLeft, ChevronRight, ImageIcon, Languages, Minus, MousePointerClick, PenLine, Plus, SlidersHorizontal, Sparkles,
  SpellCheck, UserRound, WandSparkles,
} from "lucide-react";
import type { NewsletterDocument } from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { toastError } from "@/components/ui/toast";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { assetIdOf, assetRef, fromBlocks, toBlocks, type BnBlock, type ImageMeta } from "@/lib/newsletter-doc";
import { schema, type NewsletterEditor } from "./schema";

const MAX_IMAGE = 5 * 1024 * 1024;

/** What the AI controls inside the editor UI need. Provided by the post editor. */
export interface EditorAi {
  enabled: boolean;
  busy: boolean;
  /** Rewrites the blocks the selection touches. */
  rewrite(opts: { instruction: string; tone?: string; language?: string; custom?: string }, blockIds: string[]): void;
  /** Writes after the current block; `instruction` is optional guidance. */
  continueWriting(instruction?: string): void;
  describeImage(assetId: string): Promise<string | null>;
}

interface Ctx {
  meta: ImageMeta;
  setMeta: (id: string, v: ImageMeta[string]) => void;
  ai: EditorAi;
  open: (menu: FloatingMenu) => void;
}
const BodyContext = createContext<Ctx | null>(null);
const useBody = () => useContext(BodyContext)!;

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const o = new MutationObserver(read);
    o.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => o.disconnect();
  }, []);
  return dark;
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

export interface BodyEditorProps {
  slug: string;
  publicationId: string;
  initial: NewsletterDocument;
  editable: boolean;
  onChange: (doc: NewsletterDocument, text: () => string) => void;
  onReady?: (editor: NewsletterEditor, api: { meta: () => ImageMeta }) => void;
  ai: EditorAi;
  /** Block ids of an AI suggestion that is not kept yet. They are tinted. */
  pendingIds: string[];
  serif: boolean;
  accent: string;
}

export default function BodyEditor(props: BodyEditorProps) {
  const { slug, publicationId, initial, editable, onChange, onReady, ai, pendingIds, serif, accent } = props;
  const start = useMemo(() => toBlocks(initial), [initial]);
  const [meta, setMetaState] = useState<ImageMeta>(start.imageMeta);
  const metaRef = useRef(meta);
  const dark = useDarkMode();
  const [menu, setMenu] = useState<FloatingMenu | null>(null);

  const editor = useCreateBlockNote({
    schema,
    initialContent: (start.blocks.length ? start.blocks : [{ type: "paragraph" }]) as never,
    animations: false,
    uploadFile: async (file: File) => {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.");
      if (file.size > MAX_IMAGE) throw new Error("Use an image below 5 MB.");
      const r = await newsletterAction(slug, "uploadNewsletterAsset", publicationId, {
        base64: await toBase64(file),
        mimeType: file.type,
      });
      if (!r.ok) {
        toastError(r.error.message);
        throw new Error(r.error.message);
      }
      return assetRef(r.data.id);
    },
    resolveFileUrl: async (url: string) => {
      const id = assetIdOf(url);
      return id ? `/api/newsletter-assets/${publicationId}/${id}?project=${encodeURIComponent(slug)}` : url;
    },
  });

  const emit = () => {
    const blocks = editor.document as unknown as BnBlock[];
    onChange(fromBlocks(blocks, metaRef.current), () => editor.blocksToMarkdownLossy());
  };
  const setMeta = (id: string, v: ImageMeta[string]) => {
    metaRef.current = { ...metaRef.current, [id]: v };
    setMetaState(metaRef.current);
    emit();
  };

  useEffect(() => {
    onReady?.(editor, { meta: () => metaRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const slashItems = (): DefaultReactSuggestionItem[] => {
    const keep: Record<string, string | undefined> = {
      paragraph: undefined,
      heading_2: "Heading",
      heading_3: "Subheading",
      bullet_list: undefined,
      numbered_list: undefined,
      quote: undefined,
      image: undefined,
      divider: undefined,
    };
    const defaults = getDefaultReactSlashMenuItems(editor)
      .filter((i) => (i as { key?: string }).key! in keep)
      .map((i) => {
        const title = keep[(i as { key?: string }).key!];
        return title ? { ...i, title, group: "Text" } : { ...i, group: ["image", "divider"].includes((i as { key?: string }).key!) ? "Insert" : "Text" };
      })
      .sort((a, b) => (a.group === b.group ? 0 : a.group === "Text" ? -1 : 1));
    const insert = (block: object) => {
      const at = editor.getTextCursorPosition().block;
      const empty = Array.isArray(at.content) && at.content.length === 0;
      if (empty) editor.updateBlock(at, block as never);
      else editor.insertBlocks([block as never], at, "after");
    };
    const custom: DefaultReactSuggestionItem[] = [
      {
        title: "Button",
        subtext: "A link styled as a button",
        aliases: ["button", "cta", "link"],
        group: "Insert",
        icon: <MousePointerClick size={18} />,
        onItemClick: () => insert({ type: "button", props: { label: "Read more", href: "" } }),
      },
      {
        title: "Subscriber's first name",
        subtext: "Each reader sees their own name",
        aliases: ["name", "first", "personalize", "@"],
        group: "Insert",
        icon: <UserRound size={18} />,
        onItemClick: () =>
          editor.insertInlineContent([{ type: "personalization", props: { field: "firstName", fallback: "there" } }, " "]),
      },
      {
        title: "Subscriber's last name",
        aliases: ["surname", "last"],
        group: "Insert",
        icon: <UserRound size={18} />,
        onItemClick: () =>
          editor.insertInlineContent([{ type: "personalization", props: { field: "lastName", fallback: "" } }, " "]),
      },
    ];
    const aiItems: DefaultReactSuggestionItem[] = ai.enabled
      ? [
          {
            title: "Continue writing",
            subtext: "AI writes the next part",
            aliases: ["ai", "continue", "write"],
            group: "AI",
            icon: <Sparkles size={18} className="text-ai-fg" />,
            onItemClick: () => ai.continueWriting(),
          },
          {
            title: "Ask AI to write…",
            subtext: "Describe what to add here",
            aliases: ["ai", "ask", "generate"],
            group: "AI",
            icon: <WandSparkles size={18} className="text-ai-fg" />,
            onItemClick: () => {
              const id = editor.getTextCursorPosition().block.id;
              // Let the slash menu close first so the block has its final position.
              requestAnimationFrame(() => {
                const rect = blockRect(id);
                if (rect) setMenu({ kind: "ask", rect, blockId: id });
              });
            },
          },
        ]
      : [];
    return [...aiItems, ...defaults, ...custom];
  };

  const pendingCss = pendingIds.length
    ? pendingIds
        .map((id) => `.fs-editor [data-id="${CSS.escape(id)}"] > .bn-block-content{background:var(--ai-bg);box-shadow:0 0 0 4px var(--ai-bg);border-radius:3px}`)
        .join("")
    : "";

  return (
    <BodyContext.Provider value={{ meta, setMeta, ai, open: setMenu }}>
      {pendingCss ? <style>{pendingCss}</style> : null}
      <div
        className="fs-editor"
        style={{ ["--nl-accent" as string]: accent, fontFamily: serif ? "Georgia, 'Times New Roman', serif" : undefined }}
      >
        <BlockNoteView
          editor={editor}
          editable={editable}
          theme={dark ? "dark" : "light"}
          slashMenu={false}
          formattingToolbar={false}
          onChange={emit}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => filterSuggestionItems(slashItems(), query)}
          />
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) =>
              filterSuggestionItems(
                (["firstName", "lastName"] as const).map((field) => ({
                  title: field === "firstName" ? "First name" : "Last name",
                  subtext: "Each reader sees their own",
                  icon: <UserRound size={18} />,
                  onItemClick: () =>
                    editor.insertInlineContent([
                      { type: "personalization", props: { field, fallback: field === "firstName" ? "there" : "" } },
                      " ",
                    ]),
                })),
                query,
              )
            }
          />
          <FormattingToolbarController formattingToolbar={Toolbar} />
        </BlockNoteView>
      </div>
      <Floating menu={menu} onClose={() => setMenu(null)} />
    </BodyContext.Provider>
  );
}

/** Menus opened from the toolbar or the slash menu. They live here, not in the toolbar, because the toolbar
 *  hides as soon as focus leaves the editor (for example into the menu's own text field). */
export type FloatingMenu =
  | { kind: "ai"; rect: DOMRect; blockIds: string[] }
  | { kind: "alt"; rect: DOMRect; blockId: string; assetId: string | null }
  | { kind: "ask"; rect: DOMRect; blockId: string };

function blockRect(blockId: string): DOMRect | null {
  return document.querySelector(`.fs-editor [data-id="${CSS.escape(blockId)}"]`)?.getBoundingClientRect() ?? null;
}
function selectionRect(): DOMRect | null {
  const s = window.getSelection();
  if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0).getBoundingClientRect();
  return r.width || r.height ? r : null;
}

function Floating({ menu, onClose }: { menu: FloatingMenu | null; onClose: () => void }) {
  if (!menu) return null;
  const { rect } = menu;
  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor asChild>
        <span aria-hidden style={{ position: "fixed", left: rect.left, top: rect.bottom, width: Math.max(1, rect.width), height: 1 }} />
      </PopoverAnchor>
      {menu.kind === "ai" ? (
        <AiMenu blockIds={menu.blockIds} onDone={onClose} />
      ) : menu.kind === "alt" ? (
        <AltTextPanel blockId={menu.blockId} assetId={menu.assetId} />
      ) : (
        <AskPanel onDone={onClose} />
      )}
    </Popover>
  );
}

function AskPanel({ onDone }: { onDone: () => void }) {
  const { ai } = useBody();
  const [text, setText] = useState("");
  return (
    <PopoverContent className="w-[min(480px,90vw)] p-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          ai.continueWriting(text.trim());
          onDone();
        }}
      >
        <Sparkles className="ml-1 size-4 shrink-0 text-ai-fg" aria-hidden />
        <input
          autoFocus
          aria-label="What should AI write here?"
          placeholder="What should AI write here?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
        />
        <Button type="submit" size="sm" variant="primary" disabled={!text.trim()}>
          Write
        </Button>
      </form>
    </PopoverContent>
  );
}

const TONES = ["friendly", "professional", "casual", "confident", "playful"] as const;
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Afrikaans"];

function AiMenu({ blockIds, onDone }: { blockIds: string[]; onDone: () => void }) {
  const { ai } = useBody();
  const [custom, setCustom] = useState("");
  const [sub, setSub] = useState<null | "tone" | "translate">(null);
  const [language, setLanguage] = useState("");
  const run = (opts: Parameters<EditorAi["rewrite"]>[0]) => {
    onDone();
    ai.rewrite(opts, blockIds);
  };
  const item =
    "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-foreground hover:bg-background-hover focus-visible:bg-background-hover focus-visible:outline-none";
  return (
    <PopoverContent className="w-72 p-1" aria-label="Ask AI">
      <form
        className="flex items-center gap-2 px-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) run({ instruction: "custom", custom: custom.trim() });
        }}
      >
        <Sparkles className="size-3.5 shrink-0 text-ai-fg" aria-hidden />
        <input
          autoFocus
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Tell AI what to change…"
          aria-label="Tell AI what to change"
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
        />
      </form>
      <div className="-mx-1 my-1 border-t border-border" />
      {sub === null ? (
        <>
          <button type="button" className={item} onClick={() => run({ instruction: "improve" })}><PenLine className="size-3.5 text-foreground-subtle" />Improve writing</button>
          <button type="button" className={item} onClick={() => run({ instruction: "fix" })}><SpellCheck className="size-3.5 text-foreground-subtle" />Fix spelling and grammar</button>
          <button type="button" className={item} onClick={() => run({ instruction: "shorter" })}><Minus className="size-3.5 text-foreground-subtle" />Make shorter</button>
          <button type="button" className={item} onClick={() => run({ instruction: "longer" })}><Plus className="size-3.5 text-foreground-subtle" />Make longer</button>
          <button type="button" className={item} onClick={() => setSub("tone")}><SlidersHorizontal className="size-3.5 text-foreground-subtle" /><span className="flex-1">Change tone</span><ChevronRight className="size-3.5 text-foreground-subtle" /></button>
          <button type="button" className={item} onClick={() => setSub("translate")}><Languages className="size-3.5 text-foreground-subtle" /><span className="flex-1">Translate</span><ChevronRight className="size-3.5 text-foreground-subtle" /></button>
        </>
      ) : (
        <>
          <button type="button" className={`${item} text-foreground-muted`} onClick={() => setSub(null)}>
            <ChevronLeft className="size-3.5" />
            {sub === "tone" ? "Tone" : "Language"}
          </button>
          {sub === "tone"
            ? TONES.map((t) => (
                <button key={t} type="button" className={`${item} capitalize`} onClick={() => run({ instruction: "tone", tone: t })}>{t}</button>
              ))
            : LANGUAGES.map((l) => (
                <button key={l} type="button" className={item} onClick={() => run({ instruction: "translate", language: l })}>{l}</button>
              ))}
          {sub === "translate" ? (
            <form
              className="px-1 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (language.trim()) run({ instruction: "translate", language: language.trim() });
              }}
            >
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Another language, then Enter" aria-label="Another language" maxLength={40} />
            </form>
          ) : null}
        </>
      )}
    </PopoverContent>
  );
}

function AltTextPanel({ blockId, assetId }: { blockId: string; assetId: string | null }) {
  const { meta, setMeta, ai } = useBody();
  const [busy, setBusy] = useState(false);
  const m = meta[blockId] ?? { alt: "", decorative: false, href: "" };
  return (
    <PopoverContent className="flex w-80 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`alt-${blockId}`}>Description</Label>
          {ai.enabled && assetId ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs font-medium text-ai-fg disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                const alt = await ai.describeImage(assetId);
                setBusy(false);
                if (alt) setMeta(blockId, { ...m, alt, decorative: false });
              }}
            >
              <Sparkles className="size-3" /> {busy ? "Describing…" : "Describe with AI"}
            </button>
          ) : null}
        </div>
        <Input
          id={`alt-${blockId}`}
          autoFocus
          value={m.alt}
          maxLength={500}
          disabled={m.decorative}
          placeholder="What the image shows"
          onChange={(e) => setMeta(blockId, { ...m, alt: e.target.value })}
        />
        <p className="text-xs text-foreground-muted">Read aloud by screen readers and shown when images are blocked.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={m.decorative} onCheckedChange={(v) => setMeta(blockId, { ...m, decorative: v === true })} />
        Decorative image, no description needed
      </label>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`href-${blockId}`}>Link</Label>
        <Input
          id={`href-${blockId}`}
          value={m.href}
          type="url"
          placeholder="https:// (optional)"
          onChange={(e) => setMeta(blockId, { ...m, href: e.target.value.trim() })}
        />
      </div>
    </PopoverContent>
  );
}

function Toolbar() {
  const editor = useBlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>();
  const { ai, open } = useBody();
  const Components = useComponentsContext()!;
  const items = blockTypeSelectItems(editor.dictionary)
    .filter(
      (i) =>
        ["paragraph", "quote", "bulletListItem", "numberedListItem"].includes(i.type) ||
        (i.type === "heading" && [2, 3].includes(Number(i.props?.level))),
    )
    .map((i) => (i.type === "heading" ? { ...i, name: Number(i.props?.level) === 2 ? "Heading" : "Subheading" } : i));
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => {
      const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
      return {
        ids: blocks.map((b) => b.id),
        textOnly: blocks.every((b) => Array.isArray(b.content)),
        image: blocks.length === 1 && blocks[0]!.type === "image" ? { id: blocks[0]!.id, url: String((blocks[0]!.props as { url?: string }).url ?? "") } : null,
      };
    },
  });
  const anchor = () => selectionRect() ?? blockRect(selected.ids[0] ?? "") ?? new DOMRect(0, 0, 0, 0);
  if (selected.image) {
    const img = selected.image;
    return (
      <FormattingToolbar>
        <FileCaptionButton key="caption" />
        <FileReplaceButton key="replace" />
        <Components.FormattingToolbar.Button
          key="alt"
          mainTooltip="Description and link"
          label="Alt text"
          onClick={() => open({ kind: "alt", rect: blockRect(img.id) ?? anchor(), blockId: img.id, assetId: assetIdOf(img.url) })}
        >
          <span className="flex items-center gap-1.5 px-0.5 text-[13px] font-medium">
            <ImageIcon size={15} /> Alt text
          </span>
        </Components.FormattingToolbar.Button>
      </FormattingToolbar>
    );
  }
  return (
    <FormattingToolbar>
      {ai.enabled ? (
        <Components.FormattingToolbar.Button
          key="ai"
          mainTooltip={selected.textOnly ? "Ask AI to change this text" : "Select text only"}
          isDisabled={!selected.textOnly || ai.busy}
          label="Ask AI"
          onClick={() => open({ kind: "ai", rect: anchor(), blockIds: selected.ids })}
        >
          <span className="flex items-center gap-1.5 px-0.5 text-[13px] font-medium text-ai-fg">
            <Sparkles size={15} /> Ask AI
          </span>
        </Components.FormattingToolbar.Button>
      ) : null}
      <BlockTypeSelect key="type" items={items} />
      <BasicTextStyleButton basicTextStyle="bold" key="bold" />
      <BasicTextStyleButton basicTextStyle="italic" key="italic" />
      <CreateLinkButton key="link" />
    </FormattingToolbar>
  );
}
