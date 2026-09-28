"use server";
// Every mutation in the dashboard. Each action calls the mailer through mailerCall(), converts errors to
// `code: message`, and revalidates the pages that show the changed data.
import { revalidatePath } from "next/cache";
import type {
  AdminRpcApi, ContactInput, CreateBroadcastInput, CreateTemplateInput, DomainSetupResult, TemplateVariable, UpdateProjectInput,
} from "@flaresend/types";
import { domainOf, parseDisplayAddress } from "@flaresend/types";
import { mailerCall } from "@/lib/mailer";
import { sendableDomains } from "@/lib/senders";
import { formatUiError } from "@/lib/errors";
import { localInputToIso, splitList } from "@/lib/format";
import { isReservedSlug } from "@/lib/nav";
import type { ActionState } from "@/lib/action-state";

let seq = 0;

async function run<T>(
  fn: (m: AdminRpcApi) => Promise<T>,
  opts: { paths?: string[]; ok?: (data: T) => Omit<ActionState, "ok" | "seq"> } = {},
): Promise<ActionState> {
  const r = await mailerCall(fn);
  seq++;
  if (!r.ok) return { ok: false, error: formatUiError(r.error), seq };
  for (const p of opts.paths ?? []) revalidatePath(p);
  return { ok: true, seq, ...(opts.ok ? opts.ok(r.data) : {}) };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const optStr = (fd: FormData, k: string) => str(fd, k) || undefined;
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const int = (fd: FormData, k: string): number | undefined => {
  const v = str(fd, k);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};
const bad = (message: string): ActionState => ({ ok: false, error: `validation_error: ${message}`, seq: ++seq });

// Pages that show each kind of data (section 4.3).
const at = {
  projects: (slug: string) => [`/${slug}/settings`, `/${slug}/domains`, "/projects", `/${slug}`],
  keys: (slug: string) => [`/${slug}/api-keys`],
  webhooks: (slug: string, id?: string) => [`/${slug}/webhooks`, ...(id ? [`/${slug}/webhooks/${id}`] : [])],
  templates: (slug: string, name?: string) => [`/${slug}/templates`, ...(name ? [`/${slug}/templates/${encodeURIComponent(name)}`] : [])],
  contacts: (slug: string) => [`/${slug}/contacts`],
  audiences: (slug: string, id?: string) => [`/${slug}/audiences`, ...(id ? [`/${slug}/audiences/${id}`] : [])],
  broadcasts: (slug: string, id?: string) => [`/${slug}/broadcasts`, ...(id ? [`/${slug}/broadcasts/${id}`] : [])],
  emails: (slug: string | null, id?: string) => (slug ? [`/${slug}/emails`, ...(id ? [`/${slug}/emails/${id}`] : [])] : []),
  suppressions: (slug: string | null) => (slug ? [`/${slug}/suppressions`] : []),
};

// ---------- projects ----------

export async function createProjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const slug = str(fd, "slug");
  if (isReservedSlug(slug)) return bad(`"${slug}" is reserved; pick another slug`);
  const senders = splitList(str(fd, "allowedSenders"));
  const r = await run(
    (m) =>
      m.createProject({
        slug,
        name: str(fd, "name"),
        allowedDomains: splitList(str(fd, "allowedDomains")),
        defaultFrom: optStr(fd, "defaultFrom"),
        allowedSenders: senders.length ? senders : undefined,
        dailyLimit: int(fd, "dailyLimit"),
        rpcEnabled: bool(fd, "rpcEnabled"),
      }),
    { paths: ["/projects", "/"], ok: (p) => ({ message: `Created ${p.name}.`, data: p.slug }) },
  );
  return r;
}

/**
 * Project settings. With a `_fields` input (comma separated) only those fields are sent, so each Settings card
 * saves on its own; a switch that is off submits nothing, so presence alone cannot tell "off" from "not in this form".
 */
