import type { ReactNode } from 'react';
import {
  ArrowRight,
  Ban,
  BookOpen,
  CalendarClock,
  Check,
  Cloud,
  CodeXml,
  Database,
  FlaskConical,
  Globe,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  MousePointerClick,
  Radio,
  Scale,
  Send,
  ShieldCheck,
  Terminal,
  Webhook,
} from 'lucide-react';
import { Code, highlight } from '@/components/code';
import { CodeTabs, type CodeTab } from '@/components/code-tabs';
import { DashboardPreview } from '@/components/dashboard-preview';
import { GitHubIcon as Github } from '@/components/github-icon';
import { Logo, LogoMark } from '@/components/logo';
import { docs, githubUrl, npmUrl } from '@/lib/site';

const EXAMPLES: Array<Omit<CodeTab, 'html'> & { lang: string }> = [
  {
    label: 'Node.js',
    file: 'send.ts',
    lang: 'ts',
    code: `import { Flaresend } from '@flaresend/client';

const flaresend = new Flaresend({
  apiKey: process.env.FLARESEND_API_KEY!,
  baseUrl: 'https://mailer.acme.com',
});

const { id } = await flaresend.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  subject: 'Welcome to Acme',
  template: 'welcome',
  data: { name: 'Ada', appName: 'Acme', loginUrl },
});`,
  },
  {
    label: 'Worker (RPC)',
    file: 'worker.ts',
    lang: 'ts',
    code: `import { rpcClient } from '@flaresend/client/rpc';

export default {
  async fetch(req: Request, env: Env) {
    // A service binding to the mailer Worker. No API key needed:
    // only Workers in your own account can bind to it.
    const mail = rpcClient(env.MAILER, { project: 'acme' });

    await mail.send({
      from: 'hello@acme.com',
      to: 'ada@example.com',
      subject: 'Your sign-in link',
      html: '<p>Click to sign in.</p>',
    });

    return new Response('Sent');
  },
};`,
  },
  {
    label: 'cURL',
    file: 'terminal',
    lang: 'bash',
    code: `curl -X POST https://mailer.acme.com/v1/emails \\
  -H "Authorization: Bearer $FLARESEND_API_KEY" \\
  -H "Idempotency-Key: welcome-ada" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Acme <hello@acme.com>",
    "to": "ada@example.com",
    "subject": "Welcome to Acme",
    "html": "<p>Glad you are here.</p>"
  }'

# 202 Accepted
# { "id": "email_01K6B2Y4ZP9R3M7T8V5N2QXW4C", "status": "queued" }`,
  },
];

const DEPLOY = `git clone https://github.com/flaresend-dev/flaresend && cd flaresend
pnpm install && pnpm build && cd apps/mailer

npx wrangler d1 create flaresend
npx wrangler r2 bucket create flaresend-payloads
npx wrangler queues create flaresend-send  # + 3 more
npx wrangler email sending enable acme.com
npx wrangler secret put ADMIN_API_KEY

npx wrangler d1 migrations apply flaresend --remote
npx wrangler deploy`;

const FEATURES: Array<{ icon: ReactNode; title: string; body: string; href: string }> = [
  { icon: <Layers />, title: 'Batch sending', body: 'Up to 100 emails in one request, with a result for each.', href: '/emails/batch' },
  { icon: <CalendarClock />, title: 'Scheduling', body: 'Send up to 30 days ahead. Cancel or move it before it goes out.', href: '/emails/scheduling' },
  { icon: <LayoutTemplate />, title: 'Templates', body: 'React Email templates in Git, plus versioned ones you edit in the dashboard.', href: '/templates' },
  { icon: <Webhook />, title: 'Webhooks', body: 'Signed events for every delivery step, retried with backoff when your endpoint fails.', href: '/webhooks' },
  { icon: <ShieldCheck />, title: 'Idempotency', body: 'Retry any request with the same key and the email is sent once.', href: '/emails/idempotency' },
  { icon: <Ban />, title: 'Suppressions', body: 'Hard bounces and complaints are blocked from then on, automatically.', href: '/deliverability/suppressions' },
  { icon: <Globe />, title: 'Domains', body: 'SPF and DKIM added to your Cloudflare zones for you.', href: '/deliverability/domains' },
  { icon: <MousePointerClick />, title: 'Open and click tracking', body: 'Per project, off by default. Your original HTML is kept as sent.', href: '/emails/tracking' },
  { icon: <FlaskConical />, title: 'Test keys', body: 'fs_test_ keys go through every check and log the email, but never send it.', href: '/api-keys' },
  { icon: <Radio />, title: 'Broadcasts', body: 'Small, opted-in lists with one-click unsubscribe. Off until you turn it on.', href: '/contacts/broadcasts' },
  { icon: <LayoutDashboard />, title: 'Dashboard', body: 'Every email, its timeline and its content. Runs on Workers behind Cloudflare Access.', href: '/dashboard' },
  { icon: <Terminal />, title: 'CLI', body: 'The flaresend command manages projects, keys and suppressions, and looks up sent emails.', href: '/self-hosting/cli' },
];

