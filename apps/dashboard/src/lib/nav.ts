// Routes and navigation. Pure (no React), so the middleware and the tests can import it.

/**
 * First path segments that can never be project slugs. The last four are the old global pages, which now redirect
 * to `/` (next.config.ts); a project with one of those slugs could not be reached at `/{slug}`.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "projects", "api", "new", "_next", "favicon.ico", "emails", "analytics", "logs", "suppressions",
]);

/** Same rule as the mailer's CreateProjectInput slug. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type ProjectSection =
  | "emails" | "broadcasts" | "audiences" | "contacts" | "templates" | "metrics" | "logs"
  | "domains" | "api-keys" | "webhooks" | "suppressions" | "settings";

export interface NavItem {
  id: ProjectSection;
  label: string;
}

/** Sidebar order (section 2.2): sending and data first, then configuration. */
export const NAV: NavItem[][] = [
  [
    { id: "emails", label: "Emails" },
    { id: "broadcasts", label: "Broadcasts" },
    { id: "audiences", label: "Audiences" },
    { id: "contacts", label: "Contacts" },
    { id: "templates", label: "Templates" },
    { id: "metrics", label: "Metrics" },
    { id: "logs", label: "Logs" },
  ],
  [
    { id: "domains", label: "Domains" },
    { id: "api-keys", label: "API Keys" },
    { id: "webhooks", label: "Webhooks" },
    { id: "suppressions", label: "Suppressions" },
    { id: "settings", label: "Settings" },
  ],
];

export const NAV_ITEMS: NavItem[] = NAV.flat();

/** Project URL: p("acme", "api-keys") -> "/acme/api-keys"; extra parts are URI-encoded. */
export function p(slug: string, section?: ProjectSection, ...rest: string[]): string {
  const parts = [slug, ...(section ? [section] : []), ...rest.map(encodeURIComponent)];
  return `/${parts.join("/")}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Error text for a slug typed in the create form, or null when it is fine. */
export function slugError(slug: string): string | null {
  if (!slug) return "Enter a slug.";
  if (!SLUG_RE.test(slug)) return "Use lowercase letters, digits and dashes. Start with a letter or digit.";
  if (isReservedSlug(slug)) return `"${slug}" is reserved. Pick another slug.`;
  return null;
}

/** "Acme Mail!" -> "acme-mail" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** The project slug a path belongs to, or null for global/reserved paths. Used for the last-project cookie. */
export function projectFromPath(pathname: string): string | null {
  const seg = pathname.split("/")[1] ?? "";
  if (!seg || isReservedSlug(seg) || seg.includes(".") || !SLUG_RE.test(seg)) return null;
  return seg;
}

/** Which nav item a path is in, e.g. "/acme/webhooks/wh_1" -> "webhooks". */
export function activeSection(pathname: string): ProjectSection | null {
  const seg = pathname.split("/")[2] ?? "";
  return NAV_ITEMS.find((n) => n.id === seg)?.id ?? null;
}

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

/** Old `/projects/{slug}?tab=…` URLs -> the new page (section 2.3). */
export function legacyProjectHref(slug: string, sp: Sp): string {
  const tab = one(sp.tab);
  const isNew = one(sp.new) === "1";
  switch (tab) {
    case "domains":
      return p(slug, "domains");
    case "keys":
      return p(slug, "api-keys");
    case "webhooks":
      return one(sp.webhook) ? p(slug, "webhooks", one(sp.webhook)) : p(slug, "webhooks");
    case "templates":
      if (isNew) return p(slug, "templates", "new");
      return one(sp.template) ? p(slug, "templates", one(sp.template)) : p(slug, "templates");
    case "contacts":
      return p(slug, "contacts");
    case "audiences":
      return one(sp.audience) ? p(slug, "audiences", one(sp.audience)) : p(slug, "audiences");
    case "broadcasts":
      if (isNew) return p(slug, "broadcasts", "new");
      return one(sp.broadcast) ? p(slug, "broadcasts", one(sp.broadcast)) : p(slug, "broadcasts");
    case "settings":
      return p(slug, "settings");
    default:
      return p(slug, "emails");
  }
}