export async function updateSettingsAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const all: UpdateProjectInput = {
    name: str(fd, "name"),
    dailyLimit: int(fd, "dailyLimit"),
    rpcEnabled: bool(fd, "rpcEnabled"),
    trackOpens: bool(fd, "trackOpens"),
    trackClicks: bool(fd, "trackClicks"),
    broadcastsEnabled: bool(fd, "broadcastsEnabled"),
  };
  const only = splitList(str(fd, "_fields"));
  const patch: UpdateProjectInput = only.length
    ? Object.fromEntries(Object.entries(all).filter(([k]) => only.includes(k)))
    : all;
  return run((m) => m.updateProject(slug, patch), { paths: at.projects(slug), ok: () => ({ message: "Settings saved." }) });
}

/** Sending section of Domains. Fields that are not in the form are left unchanged. */
export async function updateDomainsAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const patch: UpdateProjectInput = {};
  if (fd.has("allowedDomains")) patch.allowedDomains = splitList(str(fd, "allowedDomains"));
  if (fd.has("defaultFrom")) patch.defaultFrom = str(fd, "defaultFrom") || null;
  if (fd.has("allowedSenders")) {
    const senders = splitList(str(fd, "allowedSenders"));
    patch.allowedSenders = senders.length ? senders : null;
  }
  return run((m) => m.updateProject(slug, patch), { paths: at.projects(slug), ok: () => ({ message: "Sending settings saved." }) });
}

/** What the Add domain and Set up dialogs show after they finish. */
export interface DomainSetupView {
  domain: string;
  setup: DomainSetupResult | null;
  /** `code: message` when Cloudflare setup failed; the domain is still added to the project. */
  setupError: string | null;
}

/** Adds the domain to the project, then onboards it in Cloudflare. A failed onboarding keeps the domain added. */
export async function addDomainAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const domain = str(fd, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return bad("enter a domain");
  const added = await run(
    async (m) => {
      const p = await m.getProject(slug);
      if (p.allowedDomains.includes(domain)) return { p, existed: true };
      return { p: await m.updateProject(slug, { allowedDomains: [...p.allowedDomains, domain] }), existed: false };
    },
    { paths: at.projects(slug), ok: (r) => ({ message: r.existed ? `${domain} is already added.` : `Added ${domain}.` }) },
  );
  if (!added.ok) return added;
  const setup = await mailerCall((m) => m.setupDomain(slug, domain));
  const view: DomainSetupView = { domain, setup: setup.ok ? setup.data : null, setupError: setup.ok ? null : formatUiError(setup.error) };
  return { ...added, data: view };
}

/** "Default sender" in a domain's menu. An empty value removes the domain's own sender. */
export async function setDomainSenderAction(slug: string, domain: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return bad("invalid domain");
  const sender = str(fd, "sender") || null;
  return run((m) => m.updateProject(slug, { domainSenders: { [domain]: sender } }), {
    paths: at.projects(slug),
    ok: () => ({ message: sender ? `Default sender for ${domain} saved.` : `Default sender for ${domain} removed.` }),
  });
}

export async function setupDomainAction(slug: string, domain: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.setupDomain(slug, domain), {
    paths: at.projects(slug),
    ok: (r): Omit<ActionState, "ok" | "seq"> => ({ message: `Set up ${domain} in Cloudflare.`, data: { domain, setup: r, setupError: null } satisfies DomainSetupView }),
  });
}

export async function removeDomainAction(slug: string, domain: string, _: ActionState, __: FormData): Promise<ActionState> {
  const r = await mailerCall((m) => m.getProject(slug));
  if (!r.ok) return { ok: false, error: formatUiError(r.error), seq: ++seq };
  const rest = r.data.allowedDomains.filter((d) => d !== domain);
  if (rest.length === 0) return bad("a project needs at least one domain; add another domain before removing this one");
  return run((m) => m.updateProject(slug, { allowedDomains: rest }), { paths: at.projects(slug), ok: () => ({ message: `Removed ${domain}.` }) });
}

export async function setProjectDisabledAction(slug: string, disabled: boolean, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => (disabled ? m.disableProject(slug) : m.updateProject(slug, { disabled: false })), {
    paths: [...at.projects(slug), "/"],
    ok: () => ({ message: disabled ? "Sending paused." : "Sending resumed." }),
  });
}

// ---------- API keys ----------