const STEPS: Array<{ n: string; title: string; body: ReactNode }> = [
  {
    n: '01',
    title: 'Your app sends',
    body: (
      <>
        <code>POST /v1/emails</code> with an API key from anywhere, or <code>MailerRpc.send()</code> from another Worker.
      </>
    ),
  },
  {
    n: '02',
    title: 'Flaresend accepts it',
    body: 'Checks the sender, suppressions, size and rate limits. Logs it in D1, stores the body in R2, puts it on a queue and answers 202.',
  },
  {
    n: '03',
    title: 'The queue sends it',
    body: 'A consumer hands it to Cloudflare Email Service. Temporary errors are retried up to 8 times with backoff.',
  },
  {
    n: '04',
    title: 'Events come back',
    body: 'Delivered, bounced and complained events update the log, suppress bad addresses and fire your webhooks.',
  },
];

const REPO: Array<{ path: string; body: string }> = [
  { path: 'apps/mailer', body: 'The Worker: HTTP API, RPC entrypoints, queue consumers, cron' },
  { path: 'apps/dashboard', body: 'Next.js dashboard, deployed to Workers' },
  { path: 'apps/docs', body: 'The documentation site' },
  { path: 'packages/client', body: '@flaresend/client on npm: HTTP, RPC, webhook checks' },
  { path: 'packages/templates', body: 'React Email templates rendered in the mailer' },
  { path: 'packages/cli', body: 'The flaresend command for the admin API' },
];

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: 'What does it cost?',
    a: 'Flaresend itself is free and MIT licensed. It runs on your Cloudflare account, so you pay Cloudflare for the Workers, D1, R2, Queues and Email Service it uses, at their prices. There is no Flaresend plan or bill.',
  },
  {
    q: 'How is this different from Resend?',
    a: 'If you have used Resend, the requests and responses will look familiar. The difference is where it runs: Flaresend is code you deploy to your own Cloudflare account. Your email log, your email bodies and your limits stay under your control.',
  },
  {
    q: 'Can I send newsletters or marketing email?',
    a: 'No. Cloudflare Email Service is for transactional email, and its terms do not allow marketing or bulk campaigns. Broadcasts exist for small, opted-in lists: they are off per project by default and capped at 500 recipients unless you change the limit.',
  },
  {
    q: 'Do my domains have to be on Cloudflare?',
    a: 'Cloudflare’s docs say Email Service needs the domain’s DNS on Cloudflare. On those zones Flaresend adds the SPF and DKIM records for you.',
  },
  {
    q: 'Can other Workers send without an API key?',
    a: 'Yes. Add a service binding to the mailer Worker and call it over RPC. Only Workers in the same Cloudflare account can bind to it.',
  },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-brand">{children}</p>;
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: ReactNode; body?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-relaxed text-pretty text-muted md:text-lg">{body}</p>}
    </div>
  );
}

