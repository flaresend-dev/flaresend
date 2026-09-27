'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export type CodeTab = { label: string; file: string; code: string; html: string };

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[active];

  async function copy() {
    await navigator.clipboard.writeText(tab.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2">
        <div role="tablist" className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`relative shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                i === active ? 'text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t.label}
              {i === active && <span className="absolute inset-x-3 -bottom-px h-px bg-brand" />}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-xs text-muted sm:inline">{tab.file}</span>
          <button
            onClick={copy}
            aria-label="Copy code"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </div>
      </div>
      <div
        role="tabpanel"
        className="min-h-[22rem] overflow-x-auto text-[13px] leading-6 [&_pre]:px-4 [&_pre]:py-4 [&_pre]:font-mono"
        dangerouslySetInnerHTML={{ __html: tab.html }}
      />
    </div>
  );
}
