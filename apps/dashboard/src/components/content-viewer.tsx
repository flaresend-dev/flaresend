"use client";

import { useState } from "react";
import type { EmailContent } from "@flaresend/types";
import { bytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Segmented, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeEditor } from "@/components/code-editor";

/** Sandboxed preview: no scripts, no same-origin; links open in a new tab only if the user clicks them. */
export function HtmlFrame({ html, title, className }: { html: string; title: string; className?: string }) {
  return (
    <iframe
      title={title}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={html}
      referrerPolicy="no-referrer"
      className={cn("h-[560px] w-full rounded-md border border-border bg-white", className)}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-40 items-center justify-center text-sm text-foreground-muted">{children}</p>;
}

/** Email content tabs: Preview / Plain text / HTML / Headers / Attachments. */
export function ContentViewer({ content }: { content: EmailContent }) {
  const [tab, setTab] = useState(content.html ? "preview" : "text");
  const [asSent, setAsSent] = useState<"original" | "sent">("original");
  const hasTracked = Boolean(content.trackedHtml);
  const headers = Object.entries(content.headers ?? {});
  const shownHtml = asSent === "sent" && content.trackedHtml ? content.trackedHtml : (content.html ?? "");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4">
        <TabsList className="border-b-0">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="text">Plain text</TabsTrigger>
          <TabsTrigger value="html">HTML</TabsTrigger>
          <TabsTrigger value="headers">
            Headers <span className="text-foreground-subtle tabular-nums">{headers.length}</span>
          </TabsTrigger>
          <TabsTrigger value="attachments">
            Attachments <span className="text-foreground-subtle tabular-nums">{content.attachments.length}</span>
          </TabsTrigger>
        </TabsList>
        {hasTracked && (tab === "preview" || tab === "html") ? (
          <Segmented
            ariaLabel="HTML version"
            className="mb-1.5 h-7"
            value={asSent}
            onChange={setAsSent}
            options={[
              { value: "original", label: "Original" },
              { value: "sent", label: "As sent" },
            ]}
          />
        ) : null}
      </div>
      <div className="p-4">
        <TabsContent value="preview">
          {content.html ? (
            <>
              <HtmlFrame title="Email preview" html={shownHtml} />
              {hasTracked ? (
                <p className="mt-2 text-xs text-foreground-muted">
                  {asSent === "sent"
                    ? "The HTML actually sent: links rewritten for click tracking and an open pixel added."
                    : "The HTML as submitted. The stored original is never changed."}
                </p>
              ) : null}
            </>
          ) : (
            <Empty>This email has no HTML part.</Empty>
          )}
        </TabsContent>
        <TabsContent value="text">
          {content.text ? (
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background-subtle p-4 font-mono text-xs leading-relaxed">
              {content.text}
            </pre>
          ) : (
            <Empty>This email has no plain text part.</Empty>
          )}
        </TabsContent>
        <TabsContent value="html">
          {content.html ? <CodeEditor value={shownHtml} language="html" readOnly height="560px" ariaLabel="Email HTML source" /> : <Empty>This email has no HTML part.</Empty>}
        </TabsContent>
        <TabsContent value="headers">
          {headers.length ? (
            <dl className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-2 font-mono text-xs">
              {headers.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-foreground-muted">{k}</dt>
                  <dd className="min-w-0 break-all">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Empty>No custom headers.</Empty>
          )}
        </TabsContent>
        <TabsContent value="attachments">
          {content.attachments.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {content.attachments.map((a, i) => (
                <li key={`${a.filename}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">{a.filename}</span>
                  <span className="shrink-0 text-xs text-foreground-muted">
                    {a.type ?? "unknown type"} · {bytes(a.size)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No attachments.</Empty>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
