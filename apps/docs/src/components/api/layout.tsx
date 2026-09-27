import type { ReactNode } from 'react';

/**
 * Two-column API reference layout. On wide screens the request/response examples stick to the right,
 * like Resend's API reference; below 1280px they stack under the description.
 *
 * ```mdx
 * <ApiPage>
 * <ApiMain>…fields…</ApiMain>
 * <ApiAside>
 * <ApiExample title="Request">```ts tab="Node.js" tab-group="lang" …```</ApiExample>
 * <ApiExample title="Response">```json …```</ApiExample>
 * </ApiAside>
 * </ApiPage>
 * ```
 */
export function ApiPage({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">{children}</div>;
}

export function ApiMain({ children }: { children: ReactNode }) {
  return <div className="min-w-0 [&>h2:first-child]:mt-2">{children}</div>;
}

export function ApiAside({ children }: { children: ReactNode }) {
  return (
    <aside className="min-w-0 max-xl:mt-10">
      <div className="api-aside flex flex-col gap-5 pb-2">{children}</div>
    </aside>
  );
}

/** A titled example panel. Put one fenced block, or several with `tab="…"`, inside. */
export function ApiExample({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="not-prose-headings">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-fd-muted-foreground">{title}</div>
      <div className="[&_figure]:my-0">{children}</div>
    </section>
  );
}
