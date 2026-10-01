// Newsletter readiness. Only technical requirements count: Flaresend does not decide how a person may send.
import {
  NEWSLETTER_POLICY_URL,
  type NewsletterCapabilities,
  type NewsletterEmailBlocker,
} from "@flaresend/types";
import type { ProjectRow } from "../../db/projects";
import { listDomainRecords } from "../domains";
import { resolveSender } from "../validate";
import { requirePublication, secret, type PublicationRow } from "./shared";

/** Unsubscribe and confirmation links need a public host. Production needs HTTPS; local development may use localhost. */
export function publicHostReady(env: Env) {
  try {
    const url = new URL(env.PUBLIC_BASE_URL);
    if (url.protocol === "https:") return true;
    return (
      String(env.ENVIRONMENT) === "development" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/** The first reason this publication cannot send email (confirmations or posts), or null when it can. */
export async function emailBlocker(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
): Promise<NewsletterEmailBlocker | null> {
  if (project.disabled_at || p.status === "archived") return "inactive";
  if (!p.from_address) return "sender_missing";
  if (
    !secret(env, "NEWSLETTER_TOKEN_SECRET") ||
    !secret(env, "NEWSLETTER_ADDRESS_SECRET")
  )
    return "secrets_missing";
  if (!publicHostReady(env)) return "public_host_missing";
  try {
    const sender = resolveSender(p.from_address, project);
    const domains = await listDomainRecords(env, project);
    const ok = domains.some(
      (d) =>
        d.domain === sender.address.split("@")[1] &&
        d.verification === "onboarded",
    );
    return ok ? null : "sender_unverified";
  } catch {
    return "sender_unverified";
  }
}

export const EMAIL_BLOCKER_MESSAGE: Record<NewsletterEmailBlocker, string> = {
  inactive: "This newsletter is archived or its project is paused.",
  sender_missing: "Add a from address in the newsletter settings.",
  sender_unverified: "Verify the sender's domain on the Domains page.",
  secrets_missing:
    "Set NEWSLETTER_TOKEN_SECRET and NEWSLETTER_ADDRESS_SECRET on the mailer.",
  public_host_missing:
    "Set PUBLIC_BASE_URL on the mailer to an HTTPS address.",
};

/** Subscription forms need the same things as sending: a verified sender, the token secrets and a public host. */
export async function confirmationReady(
  env: Env,
  project: ProjectRow,
  p: PublicationRow,
): Promise<boolean> {
  return p.status === "active" && (await emailBlocker(env, project, p)) === null;
}

export function aiReady(env: Env): boolean {
  return Boolean((env as unknown as { AI?: unknown }).AI);
}

export async function capabilities(
  env: Env,
  project: ProjectRow,
  publicationId?: string,
): Promise<NewsletterCapabilities> {
  const p = publicationId
    ? await requirePublication(env, project.id, publicationId)
    : undefined;
  const blocker = p ? await emailBlocker(env, project, p) : null;
  return {
    email: !!p && blocker === null,
    emailBlocker: blocker,
    webPublication:
      publicHostReady(env) && !project.disabled_at && p?.status !== "archived",
    subscriptionConfirmation: p
      ? await confirmationReady(env, project, p)
      : false,
    ai: aiReady(env),
    policyUrl: NEWSLETTER_POLICY_URL,
  };
}
