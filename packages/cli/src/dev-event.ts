import type { CfDeliveryStatus, CfEmailEvent, CfEmailEventType, EmailRecord } from "@flaresend/types";

export const DEV_EVENT_TYPES = ["delivered", "deferred", "bounced", "failed", "rejected", "complained"] as const;
export type DevEventType = (typeof DEV_EVENT_TYPES)[number];

export function isDevEventType(v: string): v is DevEventType {
  return (DEV_EVENT_TYPES as readonly string[]).includes(v);
}

export interface DevEventInput {
  type: DevEventType;
  messageId: string;
  sender: string;
  recipient: string;
  subject?: string;
  bounceType?: "hard" | "soft";
  /** Defaults to a random UUID. */
  eventId?: string;
  /** Defaults to now. */
  now?: Date;
}

/** Pull the bare address out of "Name <a@b.c>". */
export function bareAddress(v: string): string {
  const m = /<([^<>]+)>\s*$/.exec(v);
  return (m ? m[1]! : v).trim();
}

function domainOf(address: string): string {
  const a = bareAddress(address);
  const at = a.lastIndexOf("@");
  return at === -1 ? "localhost" : a.slice(at + 1).toLowerCase();
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function providerFor(recipient: string): string {
  const d = domainOf(recipient);
  if (d === "gmail.com" || d === "googlemail.com") return "google";
  if (["outlook.com", "hotmail.com", "live.com"].includes(d)) return "microsoft";
  if (d.startsWith("yahoo.")) return "yahoo";
  if (d === "icloud.com" || d === "me.com") return "apple";
  return "other";
}

/** Build one Cloudflare email event, in the shape Cloudflare delivers, for a single recipient. */
export function buildDevEvent(input: DevEventInput): CfEmailEvent {
  const status: CfDeliveryStatus = input.type;
  const now = input.now ?? new Date();
  const recipient = bareAddress(input.recipient);
  const sender = bareAddress(input.sender);

  let terminal = true;
  let delivery: CfEmailEvent["payload"]["delivery"];
  const extra: Partial<CfEmailEvent["payload"]> = {};

  switch (input.type) {
    case "delivered":
      delivery = {
        status,
        provider: providerFor(recipient),
        deliveryTimeMs: randomInt(300, 4000),
        smtpStatusCode: "250",
        smtpEnhancedStatusCode: "2.0.0",
        smtpResponse: "250 2.0.0 OK accepted for delivery",
      };
      break;
    case "deferred":
      terminal = false;
      delivery = {
        status,
        provider: providerFor(recipient),
        smtpStatusCode: "421",
        smtpEnhancedStatusCode: "4.7.0",
        smtpResponse: "421 4.7.0 Try again later, closing connection",
      };
      break;
    case "bounced": {
      const soft = input.bounceType === "soft";
      delivery = soft
        ? {
            status,
            provider: providerFor(recipient),
            smtpStatusCode: "452",
            smtpEnhancedStatusCode: "4.2.2",
            smtpResponse: "452 4.2.2 The recipient's mailbox is full",
          }
        : {
            status,
            provider: providerFor(recipient),
            smtpStatusCode: "550",
            smtpEnhancedStatusCode: "5.1.1",
            smtpResponse: "550 5.1.1 The email account that you tried to reach does not exist",
          };
      extra.bounce = soft
        ? { type: "soft", classification: "mailbox_full", reason: "Recipient mailbox is full" }
        : { type: "hard", classification: "invalid_recipient", reason: "Recipient address does not exist" };
      break;
    }
    case "failed":
      delivery = { status };
      extra.failure = { reason: "Could not connect to the recipient's mail server (dev event)" };
      break;
    case "rejected":
      delivery = {
        status,
        provider: providerFor(recipient),
        smtpStatusCode: "554",
        smtpEnhancedStatusCode: "5.7.1",
        smtpResponse: "554 5.7.1 Message rejected due to policy",
      };
      extra.rejection = { reason: "policy", party: "recipient", detail: "Message rejected by recipient server policy (dev event)" };
      break;
    case "complained":
      delivery = { status, provider: providerFor(recipient) };
      extra.complaint = { type: "abuse" };
      break;
  }

  const payload: CfEmailEvent["payload"] = {
    eventId: input.eventId ?? crypto.randomUUID(),
    messageId: input.messageId,
    sender,
    recipient,
    terminal,
    delivery,
    ...extra,
  };
  // Cloudflare leaves the subject off complaint events.
  if (input.type !== "complained" && input.subject !== undefined) payload.subject = input.subject;

  return {
    type: `cf.email.sending.message.${input.type}` as CfEmailEventType,
    source: { type: "email.sending", zoneId: "dev-zone", domain: domainOf(sender) },
    payload,
    metadata: {
      accountId: "dev-account",
      eventSubscriptionId: "dev-subscription",
      eventSchemaVersion: 1,
      eventTimestamp: now.toISOString(),
    },
  };
}

export type DevEventEmail = Pick<EmailRecord, "id" | "from" | "subject" | "cloudflareMessageId" | "status"> & {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  recipients?: Array<{ address: string }>;
};

export interface DevEventsForEmailOptions {
  /** Only build an event for this recipient. Must be one of the email's recipients. */
  recipient?: string;
  /** Use this instead of the email's cloudflareMessageId. */
  messageId?: string;
  bounceType?: "hard" | "soft";
  now?: Date;
}

/** Build one event per recipient of a stored email (or just `opts.recipient`). */
export function buildDevEventsForEmail(email: DevEventEmail, type: DevEventType, opts: DevEventsForEmailOptions = {}): CfEmailEvent[] {
  const messageId = opts.messageId ?? email.cloudflareMessageId;
  if (!messageId) {
    throw new Error(
      `email ${email.id} has no cloudflareMessageId yet (status: ${email.status}). ` +
        "Wait for the send consumer to send it, or pass --message-id.",
    );
  }

  let all = (email.recipients ?? []).map((r) => r.address);
  if (all.length === 0) all = [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])].map(bareAddress);

  let targets = all;
  if (opts.recipient) {
    const want = bareAddress(opts.recipient).toLowerCase();
    targets = all.filter((a) => bareAddress(a).toLowerCase() === want);
    if (targets.length === 0) {
      throw new Error(`${opts.recipient} is not a recipient of email ${email.id} (recipients: ${all.join(", ") || "none"})`);
    }
  }
  if (targets.length === 0) throw new Error(`email ${email.id} has no recipients`);

  return targets.map((recipient) =>
    buildDevEvent({
      type,
      messageId,
      sender: email.from,
      recipient,
      subject: email.subject,
      bounceType: opts.bounceType,
      now: opts.now,
    }),
  );
}
