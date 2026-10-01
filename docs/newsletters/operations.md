# Newsletter operation guide

Newsletters run on the same Cloudflare resources as the rest of Flaresend.
Each newsletter has its own identity, subscribers, posts, public website and email delivery.

## What it does

- A newsletter identity, layout, logo, sender and postal address.
- A block editor (BlockNote) with automatic saves and revision conflict protection.
- Workers AI writing help: first drafts, rewrites, continue writing, subject lines and image descriptions.
- Email, web and plain text previews, and test emails to up to five addresses.
- A public archive, articles, RSS feed and an embeddable sign-up form with email confirmation.
- Publishing on the website, sending by email, or both, now or on a schedule in an IANA timezone.
- Per-post delivery reports: delivered, opened, clicked, bounced or failed, unsubscribed, links clicked.
- Subscriber consent records, tags, search, CSV import, audience import and CSV export.

Flaresend does not limit how you send. Only technical requirements block a send: a verified sender domain, the two
newsletter secrets, an HTTPS `PUBLIC_BASE_URL`, and at least one subscriber. The project's own `daily_limit` and
rate limiter still apply; a newsletter waits for them and continues.
Cloudflare's [Email Service FAQ](https://developers.cloudflare.com/email-service/reference/faq/) describes the
service as intended for transactional email. The dashboard links to it once, on the Review and send page.

## Production setup

1. Apply migrations `0010_newsletters.sql` and `0011_newsletter_delivery.sql` before the new Worker release.
2. Create the `flaresend-newsletters` queue.
3. Set an HTTPS `PUBLIC_BASE_URL` on the mailer Worker.
4. Set separate random values for `NEWSLETTER_TOKEN_SECRET` and `NEWSLETTER_ADDRESS_SECRET`.
5. Keep the `ai` binding in `apps/mailer/wrangler.jsonc` to use AI writing help. Remove it to turn AI off.
6. Set a verified sender in the newsletter settings.
7. Turn on the public website and the sign-up form.

The bootstrap script creates the queue and the two secrets.
Keep the existing cron trigger and dead letter queue.
The cron starts scheduled emails, publishes scheduled web posts, re-queues interrupted sends, recovers imports,
expires tokens and cleans private files.
The newsletter queue sends emails in chunks of 25 recipients and processes subscriber imports.

### Sending

A send freezes one saved content revision and the matching subscribers when it is created.
Edits made later do not change it. Each recipient is handed to the normal send pipeline with an idempotency key,
so a retried chunk never sends twice. A subscriber who unsubscribes or is suppressed before their turn is skipped.
Every email has a one-click `List-Unsubscribe` header and a link in the footer.
Cancelling stops the recipients not yet handed over; emails already handed over still arrive.
Delivery, open and click counts come from the normal email events. Opens are an estimate.

### AI writing help

AI runs on Workers AI through the mailer's `AI` binding. It is billed to your Cloudflare account.
Three plain vars in `wrangler.jsonc` control it:

| Var | Default | Purpose |
| --- | --- | --- |
| `NEWSLETTER_AI_MODEL` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Drafts, rewrites and subject lines |
| `NEWSLETTER_AI_VISION_MODEL` | `@cf/meta/llama-3.2-11b-vision-instruct` | Image descriptions |
| `NEWSLETTER_AI_HOURLY_LIMIT` | `120` | AI calls per project per hour |

Meta's vision model needs a one-time licence agreement per account; the mailer sends it on the first refusal.
Every AI result is a suggestion: the editor shows it tinted and the user keeps or discards it.
Model output only enters a post through the editor's Markdown parser and the normal document validation.

### Confirmation emails

The confirmation email contains a service message and a confirmation link only.
It disables open and click tracking.
A confirmation link expires after 24 hours.
A GET request cannot confirm or unsubscribe a subscriber.
The public forms enforce an origin check, byte limits, and separate request limits.

The address secret protects deletion and opt-out records.
Preserve that secret when you rotate the token signing secret.
Set a new `NEWSLETTER_TOKEN_KEY_ID` for a new token signing key.
Retain old token keys in `NEWSLETTER_PREVIOUS_TOKEN_KEYS` as a JSON object.
An example value is `{"v1":"the_previous_secret"}`.
Existing unsubscribe links have no time limit.

## SDK examples

The HTTP client uses the project from its API key.