export async function createApiKeyAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const expires = localInputToIso(str(fd, "expiresAt"));
  return run(
    (m) => m.createApiKey(slug, { name: str(fd, "name"), mode: str(fd, "mode") === "test" ? "test" : "live", ...(expires ? { expiresAt: expires } : {}) }),
    { paths: at.keys(slug), ok: (k) => ({ message: `Created ${k.name}.`, secret: k.key, secretLabel: "Copy your API key" }) },
  );
}

export async function renameApiKeyAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run((m) => m.renameApiKey(id, str(fd, "name")), { paths: at.keys(slug), ok: () => ({ message: "API key renamed." }) });
}

export async function revokeApiKeyAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.revokeApiKey(id), { paths: at.keys(slug), ok: () => ({ message: "API key revoked." }) });
}

// ---------- emails ----------

export async function resendEmailAction(slug: string | null, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.resendEmail(id), {
    paths: at.emails(slug, id),
    ok: (r) => ({ message: "Sent again as a new email.", data: r.id }),
  });
}

export async function cancelEmailAction(slug: string | null, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.cancelEmail(id), { paths: at.emails(slug, id), ok: () => ({ message: "Scheduled email canceled." }) });
}

export async function rescheduleEmailAction(slug: string | null, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const when = localInputToIso(str(fd, "scheduledAt"));
  if (!when) return bad("pick a date and time");
  return run((m) => m.rescheduleEmail(id, when), { paths: at.emails(slug, id), ok: () => ({ message: "Email rescheduled." }) });
}

/** "Send test email" on the Emails page: plain text, from an address on one of the project's verified domains. */
export async function sendTestEmailAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const from = str(fd, "from");
  const to = str(fd, "to");
  const subject = str(fd, "subject");
  const body = str(fd, "body");
  if (!from) return bad("enter a from address");
  if (!to) return bad("enter an address to send to");
  if (!subject) return bad("enter a subject");
  if (!body) return bad("enter a message");
  let fromDomain: string;
  try {
    fromDomain = domainOf(parseDisplayAddress(from).address);
  } catch {
    return bad(`"${from}" is not a valid from address`);
  }
  const domains = await mailerCall((m) => m.listDomains(slug));
  if (!domains.ok) return { ok: false, error: formatUiError(domains.error), seq: ++seq };
  if (!sendableDomains(domains.data).domains.some((d) => d.domain === fromDomain)) {
    return bad(`${fromDomain} is not a verified domain of this project`);
  }
  return run((m) => m.sendEmail(slug, { from, to, subject, text: body, tags: { dashboard_test: "email" } }), {
    paths: at.emails(slug),
    ok: (r) => ({ message: r.status === "test" ? "Test email recorded (not sent)." : "Test email queued.", data: r.id }),
  });
}

// ---------- webhooks ----------

function webhookEvents(fd: FormData): string[] {
  const events = fd.getAll("events").filter((v): v is string => typeof v === "string");
  return events.includes("*") ? ["*"] : events;
}

export async function createWebhookAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const events = webhookEvents(fd);
  if (!events.length) return bad("pick at least one event");
  return run((m) => m.createWebhook(slug, { url: str(fd, "url"), events: events as never, enabled: bool(fd, "enabled") }), {
    paths: at.webhooks(slug),
    ok: (w) => ({ message: "Webhook added.", data: w.id, ...(w.secret ? { secret: w.secret, secretLabel: "Copy your signing secret" } : {}) }),
  });
}

export async function updateWebhookAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const events = webhookEvents(fd);
  if (!events.length) return bad("pick at least one event");
  return run((m) => m.updateWebhook(slug, id, { url: str(fd, "url"), events: events as never, enabled: bool(fd, "enabled") }), {
    paths: at.webhooks(slug, id),
    ok: () => ({ message: "Webhook saved." }),
  });
}

export async function setWebhookEnabledAction(slug: string, id: string, enabled: boolean, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.updateWebhook(slug, id, { enabled }), {
    paths: at.webhooks(slug, id),
    ok: () => ({ message: enabled ? "Webhook enabled." : "Webhook disabled." }),
  });
}

export async function deleteWebhookAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.deleteWebhook(slug, id), { paths: at.webhooks(slug), ok: () => ({ message: "Webhook deleted." }) });
}

export async function testWebhookAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.testWebhook(slug, id), { paths: at.webhooks(slug, id), ok: () => ({ message: "Test event queued." }) });
}

