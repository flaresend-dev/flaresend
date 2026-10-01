import { z } from "zod";
import { domainOf, parseDisplayAddress } from "./address";

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "slug must be lowercase letters, digits and dashes");
const Domain = z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "invalid domain");
const Address = z.string().trim().toLowerCase().email();

export const CreateProjectInput = z.object({
  slug: Slug,
  name: z.string().min(1).max(200),
  defaultFrom: z.string().optional(),
  allowedDomains: z.array(Domain).min(1),
  allowedSenders: z.array(Address).optional(),
  /** Default sender per domain: { "acme.com": "Acme <hello@acme.com>" }. */
  domainSenders: z.record(z.string(), z.string()).optional(),
  rpcEnabled: z.boolean().optional(),
  dailyLimit: z.number().int().min(0).optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  /** @deprecated Ignored. Broadcasts are always available. Kept so older callers do not fail validation. */
  broadcastsEnabled: z.boolean().optional(),
});
export type CreateProjectInput = z.input<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  name: z.string().min(1).max(200).optional(),
  defaultFrom: z.string().nullable().optional(),
  allowedDomains: z.array(Domain).min(1).optional(),
  allowedSenders: z.array(Address).nullable().optional(),
  /** Merged into the stored map: a domain set to null loses its sender, domains not listed keep theirs. null clears all. */
  domainSenders: z.record(z.string(), z.string().nullable()).nullable().optional(),
  rpcEnabled: z.boolean().optional(),
  dailyLimit: z.number().int().min(0).optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  /** @deprecated Ignored. Broadcasts are always available. Kept so older callers do not fail validation. */
  broadcastsEnabled: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
export type UpdateProjectInput = z.input<typeof UpdateProjectInput>;

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  defaultFrom: string | null;
  allowedDomains: string[];
  allowedSenders: string[] | null;
  /** Default sender per domain. Only domains that have one are listed. */
  domainSenders: Record<string, string>;
  rpcEnabled: boolean;
  dailyLimit: number;
  trackOpens: boolean;
  trackClicks: boolean;
  /** @deprecated Always reflects the stored value, which no longer gates anything. */
  broadcastsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
}

/** The sender for `domain`: its own default, else the project default when that address is on `domain`. */
export function senderForDomain(p: Pick<ProjectRecord, "defaultFrom" | "domainSenders">, domain: string): string | null {
  const own = p.domainSenders[domain];
  if (own) return own;
  if (!p.defaultFrom) return null;
  try {
    return domainOf(parseDisplayAddress(p.defaultFrom).address) === domain ? p.defaultFrom : null;
  } catch {
    return null;
  }
}

export const CreateApiKeyInput = z.object({
  name: z.string().min(1).max(200),
  mode: z.enum(["live", "test"]),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateApiKeyInput = z.input<typeof CreateApiKeyInput>;

export const UpdateApiKeyInput = z.object({ name: z.string().min(1).max(200) });

export interface ApiKeyRecord {
  id: string;
  projectId: string;
  name: string;
  mode: "live" | "test";
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface CreatedApiKey extends ApiKeyRecord {
  /** The full key. Returned once, never stored. */
  key: string;
}

export const CreateSuppressionInput = z.object({
  address: Address,
  reason: z.enum(["hard_bounce", "complaint", "manual"]).default("manual"),
});

export interface SuppressionRecord {
  address: string;
  reason: string;
  sourceEmailId: string | null;
  createdAt: string;
}

export interface DomainRecord {
  domain: string;
  /** This domain's sender: its own default, else the project default when that is on this domain. */
  defaultFrom: string | null;
  verification: "onboarded" | "pending" | "missing" | "unknown";
  details?: unknown;
  checkedAt?: string | null;
}

/** One project that lists a domain, as shown by listAllDomains. */
export interface DomainProjectRef {
  slug: string;
  name: string;
  /** true when the project is paused (disabledAt is set). */
  paused: boolean;
  /** The sender this project uses for the domain. */
  defaultFrom: string | null;
}

/** A domain across every project that lists it. The same domain can be allowed in several projects. */
export interface AllDomainRecord extends Omit<DomainRecord, "defaultFrom"> {
  projects: DomainProjectRef[];
}

/** One step of onboarding a domain in Cloudflare. Existing DNS records are never changed. */
export interface DomainSetupStep {
  /** "sending domain", "dns", "dmarc" or "delivery events". */
  step: string;
  status: "created" | "exists" | "conflict" | "skipped" | "failed";
  detail: string;
  record?: { type: string; name: string; content: string };
}

export interface DomainSetupResult {
  domain: string;
  zone: string;
  steps: DomainSetupStep[];
  /** Fresh verification status after setup. */
  record: Omit<DomainRecord, "defaultFrom">;
}

/** One address the mailer Worker answers on, as Cloudflare reports it. */
export interface MailerUrl {
  /** No trailing slash, e.g. https://mailer.example.com */
  url: string;
  kind: "custom_domain" | "workers_dev";
}

/** About the mailer itself, for display in the dashboard. */
export interface MailerInfo {
  /** Custom domains first, then the workers.dev URL if it is enabled. Empty when the Worker has neither. */
  urls: MailerUrl[];
}

export interface StatsRecord {
  projectId: string;
  slug: string;
  name: string;
  today: Record<string, number>;
  last7d: Record<string, number>;
  last30d: Record<string, number>;
}

export interface MeRecord {
  project: { id: string; slug: string; name: string };
  key: { id: string; name: string; mode: "live" | "test" };
}
