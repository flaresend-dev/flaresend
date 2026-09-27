import { ChevronRight, Link as LinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  /** Field name. For request fields prefer the location props below. */
  name?: string;
  body?: string;
  query?: string;
  path?: string;
  header?: string;
  type?: string;
  required?: boolean;
  default?: string;
  deprecated?: boolean;
  children?: ReactNode;
}

const LOCATION_LABEL = { body: 'body', query: 'query', path: 'path', header: 'header' } as const;

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function Field({ kind, ...props }: FieldProps & { kind: 'param' | 'response' }) {
  const location = props.path !== undefined ? 'path' : props.query !== undefined ? 'query' : props.header !== undefined ? 'header' : props.body !== undefined ? 'body' : null;
  const name = props.path ?? props.query ?? props.header ?? props.body ?? props.name ?? '';
  const id = `${kind}-${location ?? 'field'}-${slug(name)}`;

  return (
    <div id={id} className="group/field scroll-mt-24 border-b border-fd-border py-5 first:pt-2 last:border-b-0">
      <div className="not-prose flex flex-wrap items-center gap-x-2 gap-y-1">
        <a href={`#${id}`} className="relative font-mono text-[13.5px] font-semibold text-fd-foreground">
          <LinkIcon className="absolute -left-5 top-1/2 size-3.5 -translate-y-1/2 text-fd-muted-foreground opacity-0 transition-opacity group-hover/field:opacity-100" />
          {name}
        </a>
        {props.type && (
          <span className="rounded-md bg-fd-muted px-1.5 py-0.5 font-mono text-[11.5px] text-fd-muted-foreground">{props.type}</span>
        )}
        {location && location !== 'body' && (
          <span className="text-[11.5px] text-fd-muted-foreground">{LOCATION_LABEL[location]}</span>
        )}
        {props.required && (
          <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">required</span>
        )}
        {props.deprecated && (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">deprecated</span>
        )}
        {props.default !== undefined && (
          <span className="text-[11.5px] text-fd-muted-foreground">
            default: <code className="font-mono text-fd-foreground">{props.default}</code>
          </span>
        )}
      </div>
      {props.children && (
        <div className="mt-2 text-[14.5px] leading-relaxed text-fd-muted-foreground [&>p]:my-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
          {props.children}
        </div>
      )}
    </div>
  );
}

/** A request field: `<ParamField body="from" type="string" required>…</ParamField>`. */
export function ParamField(props: FieldProps) {
  return <Field kind="param" {...props} />;
}

/** A response field: `<ResponseField name="id" type="string">…</ResponseField>`. */
export function ResponseField(props: FieldProps) {
  return <Field kind="response" {...props} />;
}

/** Collapsible group of nested fields (object properties, array items). */
export function Expandable({ title = 'properties', defaultOpen = false, children }: { title?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group/exp not-prose mt-3 rounded-lg border border-fd-border">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-fd-muted-foreground hover:text-fd-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open/exp:rotate-90" />
        <span className="group-open/exp:hidden">Show {title}</span>
        <span className="hidden group-open/exp:inline">Hide {title}</span>
      </summary>
      <div className="border-t border-fd-border px-4 [&>div]:py-3.5">{children}</div>
    </details>
  );
}

/** Heading + list wrapper so field lists get consistent spacing. */
export function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-2', className)}>{children}</div>;
}
