import Link from 'next/link';
import type { ReactNode } from 'react';
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import {
  ArrowRight,
  Ban,
  BookOpen,
  Braces,
  CalendarClock,
  Globe,
  LayoutTemplate,
  Layers,
  Radio,
  Rocket,
  Server,
  ShieldCheck,
  Terminal,
  Webhook,
} from 'lucide-react';
import { LogoMark } from '@/components/logo';

const SEND_EXAMPLE = `import { Flaresend } from '@flaresend/client';

const flaresend = new Flaresend({
  apiKey: process.env.FLARESEND_API_KEY!,
  baseUrl: 'https://mailer.example.com',
});

const { id } = await flaresend.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  subject: 'Welcome to Acme',
  template: 'welcome',
  data: { name: 'Ada', appName: 'Acme', loginUrl },
});`;

const QUICKSTARTS: Array<{ name: string; href: string; mark: string; tone: string }> = [
  { name: 'Node.js', href: '/docs/send-with/nodejs', mark: 'JS', tone: 'bg-lime-500/15 text-lime-700 dark:text-lime-400' },
  { name: 'Next.js', href: '/docs/send-with/nextjs', mark: 'N', tone: 'bg-neutral-500/15 text-neutral-800 dark:text-neutral-200' },
  { name: 'Workers', href: '/docs/send-with/cloudflare-workers', mark: 'CF', tone: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  { name: 'Hono', href: '/docs/send-with/hono', mark: 'H', tone: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  { name: 'Bun', href: '/docs/send-with/bun', mark: 'B', tone: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  { name: 'Python', href: '/docs/send-with/python', mark: 'Py', tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  { name: 'Go', href: '/docs/send-with/go', mark: 'Go', tone: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
  { name: 'PHP', href: '/docs/send-with/php', mark: 'php', tone: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400' },
  { name: 'Ruby', href: '/docs/send-with/ruby', mark: 'Rb', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
  { name: 'cURL', href: '/docs/send-with/curl', mark: '$_', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
];

const TOPICS: Array<{ icon: ReactNode; title: string; body: string; href: string }> = [
  { icon: <Layers />, title: 'Batch sending', body: 'Up to 100 emails in one request, with per-item results.', href: '/docs/emails/batch' },
  { icon: <CalendarClock />, title: 'Scheduling', body: 'Send up to 30 days ahead. Cancel or move it any time before.', href: '/docs/emails/scheduling' },
  { icon: <LayoutTemplate />, title: 'Templates', body: 'React Email templates in Git, and editable ones with versions.', href: '/docs/templates' },
  { icon: <Webhook />, title: 'Webhooks', body: 'Signed events for every step of delivery, retried for 24 hours.', href: '/docs/webhooks' },
  { icon: <ShieldCheck />, title: 'Idempotency', body: 'Retry any send without ever sending it twice.', href: '/docs/emails/idempotency' },
  { icon: <Ban />, title: 'Suppressions', body: 'Hard bounces and complaints are blocked automatically.', href: '/docs/deliverability/suppressions' },
  { icon: <Globe />, title: 'Domains', body: 'SPF, DKIM and DMARC set up on your Cloudflare zones.', href: '/docs/deliverability/domains' },
  { icon: <Radio />, title: 'Broadcasts', body: 'Small, opted-in lists with one-click unsubscribe.', href: '/docs/contacts/broadcasts' },
];

function SectionTitle({ children, href, link }: { children: ReactNode; href?: string; link?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-fd-muted-foreground hover:text-fd-foreground">
          {link} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col">
      {/* Soft brand glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70 dark:opacity-40"
        style={{
          background: 'radial-gradient(60% 55% at 50% 0%, var(--color-brand-soft) 0%, transparent 70%)',
        }}
      />

      <section className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-14 md:px-6 md:pt-20 lg:grid-cols-[1fr_1.05fr]">
        <div className="min-w-0">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-background/70 px-3 py-1 text-xs text-fd-muted-foreground backdrop-blur">
            <LogoMark className="size-4" />
            Transactional email on Cloudflare
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Flaresend documentation
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fd-muted-foreground md:text-lg">
            One Worker in your Cloudflare account sends every email your apps need. Call it over REST from anywhere, or over RPC from
            other Workers, and get logs, retries, templates and webhooks with it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              <Rocket className="size-4" /> Quickstart
            </Link>
            <Link
              href="/docs/api-reference"
              className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              <Braces className="size-4" /> API Reference
            </Link>
            <Link
              href="/docs/self-hosting/deploy"
              className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              <Server className="size-4" /> Deploy
            </Link>
          </div>
          <div className="mt-6 flex items-center gap-2 font-mono text-[13px] text-fd-muted-foreground">
            <Terminal className="size-4" />
            <span>npm install @flaresend/client</span>
          </div>
        </div>
        <div className="min-w-0 [&_figure]:my-0 [&_figure]:shadow-xl [&_figure]:shadow-black/5">
          <ServerCodeBlock lang="ts" code={SEND_EXAMPLE} codeblock={{ title: 'send-welcome.ts' }} />
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <SectionTitle href="/docs/send-with/nodejs" link="All quickstarts">
          Send with your stack
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {QUICKSTARTS.map((q) => (
            <Link
              key={q.name}
              href={q.href}
              className="group flex items-center gap-3 rounded-xl border border-fd-border bg-fd-card p-3 transition-colors hover:border-brand/40 hover:bg-fd-accent"
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${q.tone}`}>
                {q.mark}
              </span>
              <span className="text-sm font-medium">{q.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <SectionTitle href="/docs" link="Read the guides">
          What you can build
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOPICS.map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="group flex flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-4 transition-colors hover:border-brand/40 hover:bg-fd-accent"
            >
              <span className="text-brand [&>svg]:size-5">{t.icon}</span>
              <span className="text-sm font-semibold">{t.title}</span>
              <span className="text-[13px] leading-snug text-fd-muted-foreground">{t.body}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-20 md:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { icon: <BookOpen />, title: 'Guides', body: 'Concepts, sending options and deliverability.', href: '/docs' },
            { icon: <Braces />, title: 'API Reference', body: 'Every endpoint with request and response examples.', href: '/docs/api-reference' },
            { icon: <Server />, title: 'Self-hosting', body: 'Deploy, configure and operate the mailer Worker.', href: '/docs/self-hosting' },
          ].map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="flex items-start gap-3 rounded-xl border border-fd-border p-4 transition-colors hover:bg-fd-accent"
            >
              <span className="mt-0.5 text-fd-muted-foreground [&>svg]:size-5">{c.icon}</span>
              <span>
                <span className="block text-sm font-semibold">{c.title}</span>
                <span className="block text-[13px] text-fd-muted-foreground">{c.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
