// Domain verification status and domain onboarding.
// Endpoints (checked against https://developers.cloudflare.com/api/resources/email_sending/ and wrangler 4.140's
// `email sending enable` / `queues subscription create` on 2026-09-26):
//   GET  /zones?name=<zone>                                  -> find the zone that holds the domain (Zone Read)
//   GET  /zones/{zone_id}/email/sending/subdomains           -> sending domains: { name, tag, enabled, dkim_selector, ... }
//   POST /zones/{zone_id}/email/sending/subdomains {name}    -> onboard a domain (Email Sending Edit)
//   GET  /zones/{zone_id}/email/sending/subdomains/{tag}/dns -> records the domain needs: [{ type, name, content, priority, ttl }]
//   GET/POST /zones/{zone_id}/dns_records                    -> read and add DNS records (DNS Edit)
//   GET  /accounts/{account_id}/queues?name=<queue>          -> the events queue id (Queues Edit)
//   GET/POST /accounts/{account_id}/event_subscriptions/subscriptions -> delivery events -> queue (Queues Edit)
// Creating the sending domain does not add DNS records by itself (wrangler's `enable` only makes the POST),
// so setupDomain adds whatever the /dns endpoint lists and is missing from the zone.
import { senderForDomain, type AllDomainRecord, type DomainRecord, type DomainSetupResult, type DomainSetupStep } from "@flaresend/types";
import { allowedDomains, domainSenders, listProjects, type ProjectRow } from "../db/projects";
import { one } from "../db/client";
import { ApiError } from "../http/errors";
import { nowIso } from "./ids";

const CF_API = "https://api.cloudflare.com/client/v4";
const TTL_MS = 10 * 60 * 1000;

type Verification = DomainRecord["verification"];

interface CachedStatus {
  domain: string;
  status: Verification;
  details: string | null;
  checked_at: string;
}

interface SendingSubdomain {
  name: string;
  enabled: boolean;
  tag?: string;
  dkim_selector?: string;
  return_path_domain?: string;
  created?: string;
  modified?: string;
}

