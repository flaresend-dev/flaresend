import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="font-mono text-sm text-brand">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="max-w-md text-fd-muted-foreground">
          It may have moved. Search with <kbd className="rounded border border-fd-border px-1.5 font-mono text-xs">Ctrl K</kbd>, or
          start from one of these.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm">
          <Link href="/docs" className="rounded-lg border border-fd-border px-3 py-2 hover:bg-fd-accent">
            Documentation
          </Link>
          <Link href="/docs/api-reference" className="rounded-lg border border-fd-border px-3 py-2 hover:bg-fd-accent">
            API Reference
          </Link>
          <Link href="/docs/self-hosting" className="rounded-lg border border-fd-border px-3 py-2 hover:bg-fd-accent">
            Self-hosting
          </Link>
        </div>
      </main>
    </HomeLayout>
  );
}
