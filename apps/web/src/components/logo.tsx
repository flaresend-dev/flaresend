/** The Flaresend mark: an orange envelope in front of a cloud. Master copy: assets/logo.png at the repo root. */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
  return <img src="/icon.png" alt="" aria-hidden width={192} height={192} className={`object-contain ${className ?? ''}`} />;
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark className="size-7" />
      Flaresend
    </span>
  );
}
