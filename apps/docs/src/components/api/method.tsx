import { cn } from '@/lib/cn';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

const COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-400',
  POST: 'text-sky-700 bg-sky-500/10 border-sky-500/25 dark:text-sky-400',
  PATCH: 'text-amber-700 bg-amber-500/10 border-amber-500/25 dark:text-amber-400',
  PUT: 'text-violet-700 bg-violet-500/10 border-violet-500/25 dark:text-violet-400',
  DELETE: 'text-red-700 bg-red-500/10 border-red-500/25 dark:text-red-400',
};

/** Short labels for the sidebar, where space is tight. */
const SHORT: Record<HttpMethod, string> = { GET: 'GET', POST: 'POST', PATCH: 'PATCH', PUT: 'PUT', DELETE: 'DEL' };

export function MethodBadge({ method, size = 'md', className }: { method: HttpMethod; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-semibold leading-none',
        size === 'sm' ? 'min-w-[2.6rem] px-1 py-[3px] text-[9.5px]' : 'px-2 py-1 text-xs',
        COLORS[method],
        className,
      )}
    >
      {size === 'sm' ? SHORT[method] : method}
    </span>
  );
}