async function cfCall<T>(env: Env, method: string, path: string, fetchImpl: typeof fetch, body?: unknown): Promise<T> {
  const res = await fetchImpl(`${CF_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: Array<{ message: string }> } | null;
  if (!res.ok || !json?.success) {
    throw new Error(`Cloudflare API ${method} ${path.split("?")[0]} failed: ${res.status} ${json?.errors?.map((e) => e.message).join("; ") ?? ""}`.trim());
  }
  return json.result as T;
}

const cfGet = <T>(env: Env, path: string, fetchImpl: typeof fetch) => cfCall<T>(env, "GET", path, fetchImpl);

async function findZone(env: Env, domain: string, fetchImpl: typeof fetch): Promise<{ id: string; name: string } | null> {
  const account = env.CF_ACCOUNT_ID ? `&account.id=${encodeURIComponent(env.CF_ACCOUNT_ID)}` : "";
  for (const name of zoneCandidates(domain)) {
    const zones = await cfGet<Array<{ id: string; name: string }>>(env, `/zones?name=${encodeURIComponent(name)}${account}`, fetchImpl);
    if (zones[0]) return zones[0];
  }
  return null;
}

/** a.b.example.com -> ["a.b.example.com", "b.example.com", "example.com"] */
export function zoneCandidates(domain: string): string[] {
  const parts = domain.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

export function matchSubdomain(domain: string, subs: SendingSubdomain[]): SendingSubdomain | null {
  const exact = subs.find((s) => s.name.toLowerCase() === domain);
  if (exact) return exact;
  return subs.find((s) => s.name.startsWith("*.") && domain.endsWith(s.name.slice(1).toLowerCase())) ?? null;
}

export async function checkDomainWithCloudflare(env: Env, domain: string, fetchImpl: typeof fetch = fetch): Promise<{ status: Verification; details: unknown }> {
  const zone = await findZone(env, domain, fetchImpl);
  if (!zone) return { status: "missing", details: { reason: "no Cloudflare zone found for this domain" } };
  const subs = await cfGet<SendingSubdomain[]>(env, `/zones/${zone.id}/email/sending/subdomains`, fetchImpl);
  const hit = matchSubdomain(domain, subs);
  if (!hit) return { status: "missing", details: { zone: zone.name } };
  return {
    status: hit.enabled ? "onboarded" : "pending",
    details: { zone: zone.name, name: hit.name, enabled: hit.enabled, dkimSelector: hit.dkim_selector ?? null, returnPathDomain: hit.return_path_domain ?? null },
  };
}

export async function domainStatus(env: Env, domain: string, opts: { refresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Omit<DomainRecord, "defaultFrom">> {
  if (!env.CF_API_TOKEN) return { domain, verification: "unknown", checkedAt: null };
  const cached = await one<CachedStatus>(env.DB.prepare("SELECT * FROM domain_status WHERE domain = ?").bind(domain));
  if (cached && !opts.refresh && Date.now() - new Date(cached.checked_at).getTime() < TTL_MS) {
    return { domain, verification: cached.status, details: cached.details ? JSON.parse(cached.details) : null, checkedAt: cached.checked_at };
  }
  let status: Verification = "unknown";
  let details: unknown = null;
  try {
    ({ status, details } = await checkDomainWithCloudflare(env, domain, opts.fetchImpl));
  } catch (err) {
    details = { error: String((err as Error)?.message ?? err) };
  }
  const checkedAt = nowIso();
  await env.DB.prepare(
    `INSERT INTO domain_status (domain, status, details, checked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET status = excluded.status, details = excluded.details, checked_at = excluded.checked_at`,
  ).bind(domain, status, JSON.stringify(details), checkedAt).run();
  return { domain, verification: status, details, checkedAt };
}

export async function listDomainRecords(env: Env, project: ProjectRow, opts: { refresh?: boolean } = {}): Promise<DomainRecord[]> {
  const domains = allowedDomains(project);
  const statuses = await Promise.all(domains.map((d) => domainStatus(env, d, opts)));
  const senders = { defaultFrom: project.default_from, domainSenders: domainSenders(project) };
  return statuses.map((s) => ({ ...s, defaultFrom: senderForDomain(senders, s.domain) }));
}

/** Every project's domains merged: one row per domain, checked once, with the projects that list it. */
export async function listAllDomainRecords(env: Env, opts: { refresh?: boolean } = {}): Promise<AllDomainRecord[]> {
  const byDomain = new Map<string, AllDomainRecord["projects"]>();
  for (const project of await listProjects(env.DB)) {
    const senders = { defaultFrom: project.default_from, domainSenders: domainSenders(project) };
    for (const domain of allowedDomains(project)) {
      const refs = byDomain.get(domain) ?? [];
      refs.push({ slug: project.slug, name: project.name, paused: Boolean(project.disabled_at), defaultFrom: senderForDomain(senders, domain) });
      byDomain.set(domain, refs);
    }
  }
  const domains = [...byDomain.keys()].sort();
  const statuses = await Promise.all(domains.map((d) => domainStatus(env, d, opts)));
  return statuses.map((s) => ({ ...s, projects: byDomain.get(s.domain) ?? [] }));
}

// ---------- onboarding ----------

/** The queue apps/mailer consumes delivery events from (wrangler.jsonc, scripts/setup.md step 4). */
export const EVENTS_QUEUE = "flaresend-events";
export const DELIVERY_EVENTS = [
  "message.delivered", "message.deferred", "message.bounced", "message.failed", "message.rejected", "message.complained",
];
/** p=none only reports; it never makes receivers reject mail the zone already sends through other providers. */
export const DEFAULT_DMARC = "v=DMARC1; p=none";

interface DnsRecord {
  type?: string;
  name?: string;
  content?: string;
  priority?: number;
  ttl?: number;
}

interface EventSubscription {
  id: string;
  name: string;
  source?: { type?: string; zone_id?: string; domain?: string };
}

/** Cloudflare returns TXT content with or without surrounding quotes. */
function normContent(type: string, content: string): string {
  const c = content.trim();
  return (type === "TXT" ? c.replace(/^"|"$/g, "").replace(/"\s*"/g, "") : c.replace(/\.$/, "")).toLowerCase();
}

/** Record names from /dns are made absolute within the zone. */
export function absoluteName(name: string, zone: string): string {
  const n = name.trim().replace(/\.$/, "").toLowerCase();
  if (!n || n === "@") return zone;
  return n === zone || n.endsWith(`.${zone}`) ? n : `${n}.${zone}`;
}

const txtKind = (content: string) => /^v=(spf1|dkim1|dmarc1)\b/i.exec(normContent("TXT", content))?.[1]?.toLowerCase() ?? null;

/**
 * What to do with one wanted record given what is already at that name. Never overwrites:
 * a CNAME can't share a name with anything, and a second SPF/DKIM/DMARC TXT at one name breaks the first.
 */
export function planRecord(
  want: { type: string; name: string; content: string },
  existing: DnsRecord[],
): { status: "create" | "exists" | "conflict"; with?: DnsRecord } {
  const type = want.type.toUpperCase();
  const same = existing.find((r) => r.type?.toUpperCase() === type && normContent(type, r.content ?? "") === normContent(type, want.content));
  if (same) return { status: "exists", with: same };
  const cname = existing.find((r) => r.type?.toUpperCase() === "CNAME");
  if (cname) return { status: "conflict", with: cname };
  if (type === "CNAME" && existing.length) return { status: "conflict", with: existing[0] };
  if (type === "TXT") {
    const kind = txtKind(want.content);
    const clash = kind ? existing.find((r) => r.type?.toUpperCase() === "TXT" && txtKind(r.content ?? "") === kind) : undefined;
    if (clash) return { status: "conflict", with: clash };
  }
  return { status: "create" };
}

type WantedRecord = DnsRecord & { type: string; name: string; content: string };

async function recordsAt(env: Env, zoneId: string, name: string, fetchImpl: typeof fetch): Promise<DnsRecord[]> {
  return cfGet<DnsRecord[]>(env, `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`, fetchImpl);
}

async function addRecord(env: Env, zoneId: string, r: WantedRecord, fetchImpl: typeof fetch) {
  const type = r.type.toUpperCase();
  await cfCall(env, "POST", `/zones/${zoneId}/dns_records`, fetchImpl, {
    type,
    name: r.name,
    content: r.content,
    ttl: r.ttl ?? 1,
    ...(r.priority !== undefined ? { priority: r.priority } : {}),
    // A proxied DKIM or return-path CNAME would answer with Cloudflare's own IPs and fail verification.
    ...(["CNAME", "A", "AAAA"].includes(type) ? { proxied: false } : {}),
    comment: "Added by Flaresend for Email Sending",
  });
}

const errMsg = (err: unknown) => String((err as Error)?.message ?? err);

async function ensureRecord(env: Env, zoneId: string, step: string, want: WantedRecord, fetchImpl: typeof fetch): Promise<DomainSetupStep> {
  const record = { type: want.type.toUpperCase(), name: want.name, content: want.content };
  try {
    const plan = planRecord(record, await recordsAt(env, zoneId, want.name, fetchImpl));
    if (plan.status === "exists") return { step, status: "exists", detail: "already in DNS", record };
    if (plan.status === "conflict") {
      return { step, status: "conflict", detail: `a different ${plan.with?.type ?? ""} record is already at this name (${plan.with?.content ?? ""}); fix it by hand`, record };
    }
    await addRecord(env, zoneId, want, fetchImpl);
    return { step, status: "created", detail: "added to DNS", record };
  } catch (err) {
    return { step, status: "failed", detail: errMsg(err), record };
  }
}

async function ensureDmarc(env: Env, zone: { id: string; name: string }, domain: string, fetchImpl: typeof fetch): Promise<DomainSetupStep> {
  const step = "dmarc";
  const own = `_dmarc.${domain}`;
  try {
    // Receivers fall back to the zone apex's DMARC record, so one there already covers a subdomain.
    for (const name of [own, ...(domain !== zone.name ? [`_dmarc.${zone.name}`] : [])]) {
      const hit = (await recordsAt(env, zone.id, name, fetchImpl)).find((r) => r.type?.toUpperCase() === "TXT" && txtKind(r.content ?? "") === "dmarc1");
      if (hit) return { step, status: "exists", detail: name === own ? "already in DNS" : `covered by ${name}`, record: { type: "TXT", name, content: hit.content ?? "" } };
    }
  } catch (err) {
    return { step, status: "failed", detail: errMsg(err) };
  }
  return ensureRecord(env, zone.id, step, { type: "TXT", name: own, content: DEFAULT_DMARC }, fetchImpl);
}

async function ensureSubscription(env: Env, zone: { id: string; name: string }, domain: string, fetchImpl: typeof fetch): Promise<DomainSetupStep> {
  const step = "delivery events";
  if (!env.CF_ACCOUNT_ID) return { step, status: "skipped", detail: "CF_ACCOUNT_ID is not set on the mailer" };
  const acct = `/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}`;
  try {
    for (let page = 1; page <= 20; page++) {
      const subs = await cfGet<EventSubscription[]>(env, `${acct}/event_subscriptions/subscriptions?page=${page}&per_page=50`, fetchImpl);
      const hit = subs.find((s) => s.source?.type === "email.sending" && s.source.zone_id === zone.id && s.source.domain?.toLowerCase() === domain);
      if (hit) return { step, status: "exists", detail: `subscription "${hit.name}" already sends this domain's events to a queue` };
      if (subs.length < 50) break;
    }
    const queues = await cfGet<Array<{ queue_id: string; queue_name: string }>>(env, `${acct}/queues?name=${EVENTS_QUEUE}`, fetchImpl);
    const queue = queues.find((q) => q.queue_name === EVENTS_QUEUE);
    if (!queue) return { step, status: "failed", detail: `queue ${EVENTS_QUEUE} was not found in the account` };
    const name = `flaresend-${domain.replace(/\./g, "-")}`;
    await cfCall(env, "POST", `${acct}/event_subscriptions/subscriptions`, fetchImpl, {
      name,
      enabled: true,
      source: { type: "email.sending", zone_id: zone.id, domain },
      destination: { type: "queues.queue", queue_id: queue.queue_id },
      events: DELIVERY_EVENTS,
    });
    return { step, status: "created", detail: `subscription "${name}" sends delivery events to ${EVENTS_QUEUE}` };
  } catch (err) {
    return { step, status: "failed", detail: errMsg(err) };
  }
}

