"use client";
// Shown above an empty post body: describe the issue and Workers AI writes a first draft.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { NewsletterAiInput } from "@flaresend/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type DraftInput = Extract<NewsletterAiInput, { action: "draft" }>;

const STARTERS: Array<[string, string]> = [
  ["Product update", "A product update for our customers.\n- What is new:\n- Why it matters to them:\n- What is next:"],
  ["Weekly roundup", "This week's roundup.\n- Three things that happened:\n- Two links worth reading:\n- One thing to look forward to:"],
  ["Event announcement", "Announce an event.\n- What:\n- When and where:\n- Who it is for:\n- How to sign up:"],
  ["Lessons learned", "A short essay on something we learned.\n- The situation:\n- What went wrong or right:\n- What we do differently now:"],
];

export function AiComposer({ onDraft }: { onDraft: (input: DraftInput) => void }) {
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<NonNullable<DraftInput["tone"]>>("friendly");
  const [length, setLength] = useState<NonNullable<DraftInput["length"]>>("medium");
  const submit = () => {
    if (brief.trim()) onDraft({ action: "draft", brief: brief.trim().slice(0, 6000), tone, length });
  };
  return (
    <section aria-label="Draft with AI">
      <div className="rounded-lg border border-ai-border bg-background-elevated shadow-[0_0_0_4px_var(--ai-bg)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--ai-bg),0_0_0_1px_var(--ai-border)]">
        <textarea
          aria-label="What is this issue about?"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={6000}
          rows={3}
          placeholder="What is this issue about? Paste notes, links, or bullet points and AI writes a first draft."
          className="block min-h-[92px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-[15px] leading-relaxed text-foreground outline-none [field-sizing:content] placeholder:text-foreground-subtle"
        />
        <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2 pb-2.5">
          <Select
            ariaLabel="Tone"
            className="h-7 w-auto rounded-full text-xs"
            value={tone}
            onValueChange={(v) => setTone(v as typeof tone)}
            options={[
              { value: "friendly", label: "Tone: Friendly" },
              { value: "professional", label: "Tone: Professional" },
              { value: "casual", label: "Tone: Casual" },
              { value: "confident", label: "Tone: Confident" },
              { value: "playful", label: "Tone: Playful" },
            ]}
          />
          <Select
            ariaLabel="Length"
            className="h-7 w-auto rounded-full text-xs"
            value={length}
            onValueChange={(v) => setLength(v as typeof length)}
            options={[
              { value: "short", label: "Length: Short" },
              { value: "medium", label: "Length: Medium" },
              { value: "long", label: "Length: Long" },
            ]}
          />
          <span className="flex-1" />
          <span className="hidden text-xs text-foreground-subtle sm:inline">Uses Workers AI</span>
          <Button size="sm" variant="primary" disabled={!brief.trim()} onClick={submit}>
            <Sparkles className="size-3.5" /> Draft post
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-foreground-muted">Start from:</span>
        {STARTERS.map(([label, text]) => (
          <button
            key={label}
            type="button"
            onClick={() => setBrief(text)}
            className="inline-flex h-7 items-center rounded-full border border-border bg-background-elevated px-2.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-9 text-[17px] text-foreground-subtle">
        Or start writing below. Press <kbd className="rounded border border-border bg-background-subtle px-1.5 py-0.5 text-xs">/</kbd> for blocks
        and <kbd className="rounded border border-border bg-background-subtle px-1.5 py-0.5 text-xs">@</kbd> for a subscriber&apos;s name.
      </p>
    </section>
  );
}
