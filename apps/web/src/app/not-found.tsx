import { LogoMark } from '@/components/logo';
import { docs } from '@/lib/site';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <LogoMark className="size-12" />
      <p className="mt-6 font-mono text-sm text-brand">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <div className="mt-6 flex gap-3 text-sm">
        <a href="/" className="rounded-lg bg-fg px-4 py-2 font-medium text-bg hover:opacity-90">
          Home
        </a>
        <a href={docs('')} className="rounded-lg border border-line px-4 py-2 font-medium hover:bg-subtle">
          Docs
        </a>
      </div>
    </main>
  );
}
