"use client";
// The newsletter's look: layout, accent colour, typeface, and a live sample in the same style as the real renderer.
import { useState } from "react";
import type { NewsletterTheme } from "@flaresend/types";
import { Segmented } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const SWATCHES = ["#c2410c", "#1d4ed8", "#047857", "#6d28d9", "#171717"];

function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
/** Same rules as apps/mailer/src/core/newsletters/render.ts. */
export const buttonInk = (accent: string) => (luminance(accent) > 0.179 ? "#000000" : "#ffffff");
export const textAccent = (accent: string) => (luminance(accent) <= 0.183 ? accent : "#171717");

const LAYOUTS: Array<{ id: NewsletterTheme["layout"]; name: string; text: string }> = [
  { id: "letter", name: "Letter", text: "One focused article" },
  { id: "digest", name: "Digest", text: "Short sections and links" },
  { id: "announcement", name: "Announcement", text: "Big title, one action" },
];

function Thumb({ layout, accent }: { layout: NewsletterTheme["layout"]; accent: string }) {
  const bar = (w: string, h = 4, extra?: React.CSSProperties) => (
    <i className="block rounded-sm bg-border-strong" style={{ width: w, height: h, ...extra }} />
  );
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-[84px] flex-col gap-[5px] rounded-md border border-border bg-background-subtle p-2.5",
        layout === "announcement" && "items-center",
      )}
    >
      {bar("30%", 4, { background: accent })}
      {bar(layout === "announcement" ? "76%" : "80%", layout === "announcement" ? 9 : 7)}
      {layout === "digest" ? bar("100%", 2, { background: accent }) : bar("100%")}
      {bar(layout === "announcement" ? "60%" : "90%")}
      {layout === "announcement" ? bar("34%", 10, { background: accent, borderRadius: 3, marginTop: 4 }) : bar("70%")}
    </div>
  );
}

export function LookPicker({ value, onChange }: { value: NewsletterTheme; onChange: (t: NewsletterTheme) => void }) {
  const [hex, setHex] = useState(value.accent);
  const custom = !SWATCHES.includes(value.accent.toLowerCase());
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium">Layout</legend>
        <div className="grid grid-cols-3 gap-3" role="radiogroup">
          {LAYOUTS.map((l) => {
            const on = value.layout === l.id;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...value, layout: l.id })}
                className={cn(
                  "flex flex-col rounded-lg border bg-background-elevated p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-border-strong",
                )}
              >
                <Thumb layout={l.id} accent={value.accent} />
                <span className="mt-2 text-sm font-medium">{l.name}</span>
                <span className="text-xs text-foreground-muted">{l.text}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium">Accent colour</legend>
          <div className="flex items-center gap-2" role="radiogroup">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={value.accent.toLowerCase() === c}
                aria-label={c}
                onClick={() => {
                  setHex(c);
                  onChange({ ...value, accent: c });
                }}
                className={cn(
                  "size-6 rounded-full border-2 border-background-elevated transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  value.accent.toLowerCase() === c ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-[0_0_0_1px_var(--border-strong)]",
                )}
                style={{ background: c }}
              />
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                    custom ? "border-foreground text-foreground" : "border-border text-foreground-muted hover:text-foreground",
                  )}
                >
                  {custom ? <span className="size-3 rounded-full" style={{ background: value.accent }} /> : null}
                  Custom
                </button>
              </PopoverTrigger>
              <PopoverContent className="flex w-56 flex-col gap-2">
                <Label htmlFor="accent-hex">Colour</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Pick a colour"
                    value={value.accent}
                    onChange={(e) => {
                      setHex(e.target.value);
                      onChange({ ...value, accent: e.target.value });
                    }}
                    className="h-8 w-10 cursor-pointer rounded-md border border-border-strong bg-transparent p-0.5"
                  />
                  <Input
                    id="accent-hex"
                    value={hex}
                    maxLength={7}
                    className="font-mono"
                    onChange={(e) => {
                      setHex(e.target.value);
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange({ ...value, accent: e.target.value.toLowerCase() });
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Typeface</span>
          <Segmented
            ariaLabel="Typeface"
            value={value.font}
            onChange={(font) => onChange({ ...value, font })}
            options={[
              { value: "sans", label: "Sans" },
              { value: "serif", label: <span style={{ fontFamily: "Georgia, serif" }}>Serif</span> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** A sample post in the chosen look. Mirrors render.ts closely enough to judge colour, type and layout. */
export function LookPreview({
  theme, name, description, target, logoUrl,
}: {
  theme: NewsletterTheme;
  name: string;
  description?: string;
  target: "email" | "web";
  logoUrl?: string | null;
}) {
  const font = theme.font === "serif" ? "Georgia, serif" : "Arial, Helvetica, sans-serif";
  const announce = theme.layout === "announcement";
  const digest = theme.layout === "digest";
  return (
    <div className="bg-[#fafafa] p-4" style={{ fontFamily: font, color: "#171717" }}>
      <div className="mx-auto max-w-[600px] rounded bg-white px-6 py-7 text-[15px] leading-[1.65] shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
        <header
          className={cn("mb-6", announce && "py-3 text-center")}
          style={digest ? { paddingBottom: 18, borderBottom: `3px solid ${theme.accent}` } : undefined}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className={cn("mb-4 max-h-12 w-auto", announce && "mx-auto")} />
          ) : null}
          <p className="mb-3 text-[12px] font-bold" style={{ color: textAccent(theme.accent) }}>
            {name || "Your newsletter"}
          </p>
          {target === "web" && description ? (
            <>
              <h3 className="m-0 text-[22px] leading-tight font-bold">{description}</h3>
              <div className="mt-4 flex gap-2">
                <span className="flex h-9 flex-1 items-center rounded-md border border-[#d4d4d4] px-2.5 text-[13px] text-[#a3a3a3]">you@example.com</span>
                <span className="inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold" style={{ background: theme.accent, color: buttonInk(theme.accent) }}>
                  Subscribe
                </span>
              </div>
            </>
          ) : (
            <>
              <h3 className={cn("m-0 leading-tight font-bold", announce ? "text-[30px]" : "text-[24px]")}>A note worth sharing</h3>
              <p className="mt-2 mb-0 text-[16px] text-[#525252]">A sample subtitle sits here</p>
            </>
          )}
        </header>
        {target === "web" && description ? (
          <div className="space-y-3 text-[14px]">
            <p className="m-0 font-bold">What we learned this month</p>
            <p className="m-0 text-[12px] text-[#737373]">A recent post</p>
          </div>
        ) : (
          <>
            {digest ? <p className="m-0 mb-2 border-t border-[#d4d4d4] pt-4 text-[17px] font-bold">This week</p> : null}
            <p className="m-0 mb-4">
              Your writing goes here. Headings, lists, images, quotes and buttons follow the layout and colour you pick.{" "}
              <u style={{ color: textAccent(theme.accent) }}>A link</u> looks like this.
            </p>
            <p className={cn("m-0 my-5", announce && "text-center")}>
              <span className="inline-block rounded-md px-5 py-2.5 text-[14px] font-bold" style={{ background: theme.accent, color: buttonInk(theme.accent) }}>
                A button
              </span>
            </p>
            <footer className="mt-6 border-t border-[#d4d4d4] pt-3 text-[12px] text-[#525252]">
              {name || "Your newsletter"} · <u>Unsubscribe</u>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
