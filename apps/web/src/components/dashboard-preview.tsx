import { ChartLine, Contact, Globe, KeyRound, LayoutTemplate, Mail, Radio, ScrollText, Users, Webhook } from 'lucide-react';
import { LogoMark } from './logo';

type Status = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'scheduled';

// A drawing of the dashboard's email list, not a screenshot. Addresses, subjects and numbers are made up.
const ROWS: Array<{ to: string; subject: string; status: Status; when: string }> = [
  { to: 'ada@example.com', subject: 'Welcome to Acme', status: 'delivered', when: '12s ago' },
  { to: 'grace@example.org', subject: 'Reset your password', status: 'opened', when: '1m ago' },
  { to: 'linus@example.net', subject: 'Your invoice for September', status: 'delivered', when: '4m ago' },
  { to: 'margaret@example.com', subject: 'Sign in to Acme', status: 'clicked', when: '9m ago' },
  { to: 'old-address@example.com', subject: 'Welcome to Acme', status: 'bounced', when: '14m ago' },
  { to: 'alan@example.org', subject: 'Your weekly summary', status: 'scheduled', when: 'in 2h' },
];

const TONE: Record<Status, string> = {
  delivered: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  opened: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  clicked: 'bg-violet-500/12 text-violet-700 dark:text-violet-400',
  bounced: 'bg-red-500/12 text-red-700 dark:text-red-400',
  scheduled: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
};

const NAV = [
  { icon: Mail, label: 'Emails', active: true },
  { icon: Radio, label: 'Broadcasts' },
  { icon: Users, label: 'Audiences' },
  { icon: Contact, label: 'Contacts' },
  { icon: LayoutTemplate, label: 'Templates' },
  { icon: ChartLine, label: 'Metrics' },
  { icon: ScrollText, label: 'Logs' },
  { icon: Globe, label: 'Domains' },
  { icon: KeyRound, label: 'API keys' },
  { icon: Webhook, label: 'Webhooks' },
];

export function DashboardPreview() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-line bg-bg shadow-2xl shadow-black/5 dark:shadow-black/50">
      <div className="flex items-center gap-1.5 border-b border-line bg-card px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-3 truncate rounded-md bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted">
          dashboard.acme.com/acme/emails
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[13rem_1fr]">
        <nav className="hidden border-r border-line bg-card p-3 md:block">
          <div className="mb-4 flex items-center gap-2 px-2 pt-1 text-sm font-semibold">
            <LogoMark className="size-5" /> Acme
          </div>
          <ul className="space-y-0.5">
            {NAV.map(({ icon: Icon, label, active }) => (
              <li
                key={label}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] ${
                  active ? 'bg-subtle font-medium text-fg' : 'text-muted'
                }`}
              >
                <Icon className="size-4" />
                {label}
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Emails</div>
            <div className="flex gap-2 text-[11px] text-muted">
              <span className="rounded-md border border-line px-2 py-1">Last 24 hours</span>
              <span className="hidden rounded-md border border-line px-2 py-1 sm:inline">All statuses</span>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Sent', '1,284'],
              ['Delivered', '99.2%'],
              ['Opened', '41.7%'],
              ['Bounced', '0.4%'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line p-2.5">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="mt-0.5 text-base font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            {ROWS.map((r, i) => (
              <div
                key={r.to + r.subject}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-[13px] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem_4rem] ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <span className="truncate font-medium">{r.to}</span>
                <span className="hidden truncate text-muted sm:block">{r.subject}</span>
                <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[r.status]}`}>
                  {r.status}
                </span>
                <span className="hidden text-right text-xs text-muted tabular-nums sm:block">{r.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