/**
 * Onboards one of the project's domains: the Email Sending domain, the DNS records Cloudflare lists for it, a DMARC
 * record when the domain has none, and the delivery-event subscription. Safe to run again; finished steps report "exists".
 */
export async function setupDomain(env: Env, project: ProjectRow, rawDomain: string, fetchImpl: typeof fetch = fetch): Promise<DomainSetupResult> {
  const domain = rawDomain.trim().toLowerCase();
  if (!allowedDomains(project).includes(domain)) {
    throw ApiError.notFound("domain_not_in_project", `${domain} is not one of this project's domains; add it first`, "domain");
  }
  if (!env.CF_API_TOKEN) throw ApiError.unprocessable("cf_token_missing", "the mailer has no CF_API_TOKEN secret, so it cannot change Cloudflare");

  const cf = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw ApiError.unprocessable("cloudflare_api_error", errMsg(err));
    }
  };

  const zone = await cf(() => findZone(env, domain, fetchImpl));
  if (!zone) {
    throw ApiError.unprocessable(
      "zone_not_found",
      `CF_API_TOKEN can't see a Cloudflare zone for ${domain}; the domain's DNS must be on Cloudflare in account ${env.CF_ACCOUNT_ID || "(CF_ACCOUNT_ID unset)"}`,
    );
  }

  const steps: DomainSetupStep[] = [];
  const subsPath = `/zones/${zone.id}/email/sending/subdomains`;
  let sub = matchSubdomain(domain, await cf(() => cfGet<SendingSubdomain[]>(env, subsPath, fetchImpl)));
  if (sub) {
    steps.push({ step: "sending domain", status: "exists", detail: `${sub.name} is already in Email Sending` });
  } else {
    sub = await cf(() => cfCall<SendingSubdomain>(env, "POST", subsPath, fetchImpl, { name: domain }));
    steps.push({ step: "sending domain", status: "created", detail: `added ${sub.name} to Email Sending` });
  }

  let wanted: DnsRecord[] = [];
  if (!sub.tag) {
    steps.push({ step: "dns", status: "failed", detail: "Cloudflare returned no id for the sending domain, so its DNS records could not be read" });
  } else {
    try {
      wanted = await cfGet<DnsRecord[]>(env, `${subsPath}/${sub.tag}/dns`, fetchImpl);
    } catch (err) {
      steps.push({ step: "dns", status: "failed", detail: errMsg(err) });
    }
  }
  for (const r of wanted) {
    if (!r.type || !r.name || !r.content) continue;
    steps.push(await ensureRecord(env, zone.id, "dns", { ...r, type: r.type, name: absoluteName(r.name, zone.name), content: r.content }, fetchImpl));
  }
  if (!wanted.some((r) => r.name && absoluteName(r.name, zone.name).startsWith("_dmarc."))) {
    steps.push(await ensureDmarc(env, zone, domain, fetchImpl));
  }
  steps.push(await ensureSubscription(env, zone, domain, fetchImpl));

  const record = await domainStatus(env, domain, { refresh: true, fetchImpl });
  return { domain, zone: zone.name, steps, record };
}
