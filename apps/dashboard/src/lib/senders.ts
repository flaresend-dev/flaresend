import type { DomainRecord } from "@flaresend/types";

/**
 * Domains the dashboard offers as a test-email sender: the ones Cloudflare shows as onboarded.
 * When nothing could be checked (every domain "unknown", e.g. no CF_API_TOKEN), all domains are offered and
 * `unchecked` is true, so the dialog can say so instead of blocking every test.
 */
export function sendableDomains(domains: DomainRecord[]): { domains: DomainRecord[]; unchecked: boolean } {
  const verified = domains.filter((d) => d.verification === "onboarded");
  if (verified.length || !domains.length || domains.some((d) => d.verification !== "unknown")) return { domains: verified, unchecked: false };
  return { domains, unchecked: true };
}
