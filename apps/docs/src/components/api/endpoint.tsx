import { KeyRound, ShieldCheck, Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyButton } from './copy-button';
import { MethodBadge, type HttpMethod } from './method';

type Auth = 'key' | 'admin' | 'none';

const AUTH: Record<Auth, { icon: ReactNode; label: string; title: string }> = {
  key: { icon: <KeyRound className="size-3" />, label: 'API key', title: 'Authorization: Bearer fs_live_… or fs_test_…' },
  admin: { icon: <ShieldCheck className="size-3" />, label: 'Admin key', title: 'Authorization: Bearer $ADMIN_API_KEY' },
  none: { icon: <Globe className="size-3" />, label: 'Public', title: 'No authentication' },
};

/** Splits `/v1/emails/:id` so path parameters can be highlighted. */
function PathText({ path }: { path: string }) {
  const parts = path.split(/(:[A-Za-z]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith(':') ? (
          <span key={i} className="text-fd-primary">
            <span className="text-brand">{'{'}</span>
            {p.slice(1)}
            <span className="text-brand">{'}'}</span>
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** The method + path bar at the top of every API reference page. */
export function Endpoint({ method, path, auth = 'key' }: { method: HttpMethod; path: string; auth?: Auth }) {
  const a = AUTH[auth];
  return (
    <div className="not-prose my-6 flex flex-wrap items-center gap-3 rounded-xl border border-fd-border bg-fd-card p-1.5 pe-2">
      <MethodBadge method={method} className="py-1.5" />
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-fd-muted-foreground">
        <PathText path={path} />
      </code>
      <span
        title={a.title}
        className="inline-flex items-center gap-1 rounded-md border border-fd-border px-1.5 py-0.5 text-[11px] font-medium text-fd-muted-foreground"
      >
        {a.icon}
        {a.label}
      </span>
      <CopyButton value={path} label="Copy path" />
    </div>
  );
}