export async function rotateWebhookSecretAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.rotateWebhookSecret(slug, id), {
    paths: at.webhooks(slug, id),
    ok: (w) => (w.secret ? { secret: w.secret, secretLabel: "Copy your signing secret" } : { message: "Signing secret rotated." }),
  });
}

// ---------- templates (called directly from the editor, not via <form>) ----------

export async function saveTemplateAction(
  slug: string,
  existingName: string | null,
  input: { name: string; subject: string; html: string; text: string; variables: TemplateVariable[] },
): Promise<ActionState> {
  const text = input.text.trim() ? input.text : undefined;
  if (existingName) {
    return run(
      (m) => m.updateTemplate(slug, existingName, { subject: input.subject, html: input.html, text: text ?? null, variables: input.variables }),
      { paths: at.templates(slug, existingName), ok: (t) => ({ message: `Saved version ${t.version}.`, data: t }) },
    );
  }
  const create: CreateTemplateInput = { name: input.name, subject: input.subject, html: input.html, text, variables: input.variables };
  return run((m) => m.createTemplate(slug, create), { paths: at.templates(slug), ok: (t) => ({ message: `Created ${t.name}.`, data: t }) });
}

export async function deleteTemplateAction(slug: string, name: string): Promise<ActionState> {
  return run((m) => m.deleteTemplate(slug, name), { paths: at.templates(slug), ok: () => ({ message: `Deleted ${name}.` }) });
}

export async function restoreTemplateAction(slug: string, name: string, version: number): Promise<ActionState> {
  return run((m) => m.restoreTemplate(slug, name, version), {
    paths: at.templates(slug, name),
    ok: (t) => ({ message: `Restored version ${version} as version ${t.version}.`, data: t }),
  });
}

export async function templateVersionsAction(slug: string, name: string): Promise<ActionState> {
  return run((m) => m.templateVersions(slug, name), { ok: (v) => ({ data: v }) });
}

export async function renderTemplateAction(slug: string, name: string, data: Record<string, unknown>): Promise<ActionState> {
  return run((m) => m.renderTemplate(slug, name, data), { ok: (r) => ({ data: r }) });
}

export async function sendTestTemplateAction(slug: string, name: string, to: string, data: Record<string, unknown>): Promise<ActionState> {
  if (!to.trim()) return bad("enter an address to send the test to");
  return run(
    async (m) => {
      const project = await m.getProject(slug);
      return m.sendEmail(slug, {
        ...(project.defaultFrom ? { from: project.defaultFrom } : {}),
        to: to.trim(),
        template: name,
        data,
        tags: { dashboard_test: "template" },
      });
    },
    { paths: at.emails(slug), ok: (r) => ({ message: r.status === "test" ? "Test email recorded (not sent)." : "Test email queued.", data: r.id }) },
  );
}

// ---------- contacts ----------

export async function addContactAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (m) =>
      m.upsertContact(slug, {
        email: str(fd, "email"),
        firstName: optStr(fd, "firstName") ?? null,
        lastName: optStr(fd, "lastName") ?? null,
        unsubscribed: bool(fd, "unsubscribed"),
      }),
    { paths: at.contacts(slug), ok: (c) => ({ message: `Saved ${c.email}.` }) },
  );
}

export async function updateContactAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (m) =>
      m.updateContact(slug, id, {
        firstName: str(fd, "firstName") || null,
        lastName: str(fd, "lastName") || null,
        unsubscribed: bool(fd, "unsubscribed"),
      }),
    { paths: at.contacts(slug), ok: () => ({ message: "Contact saved." }) },
  );
}

export async function setContactUnsubscribedAction(slug: string, id: string, unsubscribed: boolean, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.updateContact(slug, id, { unsubscribed }), {
    paths: at.contacts(slug),
    ok: () => ({ message: unsubscribed ? "Contact unsubscribed." : "Contact subscribed." }),
  });
}

export async function deleteContactAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.deleteContact(slug, id), { paths: [...at.contacts(slug), ...at.audiences(slug)], ok: () => ({ message: "Contact deleted." }) });
}