function ButtonLink({ href, children, variant = 'secondary' }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-fg text-bg hover:opacity-90'
      : 'border border-line bg-bg text-fg hover:bg-subtle';
  return (
    <a href={href} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${styles}`}>
      {children}
    </a>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <a href="/" aria-label="Flaresend home">
          <Logo />
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#features" className="transition-colors hover:text-fg">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-fg">How it works</a>
          <a href="#self-host" className="transition-colors hover:text-fg">Self-host</a>
          <a href="#open-source" className="transition-colors hover:text-fg">Open source</a>
          <a href={docs('')} className="transition-colors hover:text-fg">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={githubUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-subtle"
          >
            <Github className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href={docs('/quickstart')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-bg transition hover:opacity-90"
          >
            Get started
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ tabs }: { tabs: CodeTab[] }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{ background: 'radial-gradient(55% 50% at 50% 0%, var(--color-brand-soft) 0%, transparent 70%)' }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 md:px-6 md:pt-24 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <a
            href={githubUrl}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-bg/80 py-1 pl-1 pr-3 text-xs text-muted backdrop-blur transition-colors hover:text-fg"
          >
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand">MIT</span>
            100% open source
            <ArrowRight className="size-3" />
          </a>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
            Transactional email that runs in <span className="text-brand">your</span> Cloudflare account.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-muted md:text-lg">
            Flaresend is an open-source email API you deploy to Cloudflare. Send over REST from any app, or over RPC from your
            Workers, with logs, retries, templates and webhooks built in. Nothing sits between your code and Cloudflare.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={docs('/self-hosting/deploy')} variant="primary">
              Deploy it yourself <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={docs('')}>
              <BookOpen className="size-4" /> Read the docs
            </ButtonLink>
          </div>
          <a
            href={npmUrl}
            className="mt-6 inline-flex items-center gap-2 font-mono text-[13px] text-muted transition-colors hover:text-fg"
          >
            <span className="text-brand">$</span> npm install @flaresend/client
          </a>
        </div>
        <div className="min-w-0">
          <CodeTabs tabs={tabs} />
        </div>
      </div>
    </section>
  );
}

function BuiltOn() {
  const items = ['Workers', 'D1', 'R2', 'Queues', 'Email Service', 'Hono', 'React Email'];
  return (
    <section className="border-y border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-6 md:flex-row md:justify-between md:px-6">
        <p className="shrink-0 text-sm text-muted">Built entirely on Cloudflare</p>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-mono text-[13px] text-fg/80">
          {items.map((i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-brand" />
              {i}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pillars() {
  const pillars = [
    {
      icon: <Cloud />,
      title: 'Runs in your account',
      body: 'The mailer is one Worker you deploy. The email log lives in your D1 database and email bodies in your R2 bucket. No other company sees your mail or your users.',
    },
    {
      icon: <CodeXml />,
      title: 'An API you already know',
      body: 'Modeled on Resend: POST /v1/emails, idempotency keys, batch and scheduled sends, typed errors and a typed SDK for Node.js, Bun and Workers.',
    },
    {
      icon: <Scale />,
      title: 'Open source, MIT',
      body: 'Every line is on GitHub. Read it, change it, fork it, run it for as long as you like. No license keys, no seat limits, no paid tier.',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <SectionHeading
        eyebrow="Why Flaresend"
        title="An email service you own, not one you rent"
        body="Hosted email APIs are easy to start with. Flaresend keeps that ease and moves the whole thing into your own infrastructure."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.title} className="rounded-2xl border border-line bg-card p-6">
            <span className="mb-5 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand [&>svg]:size-5">
              {p.icon}
            </span>
            <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-24 md:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Accepted in milliseconds, sent from a queue"
          body="Your request returns as soon as the email is safely stored. Sending, retrying and tracking happen in the background."
        />
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative rounded-2xl border border-line bg-bg p-6">
              <span className="font-mono text-xs font-medium text-brand">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-fg">
                {s.body}
              </p>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  aria-hidden
                  className="absolute -right-3.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full border border-line bg-bg p-0.5 text-muted lg:block"
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {[
            { icon: <Database className="size-4" />, text: 'Every email and event logged in D1' },
            { icon: <Send className="size-4" />, text: 'Bodies kept in R2 for 30 days, for viewing and resending' },
            { icon: <KeyRound className="size-4" />, text: 'Webhooks signed with HMAC-SHA256' },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-2.5 rounded-xl border border-line bg-bg px-4 py-3 text-muted">
              <span className="text-brand">{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <SectionHeading
        eyebrow="Features"
        title="Everything a transactional email service should do"
        body="The parts you would otherwise build yourself around a raw send call."
      />
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <a key={f.title} href={docs(f.href)} className="group bg-bg p-6 transition-colors hover:bg-card">
            <span className="text-brand [&>svg]:size-5">{f.icon}</span>
            <h3 className="mt-4 flex items-center gap-1.5 text-sm font-semibold">
              {f.title}
              <ArrowRight className="size-3.5 -translate-x-1 text-muted opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function Dashboard() {
  return (
    <section className="border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-24 md:px-6">
        <SectionHeading
          eyebrow="Dashboard"
          title="See every email you send"
          body="Open any email to see its full timeline, from queued to delivered, and the exact HTML that went out. Manage keys, domains, templates and webhooks in the same place."
        />
        <DashboardPreview />
      </div>
    </section>
  );
}

async function SelfHost() {
  return (
    <section id="self-host" className="mx-auto max-w-6xl px-4 py-24 md:px-6">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <Eyebrow>Self-host</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">From an empty account to your first email</h2>
          <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
            Everything runs on Wrangler. Create the database, bucket and queues, onboard your domain, and deploy.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            {[
              'No servers, containers or databases to look after',
              'CI workflow included: migrate and deploy on every push to main',
              'The dashboard can onboard new domains for you',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ButtonLink href={docs('/self-hosting/deploy')} variant="primary">
              Follow the deploy guide <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
            <Terminal className="size-3.5" /> terminal
          </div>
          <Code code={DEPLOY} lang="bash" />
        </div>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section id="open-source" className="border-t border-line bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-24 md:px-6 lg:grid-cols-2">
        <div>
          <Eyebrow>Open source</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">All of it. Not an open core.</h2>
          <p className="mt-4 text-base leading-relaxed text-muted md:text-lg">
            The mailer, the dashboard, the SDK, the templates, the CLI and these docs are in one repository under the MIT license.
            There is no hosted edition with extra features. What you see on GitHub is the whole product.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={githubUrl} variant="primary">
              <Github className="size-4" /> View on GitHub
            </ButtonLink>
            <ButtonLink href={`${githubUrl}/blob/main/LICENSE`}>
              <Scale className="size-4" /> MIT license
            </ButtonLink>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-bg">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 font-mono text-xs text-muted">
            <Github className="size-3.5" /> flaresend-dev/flaresend
          </div>
          <ul>
            {REPO.map((r, i) => (
              <li
                key={r.path}
                className={`grid grid-cols-1 gap-0.5 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr] sm:gap-4 ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <span className="font-mono text-[13px] font-medium">{r.path}</span>
                <span className="text-muted">{r.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 md:px-6">
      <SectionHeading eyebrow="FAQ" title="Questions" />
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-4 pb-24 md:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-line bg-card px-6 py-16 text-center md:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(50% 80% at 50% 100%, var(--color-brand-soft) 0%, transparent 70%)' }}
        />
        <div className="relative">
          <LogoMark className="mx-auto size-14" />
          <h2 className="mx-auto mt-6 max-w-xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Send your first email from your own account
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">Deploy the mailer, create a key, and send. The quickstart takes you through it.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={docs('/quickstart')} variant="primary">
              Quickstart <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href={githubUrl}>
              <Github className="size-4" /> Star on GitHub
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const columns = [
    {
      title: 'Docs',
      links: [
        ['Introduction', docs('')],
        ['Quickstart', docs('/quickstart')],
        ['API reference', docs('/api-reference')],
        ['Self-hosting', docs('/self-hosting')],
      ],
    },
    {
      title: 'Project',
      links: [
        ['GitHub', githubUrl],
        ['npm', npmUrl],
        ['License', `${githubUrl}/blob/main/LICENSE`],
        ['llms.txt', `${docs('').replace(/\/docs$/, '')}/llms.txt`],
      ],
    },
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-6">
        <div className="col-span-2 md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">Open-source transactional email for Cloudflare.</p>
          <p className="mt-6 text-xs text-muted">MIT licensed. © 2026 TSD Interactive.</p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-medium">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="transition-colors hover:text-fg">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

export default async function Page() {
  const tabs = await Promise.all(
    EXAMPLES.map(async ({ lang, ...t }) => ({ ...t, html: await highlight(t.code, lang) })),
  );
  return (
    <>
      <Header />
      <main>
        <Hero tabs={tabs} />
        <BuiltOn />
        <Pillars />
        <HowItWorks />
        <Features />
        <Dashboard />
        <SelfHost />
        <OpenSource />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