```ts
import { Flaresend } from "@flaresend/client";

const mail = new Flaresend({ apiKey: env.FLARESEND_API_KEY });
const newsletter = await mail.newsletters.createPublication({
  name: "The Dispatch",
  slug: "dispatch",
  timezone: "Africa/Johannesburg",
});
const post = await mail.newsletters.createNewsletterPost(newsletter.id, {
  title: "A useful update",
  document: {
    schemaVersion: 1,
    blocks: [{
      id: "intro",
      type: "paragraph",
      content: [{ type: "text", text: "Here is our first article." }],
    }],
  },
});
await mail.newsletters.updatePublication(newsletter.id, {
  expectedRevision: newsletter.revision,
  siteEnabled: true,
});
await mail.newsletters.publishNewsletterWeb(newsletter.id, post.id, {
  expectedRevision: post.revision,
  revisionId: post.draftRevisionId,
  idempotencyKey: crypto.randomUUID(),
});
```

The service binding client uses the same API with a fixed project.

```ts
import { rpcClient } from "@flaresend/client/rpc";
const mail = rpcClient(env.MAILER, { project: "my-project" });
const newsletters = await mail.newsletters.listPublications();
```

Bind `MAILER` to the `MailerRpc` entrypoint.
The project must permit RPC access.
The dashboard uses `AdminRpc` or its authenticated HTTP fallback.
All three transports use the same newsletter core.

## API behavior

The authenticated base path is `/v1/publications`.
The admin base path is `/v1/admin/projects/:slug/publications`.
Use `/v1/newsletter-capabilities` to see whether a newsletter is ready to send.
The shared contract is `NewsletterApi` in `packages/types/src/newsletters.ts`.

Every editable record has a revision number.
Supply `expectedRevision` for a conditional write.
A stale revision produces `revision_conflict` and preserves the saved record.
The editor keeps local changes and offers a draft download after a save failure.
The public article uses its immutable saved revision.
Later draft edits cannot change that public version.
The preview uses the same identity, logo, and layout as that saved revision.
Save a new post revision to apply a changed newsletter identity or layout.
An article address cannot change after its first web publication.

Use an idempotency key for a web publication, an email send or an import.
The same key and request return the original result.
A different request with that key produces `idempotency_payload_mismatch`.

The asset endpoint accepts `{base64,mimeType}` JSON.
It permits PNG, JPEG, and WebP images below 5 MiB and 4096 pixels per axis.
Draft images require project authorization.
Public images require a current public revision, a public newsletter logo, or a revision that was emailed.

The CSV preview endpoint accepts `{csv,mapping?}` JSON.
The preview returns a private file ID and a signed preview token.
Start an import with that file ID, mapping, consent record, token, and idempotency key.
The maximum file has 5,000 rows and 5 MiB.
The same address appears once per newsletter.
An import cannot restore an unsubscribe, suppression, or deleted subscription.
An export uses the same subscriber filters as the list and review counts.
The maximum export has 10,000 rows.

## Email delivery API

| Route (under `/v1/publications/:id`) | Purpose |
| --- | --- |
| `POST /posts/:postId/send-email` | Create a send. Body: `revisionId`, `expectedRevision`, optional `filter`, `scheduledAt`, `timezone`; `Idempotency-Key` header or `idempotencyKey`. |
| `POST /posts/:postId/send-test` | Send the saved draft to `{ "to": ["you@example.com"] }`. |
| `GET /email-runs?postId=` | List sends with counts. |
| `GET /email-runs/:runId` | One send with counts and the links clicked. |
| `GET /email-runs/:runId/recipients` | Recipients with status, `?status=` and `?q=` filters. |
| `POST /email-runs/:runId/cancel` | Cancel a scheduled or sending email. |
| `POST /ai` | AI writing help (`draft`, `continue`, `rewrite`, `subjects`, `alt-text`). |

`GET /v1/newsletter-capabilities?publicationId=` returns `email`, `emailBlocker` (the technical reason, if any),
`webPublication`, `subscriptionConfirmation` and `ai`.

## Verification

```sh
pnpm --filter @flaresend/types build
pnpm --filter @flaresend/client build
pnpm --filter @flaresend/mailer typecheck
pnpm --filter @flaresend/dashboard typecheck
pnpm --filter @flaresend/mailer exec vitest run --maxWorkers=1
pnpm --filter @flaresend/dashboard test
pnpm --filter @flaresend/client test
pnpm --filter @flaresend/types test
pnpm --filter @flaresend/dashboard build
```

Use a separate local database for a browser test.
Use local email bindings without `remote: true` for that test.
`FLARESEND_DEV_CONFIG` can select a separate dashboard Wrangler configuration under `next dev`.
The normal dashboard configuration remains the default.
The Next.js build works on Windows.
Use WSL or CI for the OpenNext Worker bundle, as the dashboard README requires.