export async function importContactsAction(slug: string, contacts: ContactInput[]): Promise<ActionState> {
  if (!contacts.length) return bad("no valid rows to import");
  if (contacts.length > 5000) return bad(`the mailer accepts at most 5,000 contacts per import; this file has ${contacts.length}`);
  return run((m) => m.importContacts(slug, contacts), {
    paths: at.contacts(slug),
    ok: (r) => ({ message: `Imported ${r.created + r.updated} contacts (${r.created} new, ${r.updated} updated).` }),
  });
}

/** The "Add contacts" dialog on an audience searches with this (first 50 matches). */
export async function searchContactsAction(slug: string, q: string): Promise<ActionState> {
  return run((m) => m.listContacts(slug, { limit: 50, ...(q.trim() ? { q: q.trim() } : {}) }), { ok: (r) => ({ data: r.data }) });
}

// ---------- audiences ----------

export async function createAudienceAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run((m) => m.createAudience(slug, str(fd, "name")), { paths: at.audiences(slug), ok: (a) => ({ message: `Created ${a.name}.`, data: a.id }) });
}

export async function renameAudienceAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run((m) => m.renameAudience(slug, id, str(fd, "name")), { paths: at.audiences(slug, id), ok: () => ({ message: "Audience renamed." }) });
}

export async function deleteAudienceAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.deleteAudience(slug, id), { paths: at.audiences(slug), ok: () => ({ message: "Audience deleted." }) });
}

export async function addAudienceMembersAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("contactIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.length) return bad("select at least one contact");
  return run((m) => m.addAudienceContacts(slug, id, ids), {
    paths: at.audiences(slug, id),
    ok: (r) => ({ message: `Added ${r.added} ${r.added === 1 ? "contact" : "contacts"}.` }),
  });
}

export async function removeAudienceMembersAction(slug: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ids = fd.getAll("contactIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.length) return bad("select at least one member");
  return run((m) => m.removeAudienceContacts(slug, id, ids), {
    paths: at.audiences(slug, id),
    ok: (r) => ({ message: `Removed ${r.removed} from the audience.` }),
  });
}

// ---------- broadcasts (composer calls these directly) ----------

export async function saveBroadcastAction(slug: string, id: string | null, input: CreateBroadcastInput): Promise<ActionState> {
  const clean = { ...input, text: input.text?.trim() ? input.text : undefined };
  if (id) {
    return run((m) => m.updateBroadcast(slug, id, clean), { paths: at.broadcasts(slug, id), ok: (b) => ({ message: "Draft saved.", data: b }) });
  }
  return run((m) => m.createBroadcast(slug, clean), { paths: at.broadcasts(slug), ok: (b) => ({ message: "Draft saved.", data: b }) });
}

export async function sendBroadcastAction(slug: string, id: string, scheduledLocal: string | null): Promise<ActionState> {
  const when = scheduledLocal ? localInputToIso(scheduledLocal) : null;
  if (scheduledLocal && !when) return bad("invalid schedule time");
  return run((m) => m.sendBroadcast(slug, id, when ?? undefined), {
    paths: at.broadcasts(slug, id),
    ok: (b) => ({ message: b.status === "scheduled" ? "Broadcast scheduled." : "Broadcast sending.", data: b }),
  });
}

export async function cancelBroadcastAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.cancelBroadcast(slug, id), { paths: at.broadcasts(slug, id), ok: () => ({ message: "Broadcast canceled." }) });
}

export async function deleteBroadcastAction(slug: string, id: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.deleteBroadcast(slug, id), { paths: at.broadcasts(slug), ok: () => ({ message: "Broadcast deleted." }) });
}

// ---------- suppressions (the list is global; slug only picks the page to refresh) ----------

export async function addSuppressionAction(slug: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const reason = str(fd, "reason");
  return run(
    (m) => m.addSuppression({ address: str(fd, "address"), reason: (["hard_bounce", "complaint", "manual"].includes(reason) ? reason : "manual") as "manual" }),
    { paths: at.suppressions(slug), ok: (s) => ({ message: `${s.address} added to suppressions.` }) },
  );
}

export async function removeSuppressionAction(slug: string | null, address: string, _: ActionState, __: FormData): Promise<ActionState> {
  return run((m) => m.removeSuppression(address), { paths: at.suppressions(slug), ok: () => ({ message: `${address} removed from suppressions.` }) });
}
