"use client";
// The post editor page: top bar, title, subtitle, the BlockNote body, the details panel, and AI suggestions.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CircleAlert, Copy, Eye, LoaderCircle, PanelRight, RotateCcw, Sparkles, Square,
} from "lucide-react";
import type {
  NewsletterAiInput, NewsletterCapabilities, NewsletterDocument, NewsletterPostRecord, NewsletterSubscriptionRecord,
  PublicationRecord,
} from "@flaresend/types";
import { newsletterAction } from "@/app/newsletter-actions";
import { Button, LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, MoreButton } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { rehydrateTokens, splitDraft, type BnBlock } from "@/lib/newsletter-doc";
import { usePostAutosave } from "./use-post-autosave";
import { streamAi } from "./ai-stream";
import { AiComposer } from "./ai-composer";
import { DetailsPanel } from "./details-panel";
import { PreviewSheet } from "./preview-sheet";
import type { EditorAi } from "./body-editor";
import type { NewsletterEditor } from "./schema";

const BodyEditor = dynamic(() => import("./body-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 pt-1" aria-busy>
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-10/12" />
      <Skeleton className="h-5 w-7/12" />
    </div>
  ),
});

const PANEL_KEY = "fs-nl-details";

function wordsIn(doc: NewsletterDocument) {
  let n = 0;
  const count = (s: string) => (n += s.split(/\s+/).filter(Boolean).length);
  for (const b of doc.blocks) {
    if ("content" in b) b.content.forEach((i) => count(i.type === "text" ? i.text : i.fallback));
    else if ("items" in b) b.items.flat().forEach((i) => count(i.type === "text" ? i.text : i.fallback));
    else if (b.type === "button") count(b.label);
  }
  return n;
}
const isEmptyDoc = (doc: NewsletterDocument) => wordsIn(doc) === 0 && !doc.blocks.some((b) => b.type === "image" || b.type === "button");

