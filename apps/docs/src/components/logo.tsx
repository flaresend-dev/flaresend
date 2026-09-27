import { cn } from '@/lib/cn';

/** The Flaresend mark: an orange envelope in front of a cloud. Transparent, so it works on light and dark. */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
  return <img src="/icon.png" alt="" aria-hidden width={192} height={192} className={cn('object-contain', className)} />;
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark className="size-7" />
      <span>Flaresend</span>
      <span className="rounded-md border border-fd-border px-1.5 py-px text-[11px] font-medium text-fd-muted-foreground">
        Docs
      </span>
    </span>
  );
}