/** Markdown from the model, reduced to what the schema holds. */
function cleanMarkdown(md: string) {
  return md
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^#\s+/gm, "## ")
    .replace(/^#{4,6}\s+/gm, "### ")
    .replace(/<[^>]+>/g, "");
}

interface Pending {
  action: NewsletterAiInput["action"];
  input: NewsletterAiInput;
  /** Blocks currently holding the suggestion. */
  ids: string[];
  /** What the suggestion replaced, restored on Discard. Null when it was inserted. */
  originals: BnBlock[] | null;
  /** Block to insert after (continue). */
  anchor: string | null;
  streaming: boolean;
  before: { title: string; subtitle: string; subject: string };
}

export function PostEditor({
  slug,
  publication,
  initial,
  capabilities,
  subscribers,
}: {
  slug: string;
  publication: PublicationRecord;
  initial: NewsletterPostRecord;
  capabilities: NewsletterCapabilities;
  subscribers: NewsletterSubscriptionRecord[];
}) {
  const router = useRouter();
  const base = `/${slug}/newsletters/${publication.id}`;
  const scheduled = initial.webStatus === "scheduled";
  const [readOnly, setReadOnly] = useState(scheduled || !!initial.archivedAt);
  const [pending, setPending] = useState<Pending | null>(null);
  const { post, state, change, save, accept, current } = usePostAutosave(slug, initial, { paused: !!pending, readOnly });
  const editorRef = useRef<NewsletterEditor | null>(null);
  const [panel, setPanel] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bodyEmpty, setBodyEmpty] = useState(() => isEmptyDoc(initial.document));
  const abort = useRef<AbortController | null>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const words = useMemo(() => wordsIn(post.document), [post.document]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(PANEL_KEY);
      if (v !== null) setPanel(v === "1");
    } catch {
      /* storage blocked */
    }
  }, []);
  const togglePanel = () => {
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setSheet(true);
      return;
    }
    setPanel((v) => {
      try {
        localStorage.setItem(PANEL_KEY, v ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !v;
    });
  };

  const onBody = useCallback(
    (doc: NewsletterDocument) => {
      setBodyEmpty(isEmptyDoc(doc));
      change({ document: doc });
    },
    [change],
  );

  // ---------- AI suggestions ----------
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const textRef = useRef("");
  const appliedRef = useRef("");

  const apply = useCallback(
    (final = false) => {
      const editor = editorRef.current;
      const p = pendingRef.current;
      if (!editor || !p) return;
      const text = textRef.current;
      if (text === appliedRef.current && !final) return;
      appliedRef.current = text;
      let md = text;
      if (p.action === "draft") {
        const parts = splitDraft(text);
        // Title and subtitle only fill empty fields; they arrive on the first two lines.
        const lines = text.split("\n").length;
        if (!p.before.title && parts.title && (lines > 1 || final))
          change({ title: parts.title, ...(!current.current.subjectOverridden ? { subject: parts.title } : {}) });
        if (!p.before.subtitle && parts.subtitle && (lines > 2 || final)) change({ subtitle: parts.subtitle });
        md = parts.body;
      }
      const blocks = rehydrateTokens(editor.tryParseMarkdownToBlocks(cleanMarkdown(md)) as unknown as BnBlock[]);
      if (!blocks.length) return;
      let ids: string[];
      if (p.ids.length) {
        const live = p.ids.filter((id) => editor.getBlock(id));
        if (!live.length) return;
        ids = editor.replaceBlocks(live, blocks as never).insertedBlocks.map((b) => b.id);
      } else if (p.anchor && editor.getBlock(p.anchor)) {
        ids = editor.insertBlocks(blocks as never, p.anchor, "after").map((b) => b.id);
      } else {
        const last = editor.document[editor.document.length - 1]!;
        ids = editor.insertBlocks(blocks as never, last, "after").map((b) => b.id);
      }
      const next = { ...p, ids };
      pendingRef.current = next;
      setPending(next);
    },
    [change, current],
  );

  const run = useCallback(
    async (input: NewsletterAiInput, setup: Omit<Pending, "streaming" | "input" | "before" | "action">) => {
      const editor = editorRef.current;
      if (!editor) return;
      const p: Pending = {
        ...setup,
        action: input.action,
        input,
        streaming: true,
        before: { title: current.current.title, subtitle: current.current.subtitle, subject: current.current.subject },
      };
      pendingRef.current = p;
      setPending(p);
      textRef.current = "";
      appliedRef.current = "";
      const controller = new AbortController();
      abort.current = controller;
      const tick = setInterval(() => apply(), 150);
      try {
        await streamAi(slug, publication.id, input, (t) => (textRef.current = t), controller.signal);
        apply(true);
      } catch (err) {
        if (!controller.signal.aborted) {
          toastError((err as Error).message);
          discard();
        }
      } finally {
        clearInterval(tick);
        abort.current = null;
        if (pendingRef.current) {
          const done = { ...pendingRef.current, streaming: false };
          pendingRef.current = done;
          setPending(done);
          if (!done.ids.length) setPending(null);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, publication.id, apply],
  );

  const discard = useCallback(() => {
    abort.current?.abort();
    const editor = editorRef.current;
    const p = pendingRef.current;
    if (editor && p) {
      const live = p.ids.filter((id) => editor.getBlock(id));
      if (p.originals && live.length) editor.replaceBlocks(live, p.originals as never);
      else if (live.length) {
        if (live.length === editor.document.length) editor.replaceBlocks(live, [{ type: "paragraph" }] as never);
        else editor.removeBlocks(live);
      }
      if (p.action === "draft") change({ title: p.before.title, subtitle: p.before.subtitle, subject: p.before.subject });
    }
    pendingRef.current = null;
    setPending(null);
  }, [change]);

  const keep = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const again = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    const anchor = p.anchor;
    const originals = p.originals;
    const input = p.input;
    discard();
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      if (input.action === "rewrite" && originals) void run(input, { ids: originals.map((b) => b.id!), originals, anchor: null });
      else if (input.action === "draft") void run(input, { ids: editor.document.map((b) => b.id), originals: editor.document as unknown as BnBlock[], anchor: null });
      else void run(input, { ids: [], originals: null, anchor });
    });
  }, [discard, run]);

  useEffect(() => {
    if (!pending || pending.streaming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !(e.target as HTMLElement)?.closest("input,textarea,[contenteditable=true]")) {
        e.preventDefault();
        keep();
      } else if (e.key === "Escape") {
        e.preventDefault();
        discard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, keep, discard]);

  const ai: EditorAi = useMemo(
    () => ({
      enabled: capabilities.ai && !readOnly,
      busy: !!pending,
      rewrite: (opts, blockIds) => {
        const editor = editorRef.current;
        if (!editor || pendingRef.current) return;
        const blocks = blockIds.map((id) => editor.getBlock(id)).filter((b): b is NonNullable<typeof b> => !!b);
        if (!blocks.length) return;
        const text = editor.blocksToMarkdownLossy(blocks).trim();
        if (!text) return;
        void run(
          { action: "rewrite", text: text.slice(0, 8000), instruction: opts.instruction as never, tone: opts.tone as never, language: opts.language, custom: opts.custom },
          { ids: blocks.map((b) => b.id), originals: structuredClone(blocks) as unknown as BnBlock[], anchor: null },
        );
      },
      continueWriting: (instruction) => {
        const editor = editorRef.current;
        if (!editor || pendingRef.current) return;
        const at = editor.getTextCursorPosition().block;
        const index = editor.document.findIndex((b) => b.id === at.id);
        const before = editor.blocksToMarkdownLossy(editor.document.slice(0, index + 1)).slice(-12000);
        const empty = Array.isArray(at.content) && at.content.length === 0;
        void run(
          { action: "continue", title: current.current.title.slice(0, 100), before, ...(instruction ? { instruction } : {}) },
          empty ? { ids: [at.id], originals: [structuredClone(at)] as unknown as BnBlock[], anchor: null } : { ids: [], originals: null, anchor: at.id },
        );
      },
      describeImage: async (assetId) => {
        const r = await newsletterAction(slug, "newsletterAi", publication.id, { action: "alt-text", assetId });
        if (!r.ok) {
          toastError(r.error.message);
          return null;
        }
        return r.data.altText ?? null;
      },
    }),
    [capabilities.ai, readOnly, pending, run, slug, publication.id, current],
  );

  const draft = (input: Extract<NewsletterAiInput, { action: "draft" }>) => {
    const editor = editorRef.current;
    if (!editor) return;
    void run(input, {
      ids: editor.document.map((b) => b.id),
      originals: structuredClone(editor.document) as unknown as BnBlock[],
      anchor: null,
    });
  };

  // ---------- commands ----------
  async function command(c: "duplicate" | "archive" | "delete" | "unpublish-web" | "cancel-web-schedule") {
    if (!(await save())) return { error: "Save the post first." };
    const p = current.current;
    const r = await newsletterAction(slug, "newsletterPostCommand", p.publicationId, p.id, c, p.revision);
    if (!r.ok) {
      toastError(r.error.message);
      return { error: r.error.message };
    }
    if ("deleted" in r.data || c === "archive") {
      router.push(`${base}/posts`);
      return { ok: true };
    }
    if (c === "duplicate") {
      toastSuccess("Post duplicated.");
      router.push(`${base}/posts/${r.data.id}`);
      return { ok: true };
    }
    accept(r.data);
    if (c === "cancel-web-schedule") setReadOnly(false);
    toastSuccess(c === "unpublish-web" ? "Removed from the website." : "Schedule canceled. You can edit again.");
    router.refresh();
    return { ok: true };
  }

  const status = post.webStatus === "scheduled" || post.email?.status === "scheduled"
    ? "scheduled"
    : post.publicRevisionId || post.email?.status === "sent"
      ? "published"
      : "draft";

  const details = (
    <DetailsPanel
      slug={slug}
      publication={publication}
      post={post}
      ai={capabilities.ai && !readOnly}
      readOnly={readOnly}
      onChange={change}
      bodyMarkdown={() => editorRef.current?.blocksToMarkdownLossy() ?? ""}
    />
  );

  return (
    <div data-fullbleed className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-border bg-background px-3 md:px-5">
        <LinkButton href={`${base}/posts`} variant="ghost" size="sm" className="shrink-0">
          <ArrowLeft /> <span className="hidden sm:inline">Posts</span>
        </LinkButton>
        <span className="hidden text-foreground-subtle sm:inline" aria-hidden>/</span>
        <Link href={base} className="hidden truncate text-sm text-foreground-muted hover:text-foreground sm:inline">
          {publication.name}
        </Link>
        <StatusBadge status={status} className="ml-1 hidden sm:inline-flex" />
        <span className="flex-1" />
        <SaveIndicator state={state} onRetry={() => void save()} />
        <DropdownMenu>
          <MoreButton label="Post actions" />
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem onSelect={() => void command("duplicate")}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            {post.webStatus === "scheduled" ? (
              <DropdownMenuItem onSelect={() => void command("cancel-web-schedule")}>Cancel website schedule</DropdownMenuItem>
            ) : null}
            {post.publicRevisionId ? (
              <DropdownMenuItem onSelect={() => void command("unpublish-web")}>Remove from the website</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void command("archive")}>Archive</DropdownMenuItem>
            {!post.publishedAt && !post.publicRevisionId && post.webStatus !== "scheduled" && !post.email ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onSelect={() => setConfirmDelete(true)}>
                  Delete draft
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" aria-label={panel ? "Hide details" : "Show details"} aria-pressed={panel} onClick={togglePanel}>
          <PanelRight />
        </Button>
        <Button
          variant="secondary"
          className="hidden sm:inline-flex"
          onClick={async () => {
            if (await save()) setPreview(true);
          }}
        >
          <Eye /> Preview
        </Button>
        <Button
          variant="primary"
          disabled={!!pending}
          onClick={async () => {
            if (await save()) router.push(`${base}/posts/${post.id}/review`);
          }}
        >
          <span className="hidden sm:inline">Review and send</span>
          <span className="sm:hidden">Review</span>
          <ArrowRight />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 items-start">
        {/* Canvas */}
        <main className="min-w-0 flex-1 px-5 pt-10 pb-40 md:px-10 md:pt-14">
          <div className="mx-auto max-w-[680px]">
            {state.kind === "conflict" ? (
              <Notice
                tone="danger"
                icon={<CircleAlert />}
                className="mb-6"
                actions={
                  <>
                    <Button size="sm" onClick={() => location.reload()}>Reload saved version</Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `${current.current.slug || "post"}-draft.json`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                    >
                      Download my draft
                    </Button>
                  </>
                }
              >
                {state.message}
              </Notice>
            ) : null}
            {post.webStatus === "scheduled" ? (
              <Notice
                tone="info"
                className="mb-6"
                actions={<Button size="sm" onClick={() => void command("cancel-web-schedule")}>Cancel schedule</Button>}
              >
                This post is scheduled for the website. Cancel the schedule to edit it.
              </Notice>
            ) : post.archivedAt ? (
              <Notice tone="muted" className="mb-6">This post is archived and can no longer be edited.</Notice>
            ) : null}

            <textarea
              aria-label="Title"
              rows={1}
              maxLength={100}
              readOnly={readOnly || !!pending}
              value={post.title}
              placeholder="Post title"
              onChange={(e) =>
                change({ title: e.target.value.replace(/\n/g, ""), ...(!post.subjectOverridden ? { subject: e.target.value.replace(/\n/g, "") } : {}) })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  subtitleRef.current?.focus();
                }
              }}
              className="w-full resize-none bg-transparent text-[32px] leading-[1.2] font-[650] tracking-[-0.02em] text-balance text-foreground outline-none [field-sizing:content] placeholder:text-foreground-subtle"
            />
            <textarea
              ref={subtitleRef}
              aria-label="Subtitle"
              rows={1}
              maxLength={200}
              readOnly={readOnly || !!pending}
              value={post.subtitle}
              placeholder="Add a subtitle"
              onChange={(e) => change({ subtitle: e.target.value.replace(/\n/g, "") })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editorRef.current?.focus();
                }
              }}
              className="mt-2.5 w-full resize-none bg-transparent text-[19px] leading-[1.45] text-foreground-muted outline-none [field-sizing:content] placeholder:text-foreground-subtle"
            />
            <div className="mt-5 mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-5 text-xs text-foreground-muted">
              <span>{publication.name}</span>
              {post.authorLabel ? (
                <>
                  <span className="text-foreground-subtle" aria-hidden>·</span>
                  <span>By {post.authorLabel}</span>
                </>
              ) : null}
              <span className="text-foreground-subtle" aria-hidden>·</span>
              <span className="tabular-nums">
                {pending?.streaming ? "Writing…" : words ? `${Math.max(1, Math.ceil(words / 230))} min read · ${words.toLocaleString()} words` : "Empty"}
              </span>
            </div>

            {bodyEmpty && !pending && !readOnly && capabilities.ai ? <AiComposer onDraft={draft} /> : null}

            <div
              className={cn(
                "text-[17px] leading-[1.7]",
                bodyEmpty && !pending && capabilities.ai && !readOnly && "mt-8",
              )}
            >
              <BodyEditor
                slug={slug}
                publicationId={publication.id}
                initial={initial.document}
                editable={!readOnly && !pending}
                onChange={onBody}
                onReady={(e) => (editorRef.current = e)}
                ai={ai}
                pendingIds={pending?.ids ?? []}
                serif={publication.theme.font === "serif"}
                accent={publication.theme.accent}
              />
            </div>

            {pending ? (
              <AiReviewBar
                streaming={pending.streaming}
                label={pending.action === "draft" ? "Writing your draft" : pending.action === "rewrite" ? "Rewriting" : "Writing"}
                onStop={() => abort.current?.abort()}
                onKeep={keep}
                onAgain={again}
                onDiscard={discard}
              />
            ) : null}
          </div>
        </main>

        {/* Details panel */}
        {panel ? (
          <aside
            aria-label="Post details"
            className="sticky top-[52px] hidden h-[calc(100dvh-52px)] w-[312px] shrink-0 overflow-y-auto border-l border-border bg-background-subtle p-5 xl:block"
          >
            {details}
          </aside>
        ) : null}
      </div>

      <Sheet open={sheet} onOpenChange={setSheet} title="Post details">
        {details}
      </Sheet>
      <PreviewSheet
        open={preview}
        onOpenChange={setPreview}
        slug={slug}
        post={post}
        subscribers={subscribers}
        canSendTest={capabilities.email}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        body="The draft and its history are removed. This cannot be undone."
        confirmLabel="Delete draft"
        tone="danger"
        onConfirm={async () => (await command("delete")) as never}
      />
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: ReturnType<typeof usePostAutosave>["state"]; onRetry: () => void }) {
  return (
    <span aria-live="polite" className="hidden items-center gap-1.5 text-xs whitespace-nowrap text-foreground-muted md:inline-flex">
      {state.kind === "saving" ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Saving…
        </>
      ) : state.kind === "dirty" ? (
        "Unsaved changes"
      ) : state.kind === "error" ? (
        <span className="text-danger-fg">
          Could not save.{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
            Retry
          </button>
        </span>
      ) : state.kind === "conflict" ? (
        <span className="text-danger-fg">Not saved</span>
      ) : state.at ? (
        <>
          <Check className="size-3.5 text-success-fg" aria-hidden />
          Saved {state.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </>
      ) : (
        <>
          <Check className="size-3.5 text-success-fg" aria-hidden /> Saved
        </>
      )}
    </span>
  );
}

function AiReviewBar({
  streaming, label, onStop, onKeep, onAgain, onDiscard,
}: {
  streaming: boolean;
  label: string;
  onStop: () => void;
  onKeep: () => void;
  onAgain: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="AI suggestion"
      className="sticky bottom-6 z-20 mx-auto mt-8 flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background-elevated py-1.5 pr-1.5 pl-3 shadow-pop"
    >
      <Sparkles className="size-3.5 text-ai-fg" aria-hidden />
      <span className="mr-1.5 text-xs text-foreground-muted" aria-live="polite">
        {streaming ? `${label}…` : "Keep this suggestion?"}
      </span>
      {streaming ? (
        <Button size="sm" onClick={onStop}>
          <Square className="size-3" /> Stop
        </Button>
      ) : (
        <>
          <Button size="sm" variant="primary" onClick={onKeep}>
            Keep <kbd className="ml-0.5 rounded border border-white/25 px-1 text-[10px] font-normal opacity-80 dark:border-black/20">⏎</kbd>
          </Button>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            <RotateCcw className="size-3.5" /> Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Discard <kbd className="ml-0.5 rounded border border-border px-1 text-[10px] font-normal">Esc</kbd>
          </Button>
        </>
      )}
    </div>
  );
}
