# Newsletter redesign: implementation plan

Date: 1 October 2026.
Status: Implemented on 1 October 2026. Section 12 lists where the build differs from this plan.
Mockups: [redesign/mockups.html](redesign/mockups.html). Open it in a browser. The black bar at the top switches screens and the light or dark theme.

This plan replaces the parts of [design.md](design.md) and [implementation.md](implementation.md) that it contradicts. Section 1 lists the contradictions. Where this plan is silent, the older documents and the existing code stand.

## 0. Instructions for the implementing agent

1. Read this file top to bottom, then open the mockups. Each screen section below names its mockup with a URL hash, for example `mockups.html#editor-b`.
2. Work in the stage order in section 3. Each stage ends with checks. Run them before you start the next stage.
3. The mockup HTML is a picture, not source code. Build the real screens with the existing kit in `apps/dashboard/src/components/ui` and the Tailwind token classes from `apps/dashboard/src/app/globals.css`. Do not copy the mockup's CSS class names.
4. Three facts in this plan come from web pages read on 1 October 2026 and were not tested in this repo: the BlockNote version and API (section 6), the Workers AI model list (section 7), and the Cloudflare FAQ wording (section 4). Check each one when you reach it. If one is wrong, follow the fallback written next to it.
5. `@flaresend/types` ships a prebuilt `dist`. After you change anything in `packages/types/src`, run `pnpm --filter @flaresend/types build` before you typecheck the mailer or the dashboard.
6. Do not deploy, do not run remote migrations, and do not send real email to addresses you do not control.
7. Report at the end: stages done, the output of the verification commands in section 9, and anything you could not finish.

## 1. Decisions

The user made these decisions on 1 October 2026. They override the earlier documents.

| # | Decision | What it replaces |
| --- | --- | --- |
| D1 | Newsletter email is a working feature. The server does not block it for policy reasons. Users are free to send how they please. | design.md section 2, implementation.md sections 4 and 9, the "Delivery boundary" in README.md. |
| D2 | The Cloudflare note is one short line with a link to the Cloudflare docs. It appears on one page only: Review and send. It blocks nothing and can be dismissed. | The full and compact banners on every newsletter page. |
| D3 | The post body uses BlockNote, a well-known block editor with its own menus and toolbars. The hand-built block list and per-block toolbar are deleted. | `components/newsletters/editor.tsx` and `rich-block.tsx`. |
| D4 | Workers AI helps write: first drafts, rewrites, continue writing, subject lines, image descriptions. It runs in the mailer Worker with the `AI` binding. | New. |
| D5 | Every newsletter screen is redesigned to use the dashboard's own UI kit and to match the mockups. | The raw `<table>`, `<select>`, `<details>` and checkbox markup in the current newsletter screens. |

Things that stay exactly as they are: the project boundary, the document format `NewsletterDocument` version 1 (with the small relaxations in 6.3), revisions in R2, the public site and its routes, double opt-in subscription, CSV import, tags, unsubscribe links, and Broadcasts (its 500-recipient cap and its own notice are not part of this work; see section 11).

## 2. What exists today

Facts from the code on branch `feat/all-projects-full`, uncommitted.

- **The gate.** `apps/mailer/src/core/newsletters/policy.ts` exports `requireNewsletterEmailCapability()`, which always throws `409 newsletter_email_unavailable`. It is called from `core/send.ts:81`, `core/provider.ts:64`, `core/newsletters/admin-handlers.ts:49`, `http/routes/newsletters.ts:239` and `:427`. The same error is thrown inline in `core/admin.ts:241` (resend), `core/emails.ts:99` (reschedule) and `queue/send-consumer.ts:79`. `capabilities()` returns `newsletterEmail: false` as a literal type.
- **No production send path.** `core/newsletters/test-delivery.ts` holds a rehearsal engine that only runs when `ENVIRONMENT` is `test` and sends through a fake adapter. The tables it uses exist in `migrations/0010_newsletters.sql`: `newsletter_email_runs`, `newsletter_run_recipients`, and the `emails` columns `purpose`, `newsletter_run_id`, `newsletter_recipient_id`.
- **The working send pipeline.** `core/send.ts` `sendEmail()` stores the payload in R2, inserts the `emails` row, and puts a message on `SEND_QUEUE`. `queue/send-consumer.ts` sends it through Cloudflare. Delivery, bounce, open and click events update the `emails` row (`status`, `opened_at`, `first_clicked_at`). `core/broadcasts.ts` `processBroadcastChunk()` is the existing example of a bulk fan-out through `sendEmail()`.
- **The banner.** `components/newsletters/policy-notice.tsx` is rendered by the list page, `publication-nav.tsx` (every newsletter page), `setup.tsx` and `review.tsx`.
- **The editor.** `components/newsletters/editor.tsx` (649 lines) renders each block as a bordered box with "↑ ↓ Remove" buttons and a row of "+ paragraph, + heading2 …" buttons. `rich-block.tsx` puts a separate small TipTap instance in every text block. TipTap is used nowhere else in the dashboard.
- **The other screens** use raw HTML controls instead of the kit: `subscribers.tsx`, `settings.tsx`, `setup.tsx`, `review.tsx`, and the pages under `app/[slug]/newsletters`. The publication layout adds `mx-auto max-w-6xl p-6` inside the shell, which already has its own padding.
- **Transport.** The dashboard calls the mailer through the `MAILER_ADMIN` service binding (`AdminRpc` in `apps/mailer/src/rpc-admin.ts`) or, in local dev, over HTTP (`apps/dashboard/src/lib/mailer-http.ts`). Newsletter methods are declared once in `NewsletterApi` (`packages/types/src/newsletters.ts`), mapped to HTTP in `newsletter-transport.ts`, served by `http/routes/newsletters.ts` and `core/newsletters/admin-handlers.ts`, and allow-listed in `apps/dashboard/src/app/newsletter-actions.ts`. A new method must be added in all five places.
- **A likely bug to fix on the way.** Image upload and CSV import send up to 5 MiB through a Next.js server action. `apps/dashboard/next.config.ts` does not raise `experimental.serverActions.bodySizeLimit`, and the Next.js default is 1 MB. I did not run it to confirm. Set the limit to `"8mb"` in stage 3 and test with a 3 MB image.

## 3. Stages

| Stage | Result | Depends on |
| --- | --- | --- |
| S1 | The gate is gone. Capabilities report only technical readiness. The one-line note exists. | — |
| S2 | Newsletter email sends for real: now, scheduled, test, cancel, with per-run numbers. | S1 |
| S3 | The BlockNote editor replaces the block list. Autosave, preview and details panel work. | — |
| S4 | Workers AI drafting works in the editor. | S3 |
| S5 | All other screens are rebuilt to the mockups, including Review and send and the post report. | S1, S2 |
| S6 | Docs, tests and the final checks. | all |

S3 and S4 do not depend on S1 and S2. If two agents work at once, split there.

## 4. S1: remove the gate, add the one-line note

### 4.1 Types (`packages/types/src/newsletters.ts`)

Delete `NEWSLETTER_POLICY_QUOTE`, `NEWSLETTER_POLICY_VERSION` and `NEWSLETTER_UNAVAILABLE_MESSAGE`. Keep `NEWSLETTER_POLICY_URL`.

Replace `NewsletterCapabilities` with:

```ts
export type NewsletterEmailBlocker =
  | "sender_missing"        // the publication has no from address
  | "sender_unverified"     // the from address's domain is not onboarded
  | "secrets_missing"       // NEWSLETTER_TOKEN_SECRET or NEWSLETTER_ADDRESS_SECRET is not set
  | "public_host_missing"   // PUBLIC_BASE_URL is not usable for unsubscribe links
  | "inactive";             // the project is paused or the publication is archived

export interface NewsletterCapabilities {
  /** True when this publication can send email now. Only technical requirements count. */
  email: boolean;
  /** Why `email` is false, else null. */
  emailBlocker: NewsletterEmailBlocker | null;
  webPublication: boolean;
  subscriptionConfirmation: boolean;
  /** True when the mailer has the Workers AI binding. */
  ai: boolean;
  policyUrl: string;
}
```

Remove `emailAvailable: false` from `NewsletterReports`.

### 4.2 Mailer

- `core/newsletters/policy.ts`: delete `requireNewsletterEmailCapability`. Turn `confirmationReady()` into `emailBlocker(env, project, publication): Promise<NewsletterEmailBlocker | null>` that returns the first failing reason. `subscriptionConfirmation` and `email` are both `emailBlocker === null`. `ai` is `Boolean(env.AI)` (the binding arrives in S4; until then write `"AI" in env && Boolean(env.AI)`). When `capabilities()` is called without a publication id, return `email: false, emailBlocker: null`.
- `publicHostReady()` today needs `https:`. Keep that in production. Also accept `http://localhost` and `http://127.0.0.1` when `ENVIRONMENT` is `development`, so sending can be tried locally.
- Remove every call and inline throw listed in section 2 under "The gate". After this stage, `grep -rn "newsletter_email_unavailable" apps/*/src packages/*/src` must return one file only: `core/newsletters/test-delivery.ts`, which S2 deletes.
- `core/admin.ts` resend and `core/emails.ts` reschedule: delete the newsletter checks. Keep the `subscription_confirmation` check in resend.
- `queue/send-consumer.ts`: delete the block that rejects emails with `purpose === "newsletter"`. Pass `email.purpose` through as before.
- `newsletter_email_runs.provider_policy_version` is `NOT NULL`. Write an empty string to it from now on. Do not edit migration 0010.

### 4.3 Dashboard

Rewrite `components/newsletters/policy-notice.tsx` as `EmailServiceNote`, a client component:

- One line, 12px, muted text, an info icon, no coloured background: **"Cloudflare Email Service is for transactional email."** followed by the link **"Cloudflare docs"** to `NEWSLETTER_POLICY_URL`, opening in a new tab, and a small dismiss button with `aria-label="Dismiss"`.
- Dismissal is remembered in `localStorage` under `fs-nl-email-note`. Wrap reads and writes in `try/catch`. Render nothing once dismissed.
- It is rendered in exactly one place: under the "Send by email" row on the Review and send page (section 8.7). See `mockups.html#review`.

Remove `NewsletterPolicyNotice` from `app/[slug]/newsletters/page.tsx`, `publication-nav.tsx`, `setup.tsx` and the old `review.tsx`. Remove every sentence in the newsletter screens that says email is unavailable, disabled or coming later.

The wording follows the Cloudflare FAQ, which on 1 October 2026 said: "Email Service is intended only for transactional emails." Do not quote it at length and do not add a second sentence.

### 4.4 Checks for S1

- `apps/mailer/test/integration/newsletters.test.ts` (lines near 162, 222, 243, 698), `test/integration/rpc.test.ts` (near 48 to 56) and `packages/client/test/newsletters.test.ts` (near 55 to 73) assert the old gate. Rewrite them to assert the new `NewsletterCapabilities` shape. The send assertions are replaced in S2.
- A test proves `capabilities().email` is `true` for a publication with a verified sender and `false` with `emailBlocker: "sender_missing"` without one.
- `pnpm typecheck` passes.

## 5. S2: email delivery

### 5.1 Migration `apps/mailer/migrations/0011_newsletter_delivery.sql`

```sql
CREATE INDEX emails_newsletter_run ON emails(newsletter_run_id, status) WHERE newsletter_run_id IS NOT NULL;
CREATE INDEX newsletter_runs_post ON newsletter_email_runs(post_id, created_at DESC);
ALTER TABLE newsletter_email_runs ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_email_runs ADD COLUMN schedule_timezone TEXT;
ALTER TABLE newsletter_email_runs ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE publications ADD COLUMN ai_instructions TEXT NOT NULL DEFAULT '';
```

The last line belongs to S4 and lives here so there is one new migration.

### 5.2 Types

```ts
export const NewsletterSendInput = z.object({
  expectedRevision: z.number().int().positive(),
  revisionId: z.string(),                         // the draft revision the user reviewed
  filter: NewsletterFilter.default({}),           // tags, sources, audience; status is ignored
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  timezone: NewsletterTimezone.optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

export interface NewsletterEmailRun {
  id: string;
  publicationId: string;
  postId: string;
  revisionId: string;
  subject: string;
  status: "scheduled" | "sending" | "sent" | "canceled";
  scheduledAt: string | null;
  scheduleTimezone: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Recipients fixed when the run was created. */
  total: number;
  /** Recipients handed to the send pipeline or finished some other way. */
  processed: number;
  delivered: number;
  bounced: number;
  failed: number;      // rejected or failed emails, plus recipients that could not be queued
  skipped: number;     // unsubscribed or suppressed between creation and send
  opened: number;
  clicked: number;
  unsubscribed: number;
  /** Set while a run waits for the project's own daily limit to reset. */
  waiting: "daily_limit" | null;
}

export interface NewsletterRunRecipient {
  id: string;
  email: string;
  emailId: string | null;
  status: "pending" | "queued" | "sent" | "delivered" | "bounced" | "failed" | "skipped" | "canceled";
  openedAt: string | null;
  clickedAt: string | null;
}
```

Add to `NewsletterPostRecord`:

```ts
/** The latest email run for this post, or null when it was never emailed. */
email: Pick<NewsletterEmailRun, "id" | "status" | "scheduledAt" | "completedAt" | "total" | "delivered" | "opened" | "clicked"> | null;
```

Change and add methods in `NewsletterApi`:

```ts
sendNewsletterEmail(slug, id, postId, input: z.input<typeof NewsletterSendInput>): Promise<NewsletterEmailRun>;
sendNewsletterTest(slug, id, postId, input: { to: string[]; subscriptionId?: string }): Promise<{ sent: number }>;
listNewsletterEmailRuns(slug, id, query?: { postId?: string; limit?: number; cursor?: string }): Promise<ListResponse<NewsletterEmailRun>>;
getNewsletterEmailRun(slug, id, runId): Promise<NewsletterEmailRun & { links: Array<{ url: string; clicks: number }> }>;
listNewsletterRunRecipients(slug, id, runId, query?: { status?: string; q?: string; limit?: number; cursor?: string }): Promise<ListResponse<NewsletterRunRecipient>>;
cancelNewsletterEmailRun(slug, id, runId): Promise<NewsletterEmailRun>;
```

HTTP routes, under `/publications/:id`: `POST /posts/:postId/send-email`, `POST /posts/:postId/send-test`, `GET /email-runs`, `GET /email-runs/:runId`, `GET /email-runs/:runId/recipients`, `POST /email-runs/:runId/cancel`. Replace the catch-all `email-runs/:runId/:command` route.

Extend `NewsletterReview`:

```ts
checks: Array<{ id: string; label: string; ok: boolean; level: "error" | "warning"; message?: string; fix?: "editor" | "settings" | "website" | "subscribers" }>;
sender: { fromAddress: string | null; fromName: string };
lastRun: NewsletterEmailRun | null;
```

Only `level: "error"` checks block the button, and each one is technical: empty title or body, website off (blocks the website channel only), `capabilities.emailBlocker` set (blocks the email channel only), zero eligible recipients (blocks the email channel only). Warnings never block: empty postal address, images without a description, a button without a link.

### 5.3 Engine: `apps/mailer/src/core/newsletters/delivery.ts`

Port the logic of `test-delivery.ts` to the real pipeline, then delete `test-delivery.ts`.

**`createRun(env, project, publicationId, postId, input)`**

1. `active(project, publication)`. If `emailBlocker()` returns a reason, throw `409` with code `newsletter_sender_not_ready` and a message that names the reason.
2. Check `post.revision === input.expectedRevision` and `post.draft_revision_id === input.revisionId`, else `409 revision_conflict`.
3. Check the title and body are not empty, else `422 invalid_document`.
4. Idempotency: look up `newsletter_email_runs` by `(project_id, request_key)`. Same hash returns the existing run. A different hash throws `409 idempotency_payload_mismatch`. This is the pattern already in `test-delivery.ts`.
5. Validate `scheduledAt` the way `publishWeb()` does: must have an offset and be in the future.
6. In one `env.DB.batch`: insert the run (`status` is `scheduled` when `scheduledAt` is set, else `sending`; `started_at` set when sending; `subject` from the revision metadata; `provider_policy_version` is `''`), then insert recipients with the existing `INSERT … SELECT` over `ELIGIBLE` and `filterSql(filter)`, then `UPDATE newsletter_email_runs SET total = (SELECT COUNT(*) FROM newsletter_run_recipients WHERE run_id = ?)`.
7. If `total` is 0, delete the run and throw `422 no_recipients` with the message "No subscribers match this selection."
8. If the status is `sending`, `env.NEWSLETTER_QUEUE.send({ kind: "newsletter-run", runId })`.

**`processRun(env, runId)`**, called by the queue consumer. Returns `"done" | "more" | "wait"`.

1. Load the run. If its status is not `sending`, return `done`.
2. Take a lease so two queue messages cannot work on the same run: `UPDATE newsletter_email_runs SET lease_token=?, lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until < ?)`. No row changed means another worker has it: return `done`. Lease for 5 minutes. Clear it at the end.
3. Load the project and publication. If the project is paused or the publication is archived, mark the run `canceled` and pending recipients `canceled`, return `done`.
4. Load the frozen revision once with `revision(env, post, run.revision_id)`.
5. Select up to 50 recipients with `status='pending'` ordered by `id`.
6. Find which of them are still eligible with one query (`id IN (…)` joined to `ELIGIBLE`). Mark the others `skipped` with `skip_reason='no_longer_eligible'`.
7. For each eligible recipient:
   - Build the unsubscribe URL with `unsubscribeToken()`. Extend the token payload to `publicationId~subscriptionId~runId`. Update `POST /n/u/:token` in `http/routes/newsletter-public.ts` to read the optional third part and store it as `runId` in the unsubscribe event's `data_json`. Old two-part tokens must keep working.
   - Render with `renderNewsletter(document, { …metadata, target: "email", values: personalization, assetUrl, unsubscribeUrl })`.
   - Call `sendEmail()` with context `{ project, mode: "live", source: "broadcast", apiKeyId: null }`. Use `source: "broadcast"`: the `emails.source` column has a `CHECK` list and SQLite cannot extend it without rebuilding the table.
   - Input: `from` is `formatDisplayAddress({ address: publication.from_address, name: publication.from_name || publication.name })`, `to` is the address snapshot, `replyTo` when set, `subject`, `html`, `text`.
   - Options: `purpose: "newsletter"`, `idempotencyKey: "nl:" + runId + ":" + recipientId`, `extraTags: { newsletter_run_id, newsletter_post_id, publication_id }`, `extraHeaders` with `List-Unsubscribe` and `List-Unsubscribe-Post`, `skipSuppressionCheck: true`, and two new `SendOptions` fields `newsletterRunId` and `newsletterRecipientId` that `sendEmailInternal` copies onto the row (`insertEmailStmt` already writes both columns).
   - On success: `UPDATE newsletter_run_recipients SET status='queued', email_id=? WHERE id=? AND status='pending'`.
   - On an `ApiError` of type `rate_limit_error`: stop the loop. Return `wait`. The recipient stays `pending`. The idempotency key makes a later retry safe.
   - On any other error: set the recipient to `failed` with the error code in `skip_reason` and continue.
8. If pending recipients remain, return `more`. Otherwise set the run to `sent` with `completed_at` and return `done`.

**Queue consumer** (`queue/newsletters-consumer.ts`): add `{ kind: "newsletter-run"; runId: string }` to `NewsletterQueueMessage`. On `more`, send the same message again and ack. On `wait`, `msg.retry({ delaySeconds: 30 })`. On a thrown error, retry with the existing backoff. In `queue/dlq-consumer.ts`, a dead `newsletter-run` message leaves the run as `sending`; the cron picks it up again.

**Cron** (`cron/newsletters.ts`, inside `runNewsletterJobs`): (a) for every run with `status='scheduled' AND scheduled_at <= now`, set `status='sending', started_at=now` with a guarded update and enqueue it; (b) for every run with `status='sending'`, pending recipients, and `updated_at` older than 10 minutes, enqueue it again. Touch `updated_at` at the end of each `processRun`.

**`cancelRun`**: allowed for `scheduled` and `sending`. Sets the run to `canceled` and pending recipients to `canceled`. Emails already handed to the pipeline still go out; the dashboard says so.

**`runCounts(env, runId)`**: one query over `emails WHERE newsletter_run_id = ?` grouping by `status`, with `SUM(opened_at IS NOT NULL)` and `SUM(first_clicked_at IS NOT NULL)`; one query over `newsletter_run_recipients` grouping by `status`; one count of unsubscribe events whose `data_json` has this `runId`. `waiting` is `"daily_limit"` when the run is `sending`, has pending recipients, and the project's `daily_counts` row for today has reached `daily_limit`; otherwise `null`. A wait on the per-minute rate limiter lasts seconds and gets no label.

**Links clicked**: `SELECT json_extract(ev.data,'$.url') AS url, COUNT(*) AS clicks FROM email_events ev JOIN emails e ON e.id = ev.email_id WHERE e.newsletter_run_id = ? AND ev.type = 'email.clicked' GROUP BY url ORDER BY clicks DESC LIMIT 20`. The click event and its `url` field are written in `http/routes/tracking.ts`.

**`sendTest`**: 1 to 5 addresses. No run row. Renders with the sample reader or the chosen subscriber, prefixes the subject with `[Test] `, uses `purpose: "newsletter"` and the normal suppression check, so a suppressed address returns the normal clear error. The unsubscribe link is the preview placeholder.

**Post list**: `toPost()` gains the `email` summary. In `listPosts`, load the latest run for all posts on the page with one query and their counts with one grouped query. Do not run per-post queries.

Limits that still apply, and are the user's own settings rather than a policy: the project's `daily_limit` (0 means none) and the per-project rate limiter. There is no recipient cap and no enable switch for newsletters.

### 5.4 Checks for S2

Integration tests in `apps/mailer/test/integration/newsletters.test.ts`, with `vi.spyOn(emailProvider, "send")` as the other suites do:

- Create a run for 3 eligible subscribers: 3 emails queued, each with `List-Unsubscribe`, `purpose='newsletter'`, `newsletter_run_id` set, personalised first name in the HTML. Run ends `sent`.
- Calling `sendNewsletterEmail` twice with the same idempotency key returns the same run and sends nothing twice.
- A subscriber who unsubscribes after the run is created and before it is processed is `skipped`.
- A scheduled run does nothing until the cron runs after `scheduledAt`.
- Cancel stops pending recipients.
- A rate-limit error leaves the recipient `pending` and the next `processRun` sends it once.
- `sendNewsletterTest` sends to the typed address and creates no run.
- An unsubscribe through a three-part token is counted in `run.unsubscribed`.
- With no verified sender, `sendNewsletterEmail` returns `409 newsletter_sender_not_ready`.

## 6. S3: the editor

Mockups: `#editor-a` (writing, text selected), `#editor-b` (empty post), `#editor-d` (slash menu).

### 6.1 Library

Use BlockNote: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`. On 1 October 2026 the latest version was reported as 0.55.0, licence MPL-2.0, with React 19 and Next.js 15 support. Run `pnpm view @blocknote/react version peerDependencies` first and pin the three packages to the same exact minor version.

Do not install `@blocknote/xl-ai` or any other `@blocknote/xl-*` package. They are GPL-3.0 or commercial, and Flaresend is MIT. AI is built in S4 on Workers AI with plain BlockNote APIs.

Remove `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/pm`, `@tiptap/react` and `@tiptap/starter-kit` from `apps/dashboard/package.json`. Only `rich-block.tsx` uses them.

What BlockNote gives for free, and must not be rebuilt by hand: the slash menu, the drag handle and "+" in the left gutter, the selection toolbar, link editing, markdown shortcuts (`## `, `- `, `1. `, `> `), paste clean-up, undo and redo, keyboard navigation, image upload with drag and drop, captions and resize.

Fallback: if BlockNote cannot be made to work with this app's React or Next.js version, stop and report. Do not fall back to a hand-built editor.

### 6.2 Files

```
apps/dashboard/src/components/newsletters/editor/
  post-editor.tsx        client. Top bar, title, subtitle, canvas, details panel. Replaces editor.tsx.
  use-post-autosave.ts   the save queue from the old editor.tsx, moved into a hook, logic unchanged.
  body-editor.tsx        client. The BlockNote instance. Loaded with next/dynamic and ssr: false.
  schema.tsx             BlockNoteSchema, the button block, the personalization inline content.
  slash-items.tsx        slash menu items.
  toolbar.tsx            selection toolbar.
  image-meta.tsx         "Alt text" toolbar button and popover.
  details-panel.tsx      Email and Website fields.
  preview-sheet.tsx      Email, Website and Plain text preview.
apps/dashboard/src/lib/newsletter-doc.ts        pure conversion between BlockNote blocks and NewsletterDocument.
apps/dashboard/test/newsletter-doc.test.ts
```

Delete `components/newsletters/editor.tsx` and `rich-block.tsx`.

### 6.3 Schema and conversion

The server format stays `NewsletterDocument` version 1. The dashboard converts on load and on save. `render.ts` and the public site need no change except the three relaxations below.

BlockNote schema, built with `BlockNoteSchema.create({ blockSpecs, inlineContentSpecs, styleSpecs })`:

| NewsletterBlock | BlockNote block | Notes |
| --- | --- | --- |
| `paragraph` | default `paragraph` | |
| `heading2`, `heading3` | default `heading`, `level` 2 or 3 | If a heading arrives with level 1 (typed `# `), set it to 2 in `onChange`. Levels above 3 become 3. |
| `quote` | default `quote` | |
| `bulletList`, `orderedList` | consecutive `bulletListItem` or `numberedListItem` blocks | One list block per run of consecutive items. The list's id is the first item's id. On load, the first item keeps the list id and the others get new UUIDs. Nested children are flattened in document order. |
| `image` | default `image` | `props.url` holds `newsletter-asset:{assetId}`. `uploadFile` uploads through `uploadNewsletterAsset` and returns that string. `resolveFileUrl` turns it into `/api/newsletter-assets/{publicationId}/{assetId}?project={slug}`. `props.caption` maps to `caption`. `props.previewWidth` maps to the new `width`. An image block with no upload yet is left out of the saved document. |
| `divider` | default `divider` if the installed version has one, else a custom block with `content: "none"` that renders an `<hr>` | |
| `button` | custom block `button`, props `label` and `href`, `content: "none"` | Renders as the accent-coloured button from the mockup. Clicking it opens a Popover (kit `Popover`, `Field`, `Input`) with Label and Link. |

Inline content: default `text` and `link`, plus custom `personalization` with props `field` (`firstName` or `lastName`) and `fallback`. It renders as a small chip, "First name" or "Last name" (see `#editor-a`). Its `toExternalHTML` outputs the text `{{firstName|fallback}}` so markdown export keeps it.

Styles: default `bold` and `italic` only. Leave out underline, strike, code and colours, because the document format has no place for them.

Image description, "decorative" and image link are not props of BlockNote's image block. Keep them in React state in `body-editor.tsx` as `imageMeta: Record<blockId, { alt: string; decorative: boolean; href: string }>`, filled from the document on load and merged back on save. `image-meta.tsx` adds an "Alt text" button to the toolbar when an image block is selected; it opens a Popover with Description, a "Decorative image" checkbox, and Link. Fallback if this proves fragile: replace the default image block with a custom `image` block that has these props, and accept that drag-and-drop upload must then be wired by hand.

`lib/newsletter-doc.ts` exports:

```ts
toBlocks(doc: NewsletterDocument): { blocks: PartialBlock[]; imageMeta: ImageMeta }
fromBlocks(blocks: Block[], imageMeta: ImageMeta): NewsletterDocument
/** Turns literal {{firstName|x}} text inside parsed blocks into personalization nodes. Used after markdown import in S4. */
rehydrateTokens(blocks: PartialBlock[]): PartialBlock[]
plainText(blocks: Block[]): string   // for the word count
```

Rules for `fromBlocks`: drop trailing empty paragraphs; keep ids; a link's styled text becomes text nodes with `href`; hard breaks stay as `\n` inside text.

Tests in `newsletter-doc.test.ts`: a document with every block type survives `fromBlocks(toBlocks(doc))` unchanged; three consecutive list items become one list block; a nested list is flattened; a level 1 heading becomes `heading2`; an image without an upload is dropped; `rehydrateTokens` splits `Hi {{firstName|there}},` into three nodes.

Three relaxations of the shared schema in `packages/types/src/newsletters.ts`, so that an unfinished block never makes autosave fail:

1. Remove the `superRefine` rule that rejects an image with no description. `reviewPost` reports it as a `warning` check instead.
2. `button.href` accepts an empty string or any `NewsletterUrl` (http, https or mailto). `button.label` may be empty. `render.ts` skips a button whose label or link is empty.
3. `personalization.fallback` may be empty.

And one addition: `image.width?: number` (integer, 80 to 1200). In `render.ts` the image style becomes `display:block;width:100%;max-width:{width}px;height:auto;margin:0 auto;border:0` when `width` is set.

### 6.4 Layout and behaviour

The editor, review and report pages do not show the newsletter tabs. See the route tree in 8.1.

The editor is full width inside the shell. In `components/shell/app-shell.tsx` give the inner content `<div>` the class `fs-shell-content`. In `globals.css` add `main:has([data-fullbleed]) > .fs-shell-content { max-width: none; padding: 0; }`. `post-editor.tsx` renders a root with `data-fullbleed`.

**Top bar**, sticky, 52px, bottom border. Left: a ghost `LinkButton` "Posts" with a left arrow, the newsletter name in muted text, a `StatusBadge` (Draft, Scheduled, Published). Right: the save state, a `DropdownMenu` on `MoreButton` (Duplicate, Archive, Unpublish from the website, Cancel schedule, Delete draft; the last one is `tone="danger"` behind a `ConfirmDialog`), a button that shows or hides the details panel, "Preview", and the primary button "Review and send".

Save state, in an `aria-live="polite"` span: "Saving…", "Saved 10:42", "Unsaved changes", or "Could not save" with a "Retry" link. Keep the 900 ms debounce, the revision check and the `beforeunload` warning from the current code.

**Canvas**, a centred column, `max-w-[680px]`, top padding 56px:

- Title: a borderless `<textarea rows={1}>` with `field-sizing: content`, 32px, weight 650, letter-spacing -0.02em, placeholder "Post title", max 100. Enter moves focus to the subtitle.
- Subtitle: the same, 19px, muted, placeholder "Add a subtitle", max 200. Enter moves focus into the body.
- A meta line, 12px muted: newsletter name, "By {author}", reading time and word count (words ÷ 230, rounded up), then a bottom border.
- The BlockNote view. Body text 17px, line-height 1.7. If the publication's typeface is serif, set the canvas font to Georgia so the editor looks like the output.

**BlockNote styling** in `globals.css`, scoped to a wrapper class `fs-editor`. Do not import `@blocknote/core/fonts/inter.css`; the app already loads Inter.

```css
.fs-editor .bn-container[data-color-scheme] {
  --bn-colors-editor-text: var(--foreground);
  --bn-colors-editor-background: transparent;
  --bn-colors-menu-text: var(--foreground);
  --bn-colors-menu-background: var(--background-elevated);
  --bn-colors-tooltip-text: var(--primary-foreground);
  --bn-colors-tooltip-background: var(--primary);
  --bn-colors-hovered-text: var(--foreground);
  --bn-colors-hovered-background: var(--background-hover);
  --bn-colors-selected-text: var(--foreground);
  --bn-colors-selected-background: var(--background-hover);
  --bn-colors-disabled-text: var(--foreground-subtle);
  --bn-colors-disabled-background: var(--background-subtle);
  --bn-colors-border: var(--border);
  --bn-colors-side-menu: var(--foreground-subtle);
  --bn-font-family: var(--font-sans);
  --bn-border-radius: 8px;
}
```

Pass `theme="light"` or `theme="dark"` to `BlockNoteView` from a small hook that watches the `dark` class on `<html>` with a `MutationObserver`. After the editor works, open three other dashboard pages and confirm that BlockNote's stylesheet changed nothing on them.

**Slash menu** (`slash-items.tsx`), with `slashMenu={false}` and a `SuggestionMenuController`. Groups and items, in this order: AI (S4; hidden when `capabilities.ai` is false): "Continue writing", "Ask AI to write…". Text: Paragraph, Heading, Subheading, Bulleted list, Numbered list, Quote. Insert: Image, Button, Divider, "Subscriber's first name", "Subscriber's last name". Take the default items from `getDefaultReactSlashMenuItems(editor)`, keep only those for blocks in the schema, and relabel heading level 2 as "Heading" and level 3 as "Subheading".

A second `SuggestionMenuController` with `triggerCharacter="@"` offers "First name" and "Last name" and inserts the personalization chip with fallback "there" for first name and an empty fallback for last name. Clicking a chip opens a Popover to edit the fallback.

**Selection toolbar** (`toolbar.tsx`), with `formattingToolbar={false}` and a `FormattingToolbarController`. Buttons in order: "Ask AI" (S4), `BlockTypeSelect`, bold, italic, `CreateLinkButton`. For an image block: caption, replace, and the "Alt text" button.

**Details panel**, 312px, on the right, `bg-background-subtle`, left border, sticky. Open or closed is remembered in `localStorage` under `fs-nl-details`. Below the `xl` breakpoint it is a kit `Sheet` opened by the same button.

- Email: Subject (`Input`, max 200, counter "24 / 60" where 60 is a hint, not a limit; when the subject equals the title and was never edited, show the title as the value and keep `subjectOverridden` false), Preview text (`Textarea`, 2 rows, max 200, counter with hint 110), then "In the inbox": a small mock row with the sender name, the subject in bold and the preview text in muted text, each truncated to one line.
- Website: Address (`Input` with the public URL prefix as `prefix`, read-only after first publication), Author.

**Read-only and error states.** When the website version is scheduled, the server rejects edits. Show a kit `Notice tone="info"` above the title: "This post is scheduled for {date}. Cancel the schedule to edit it." with a "Cancel schedule" button, and set `editable={false}`. On `revision_conflict`, show `Notice tone="danger"`: "Someone else saved this post. Your text is still here." with "Reload saved version" and "Download my draft". Pause autosave until the user picks one.

**Preview** (`preview-sheet.tsx`): a kit `Sheet` on the right, width `min(960px, 100vw)`. Header: `Segmented` Email, Website, Plain text; a second `Segmented` with monitor and phone icons (`aria-label` "Desktop width" and "Phone width", 600px and 375px); a kit `Select` "Preview as" with the sample reader and up to 100 subscribers; a "Send a test" button (S2) that opens a Popover with an address field and remembers the last addresses in `localStorage`. Body: the subject line, then the sandboxed iframe that exists today.

Set `experimental.serverActions.bodySizeLimit` to `"8mb"` in `next.config.ts` (see section 2).

### 6.5 Checks for S3

- `pnpm --filter @flaresend/dashboard test` passes with the new `newsletter-doc.test.ts`.
- `pnpm --filter @flaresend/dashboard build` passes. The editor chunk is not part of the server bundle.
- By hand in the browser, light and dark: type a title, press Enter twice, write a paragraph, add a heading with `## `, a list with `- `, a quote, a divider, a button, an image by drag and drop (a 3 MB file), a first-name chip with `@`. Reload the page: everything is still there. Open Preview: email, website and plain text all show it.
- An existing post saved by the old editor opens and saves without changes to its content.
- At 375px wide the editor has no horizontal scroll and the details panel opens as a sheet.

## 7. S4: Workers AI

Mockups: `#editor-b` (composer), `#editor-c` (draft arriving, Keep or Discard), `#editor-a` (Ask AI menu, subject suggestions), `#editor-d` (slash menu), `#pub-settings` (voice notes).

### 7.1 Mailer

Add to `apps/mailer/wrangler.jsonc` and `wrangler.dev.jsonc`:

```jsonc
"ai": { "binding": "AI" }
```

and three vars with defaults: `NEWSLETTER_AI_MODEL` = `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `NEWSLETTER_AI_VISION_MODEL` = `@cf/meta/llama-3.2-11b-vision-instruct`, `NEWSLETTER_AI_HOURLY_LIMIT` = `120`. Run `pnpm --filter @flaresend/mailer types`. Workers AI always runs on Cloudflare, also under `wrangler dev`, and is billed to the account.

Both model names were on the Workers AI catalogue page on 1 October 2026. The text model is also on the JSON mode list. Check `https://developers.cloudflare.com/workers-ai/models/` before you rely on them; if one is deprecated, pick the closest current text or vision model and note it in your report.

Types in `packages/types/src/newsletters.ts`:

```ts
export const NewsletterAiTone = z.enum(["friendly", "professional", "casual", "confident", "playful"]);
export const NewsletterAiInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft"), brief: z.string().trim().min(1).max(6000),
             tone: NewsletterAiTone.default("friendly"), length: z.enum(["short", "medium", "long"]).default("medium") }).strict(),
  z.object({ action: z.literal("continue"), title: z.string().max(100).default(""), before: z.string().max(12000),
             instruction: z.string().max(1000).optional() }).strict(),
  z.object({ action: z.literal("rewrite"), text: z.string().min(1).max(8000),
             instruction: z.enum(["improve", "fix", "shorter", "longer", "tone", "translate", "custom"]),
             tone: NewsletterAiTone.optional(), language: z.string().max(40).optional(), custom: z.string().max(500).optional() }).strict(),
  z.object({ action: z.literal("subjects"), title: z.string().max(100), content: z.string().max(12000) }).strict(),
  z.object({ action: z.literal("alt-text"), assetId: z.string().min(1).max(100) }).strict(),
]);
export type NewsletterAiInput = z.input<typeof NewsletterAiInput>;
export interface NewsletterAiResult {
  text?: string;                                              // draft, continue, rewrite: markdown
  subjects?: Array<{ subject: string; previewText: string }>;  // subjects: five items
  altText?: string;                                            // alt-text
}
```

Two entry points:

- `newsletterAi(slug, id, input): Promise<NewsletterAiResult>` in `NewsletterApi`. HTTP: `POST /publications/:id/ai`. Works for all five actions and returns the whole result. The client SDK gets it for free.
- `newsletterAiStream(slug, id, input): Promise<ReadableStream<Uint8Array>>` in `AdminRpcApi` only (`packages/types/src/admin-rpc.ts`), not in `NewsletterApi`. HTTP: `POST /publications/:id/ai/stream`, response `text/plain; charset=utf-8`. Only for `draft`, `continue` and `rewrite`. The stream is plain UTF-8 text, not server-sent events.

`apps/mailer/src/core/newsletters/ai.ts`:

- `export const aiProvider = { run: (env, model, input) => env.AI.run(model, input) }`, the same pattern as `emailProvider`, so tests can spy on it and never call Workers AI.
- If `env.AI` is missing: `409 ai_unavailable`, "Add the Workers AI binding to the mailer to use AI."
- Rate limit: move `rate()` from `subscriptions.ts` to `shared.ts`, export it, and call `rate(env, "ai:" + project.id, hourWindow, limit)`. Over the limit: `429 ai_rate_limited`.
- Messages: one system message and one user message.
- For streaming, call with `stream: true` and transform the model's event stream into plain text. Workers AI models return either `data: {"response":"…"}` or the OpenAI shape `data: {"choices":[{"delta":{"content":"…"}}]}`, ending with `data: [DONE]`. Handle both.
- `subjects`: call with `response_format: { type: "json_schema", json_schema }` for `{ subjects: [{ subject, previewText }] }`, parse with zod, keep at most five. If the model answers "JSON Mode couldn't be met" or the JSON does not parse, retry once without JSON mode asking for one `subject | preview text` pair per line, and parse the lines.
- `alt-text`: read the asset bytes from R2, send them to the vision model, return one sentence of at most 125 characters with no "Image of" prefix.
- A model error becomes `502 ai_failed` with a short message.
- Limits: `max_tokens` 400 for short, 900 for medium, 1600 for long drafts; 800 for continue; twice the input length, capped at 1600, for rewrite.

System message, used for draft, continue and rewrite:

```text
You write for the email newsletter "{publication name}".
About this newsletter: {description, or "No description."}
Voice and style notes from the publisher: {ai_instructions, or "None."}

Rules:
- Write in the language of the user's text unless asked to translate.
- Output Markdown only. Allowed: paragraphs, "## " and "### " headings, "- " lists, "1. " lists, "> " quotes, **bold**, *italic*, [links](https://…), and "---" as a divider.
- Never output HTML, tables, code blocks, images, or a top-level "# " heading.
- Do not invent facts, numbers, names, quotes or links. If the notes lack a fact, write around it.
- You may greet the reader with {{firstName|there}} exactly in that form. Use it at most once.
- No preamble and no closing remark. Output only the requested text.
```

User message per action:

- `draft`: "Write a newsletter post from these notes. Tone: {tone}. Length: about {150, 400 or 800} words. Line 1: a title in plain text, at most 80 characters. Line 2: a one-sentence subtitle in plain text. Line 3: empty. Then the body.\n\nNotes:\n{brief}"
- `continue`: "Continue this post. Write the next part only, about 120 words{, following this instruction: …}. Do not repeat what is already written.\n\nTitle: {title}\n\n{before}"
- `rewrite`: "Rewrite the text below. {one of: Improve clarity and flow, keep the meaning and length. / Fix spelling and grammar only, change nothing else. / Make it about half as long. / Make it about twice as long, add no new facts. / Change the tone to {tone}. / Translate it to {language}. / {custom}} Keep the Markdown structure and any {{…}} tokens.\n\n{text}"

Treat the model's output as untrusted text. It only ever enters the editor through BlockNote's markdown parser and `fromBlocks`, and the server validates the saved document with the same zod schema as any other save.

Add `aiInstructions` (max 2000) to `UpdatePublicationInput` and `PublicationRecord`, stored in `publications.ai_instructions`.

### 7.2 Dashboard transport

- `apps/dashboard/src/app/api/newsletter-ai/route.ts`: `POST` with JSON `{ slug, publicationId, input }`. Reject when the `Origin` header is present and its host differs from the request host. Call `getMailer()` directly, not `mailerCall`, because `mailerCall` turns results into JSON. Return `new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })`. On an error, return JSON `{ error: { code, message } }` with the status from `toUiError`.
- `lib/mailer-http.ts`: implement `newsletterAiStream` with `fetch` and return `res.body`.
- Add `newsletterAi` to the allow-list in `newsletter-actions.ts`.
- First thing to verify in this stage: a `ReadableStream` returned by `AdminRpc` over the service binding reaches the browser in pieces, both in `next dev` and in `opennextjs-cloudflare preview`. Fallback if it does not: use the non-streaming `newsletterAi` for every action and show the "Writing…" bar until the full text arrives. The rest of the design does not change.

### 7.3 Editor behaviour

Files: `editor/ai/use-ai-stream.ts`, `ai-composer.tsx`, `ai-menu.tsx`, `ai-review-bar.tsx`, `subject-suggestions.tsx`.

One rule for all AI writing: **AI text is a suggestion until the user keeps it.** It appears in the document with an orange tint. Autosave is paused while a suggestion is pending. A bar at the bottom of the canvas offers Stop (while writing), Keep, Try again and Discard. Enter keeps it; Escape discards it.

New tokens in `globals.css`, light then dark: `--ai-fg: #c2410c` / `#fb923c`, `--ai-bg: rgb(249 115 22 / .09)` / `rgb(251 146 60 / .12)`, `--ai-border: rgb(249 115 22 / .32)` / `rgb(251 146 60 / .38)`, exposed as `--color-ai-fg`, `--color-ai-bg`, `--color-ai-border`. AI marks use the brand orange. Do not introduce purple or a gradient for AI. The sparkles icon is `Sparkles` from `lucide-react`.

To tint pending blocks without changing the document, keep the pending block ids in state and render a `<style>` element with one selector per id: `.fs-editor [data-id="{id}"] { background: var(--ai-bg); }`. Check the attribute BlockNote puts the block id on in the installed version.

- **Draft** (`#editor-b`, `#editor-c`). When the body is empty, show the composer above the first block: a `Textarea` ("What is this issue about? Paste notes, links, or bullet points and AI writes a first draft."), two kit `Select`s for Tone and Length, the muted text "Uses Workers AI", and the primary button "Draft post". Under it, four starter chips that fill the textarea with a short outline: Product update, Weekly roundup, Event announcement, Lessons learned. The composer disappears when the body has text. While the stream arrives: take lines 1 and 2 as title and subtitle (fill them only if they are empty), and every 150 ms parse the rest with `editor.tryParseMarkdownToBlocks`, run `rehydrateTokens`, and replace the pending blocks with `editor.replaceBlocks`.
- **Ask AI on a selection** (`#editor-a`). The toolbar's first button opens a menu: a text field "Tell AI what to change…", then Improve writing, Fix spelling and grammar, Make shorter, Make longer, Change tone (submenu with the five tones), Translate (submenu: English, Spanish, French, German, Portuguese, Afrikaans, and a text field for another language). The rewrite works on the whole blocks that the selection touches: convert them with `editor.blocksToMarkdownLossy`, send as `text`, replace them with the result as pending blocks, and keep the originals in memory so Discard restores them. Disable the button when the selection includes an image, button or divider, with the tooltip "Select text only".
- **Continue writing** and **Ask AI to write…** (slash menu, `#editor-d`). `before` is the markdown of every block up to the cursor, cut to the last 12000 characters. The result is inserted after the current block as pending blocks. "Ask AI to write…" first opens a small Popover at the block with a text field; its text is sent as `instruction`.
- **Subject lines** (`#editor-a`, right panel). The sparkles button next to Subject opens a Popover that calls `newsletterAi` with `action: "subjects"`, shows five subjects with their character counts, and a "More" button that runs it again. Choosing one sets the subject, sets `subjectOverridden` to true, and fills the preview text if it is empty.
- **Image description.** The "Alt text" Popover gets a button "Describe with AI" that calls `alt-text` and fills the field.
- **Voice notes.** Settings gets a card "AI writing help" (`#pub-settings`): a status badge (Connected, or Not set up with the sentence "Add the Workers AI binding to the mailer to use AI."), and a `Textarea` "Voice and style notes" saved as `aiInstructions`.

When `capabilities.ai` is false, render none of the AI controls in the editor. Errors from AI calls show as `toastError` with the server message; the document is left as it was.

### 7.4 Checks for S4

- Mailer tests with `vi.spyOn(aiProvider, "run")`: `draft` builds the system message with the publication name and voice notes; `subjects` returns five items and falls back when JSON mode fails; the hourly limit returns `429`; a missing binding returns `409 ai_unavailable`; the stream transform turns both event shapes into plain text.
- By hand, with a real binding: draft a post from three bullet points, watch it arrive, press Discard and see an empty post, draft again and press Keep, reload and see it saved. Select a paragraph, choose Make shorter, then Discard: the original is back. Ask for subject lines and apply one.
- With the `ai` binding removed from the dev config, the editor shows no AI controls and nothing else changes.

## 8. S5: the other screens

### 8.1 Routes

```
app/[slug]/newsletters/
  page.tsx                                   list
  new/page.tsx                               new newsletter
  [publicationId]/
    (tabs)/layout.tsx                        header and tabs
    (tabs)/page.tsx                          Overview
    (tabs)/posts/page.tsx                    Posts
    (tabs)/subscribers/page.tsx              Subscribers
    (tabs)/subscribers/[subscriptionId]/page.tsx
    (tabs)/analytics/page.tsx                Analytics (was reports)
    (tabs)/website/page.tsx                  Website
    (tabs)/settings/page.tsx                 Settings
    reports/page.tsx                         redirect to analytics
    posts/[postId]/page.tsx                  editor, no tabs
    posts/[postId]/review/page.tsx           Review and send, no tabs
    posts/[postId]/report/page.tsx           post report, no tabs
```

Delete the current `[publicationId]/layout.tsx` and `publication-nav.tsx`. The `(tabs)` layout renders the kit `PageHeader` (back link "Newsletters", the name as title, the description, actions "View site" and the primary "New post") and kit `LinkTabs`. No extra wrapper padding. Build links with `p(slug, "newsletters", …)` from `lib/nav.ts`.

### 8.2 Rules for every screen

- Use the kit: `PageHeader`, `LinkTabs`, `SegmentedLinks`, `Table` with `TR href`, `StatusBadge`, `Badge`, `Card`, `Stat`, `EmptyState`, `Field`, `Input`, `Textarea`, `Select`, `SwitchField`, `Checkbox`, `Sheet`, `Popover`, `DropdownMenu`, `ConfirmDialog`, `Notice`, `Time`, `Pagination`, `PageError`, the skeletons, and `toastResult`. No raw `<table>`, `<select>`, `<details>` or `<input type="checkbox">`.
- Errors from loading a page use `PageError`, not a bare `<p role="alert">`.
- Every action shows a pending state on its button and a toast or inline result.
- Add to `lib/labels.ts` and to the table in `test/redesign.test.ts`: `published` (Published, success), `unpublished` (Unpublished, muted), `archived` (Archived, muted), `skipped` (Skipped, muted). For a subscriber with status `pending`, pass `label="Waiting to confirm"` to `StatusBadge`.
- Dates use `Time` or `formatAbsolute`. Numbers use `num()`.
- Copy is plain: say what the thing does. No sentence may claim an email was sent before the run exists.
- Each page must work at 375px without horizontal page scroll. Wide tables scroll inside the `Table` wrapper.

### 8.3 Newsletter list (`page.tsx`)

`PageHeader` "Newsletters" with "New newsletter". `Table`: Name with description, Status, Subscribers, Posts, Updated. `EmptyState` with the `Newspaper` icon: "Create your first newsletter" and "Write posts, collect subscribers, and send by email or publish on the web." No banner.

### 8.4 New newsletter (`mockups.html#setup`)

One page, two columns from `lg` up: the form on the left, a sticky live preview on the right. Replace the two-step flow.

- Fields: Name; Description (optional, `Textarea`, max 300); Web address (`Input` with the public URL as `prefix`, auto-filled from the name with `slugify`, with "Available" or "Already used" under it, checked against the slugs from `listPublications` that the page passes in); Timezone.
- `TimezoneSelect`: a new shared component in `components/newsletters/timezone-select.tsx`. A `Popover` holding a `cmdk` list of `Intl.supportedValuesOf("timeZone")`, searchable, showing the current UTC offset beside each name. `cmdk` is already a dependency; see `shell/command-palette.tsx` for its use. It replaces every free-text timezone input.
- Layout: three radio cards with small wireframe thumbnails: Letter, Digest, Announcement.
- Accent colour: five preset swatches (`#c2410c`, `#1d4ed8`, `#047857`, `#6d28d9`, `#171717`) and "Custom", which opens a Popover with a native colour input and a hex field.
- Typeface: `Segmented` Sans, Serif.
- Preview: a new shared component `components/newsletters/layout-preview.tsx` that draws a sample post in the chosen layout, colour and typeface, with a `Segmented` Email or Website. It follows the rules in `render.ts`. Settings and Website reuse it.
- Buttons: Cancel, and the primary "Create newsletter". After creation go to the Overview.

### 8.5 Overview (`#pub-overview`)

In order:

1. "Finish setting up", a `Card` with a progress bar and five rows: Name and look; Verify a sender address; Turn on the website and sign-up form; Get your first subscribers; Add a postal address. A finished row is muted with a green tick. An open row has a short reason and a button that goes to the right page. Hide the card when all five are done.
2. Three `Stat` tiles: Subscribers with "+N in the last 30 days" from `newsletterReports`; "Last email opened by" with the percentage of delivered, the counts, and the word "estimate" (show "—" and "No email sent yet" when there is no run); Posts published with the latest date.
3. "Continue writing": one row for the most recently edited draft with "Open draft". Hide when there is no draft.
4. "Recent posts": a `Table` of five posts with the same columns as the Posts page, and an "All posts" link.

### 8.6 Posts (`#pub-posts`)

`SegmentedLinks` on `?state=`: All, Drafts, Scheduled, Published, Archived. `Table` columns: Post (title, subtitle under it in muted text), Website (`StatusBadge`, with the scheduled date under it), Email, Updated, and a `MoreButton` menu (Open, Duplicate, Archive, Delete draft).

The Email cell: "Not sent" in muted text when `post.email` is null and the post is a draft; "Website only" when it is published and never emailed; a `StatusBadge` Scheduled or Sending with the recipient count; or "1,271 delivered · 51% opened · 15% clicked" when sent.

A row opens the report page when the post has an email run or is published, otherwise the editor. `EmptyState`: "Write your first post" with the "New post" button.

### 8.7 Review and send (`#review`)

A page without tabs. `PageHeader` with back link "Back to editing", title "Review and send", the post title as description. Two columns from `xl` up: controls on the left, a sticky preview on the right. The sections are separated by hairlines, not cards.

1. **Where it goes.** Two rows, each with a kit `Switch`:
   - "Publish on the website" with the public URL under it. If the website is off: the switch is disabled and the row shows "The website is off." with a link "Turn it on" to the Website tab. If the post is already public and the draft differs: label "Update the website version".
   - "Send by email" with "From {name} <{address}>" under it and a "Send a test" button on the right. If `capabilities.emailBlocker` is set: the switch is disabled and the row shows the reason and a link to fix it (Settings for sender reasons). If the post was emailed before: show "Emailed to 1,271 subscribers on Sep 24." and default the switch to off.
   - Directly under the email row: `EmailServiceNote` (section 4.3). This is its only place.
2. **Who gets the email.** Shown when the email switch is on. The eligible count on the right in bold. A `Select` "All subscribers" and a tag filter (`DropdownMenu` with check items). Changing the filter calls `reviewNewsletterPost` again. Under it, in muted text: "Not included: 12 waiting to confirm, 31 unsubscribed, 4 suppressed."
3. **When.** `Segmented` Now or Schedule. Schedule shows a native `<input type="date">` and `<input type="time">` with the kit field classes, and a line: "{timezone} time, which is 07:00 UTC. Change timezone." where the link opens `TimezoneSelect`. Convert with `newsletterScheduleUtc` from `lib/newsletter-time.ts` and show its error under the fields.
4. **Checks.** One row per check from the server: a green circle-check for ok, an amber triangle for a warning, a red circle for an error. A failing row has a button that goes to `fix`.
5. **Footer.** A muted note on the left and one primary button on the right. Its label says exactly what will happen:

| Website | Email | When | Label |
| --- | --- | --- | --- |
| on | on | now | Publish and send to 1,284 subscribers |
| on | on | scheduled | Schedule for Oct 8, 09:00 |
| on | off | now | Publish on the website |
| on | off | scheduled | Schedule for Oct 8, 09:00 |
| off | on | now | Send to 1,284 subscribers |
| off | on | scheduled | Schedule email for Oct 8, 09:00 |
| off | off | — | disabled: "Choose where this post goes" |

Sending email now opens one `ConfirmDialog`: title "Send to 1,284 subscribers?", body "An email cannot be unsent.", confirm label "Send now". Scheduling and website-only publishing need no dialog.

On confirm, call `publishNewsletterWeb` first when the website switch is on, then `sendNewsletterEmail` when the email switch is on, each with its own idempotency key and the same `scheduledAt`. The two results are independent. If the second call fails after the first succeeded, stay on the page and show a `Notice tone="danger"`: "The website part is done. The email was not sent: {message}" with a "Try again" button that repeats only the email call. On full success go to the report page.

The preview column: `Segmented` Email, Website, Plain text; a width toggle; the subject line; the sandboxed iframe from `previewNewsletterPost`; "Previewing as Ada Lovelace" with a "Change" link.

"Send a test" opens a Popover with one field for 1 to 5 addresses separated by commas and a "Send test" button, and calls `sendNewsletterTest`.

### 8.8 Post report (`#report`)

A page without tabs. `PageHeader` with back link "Posts", the post title, a website `StatusBadge` and an email `StatusBadge`, and the actions "View on website" and "Edit post".

- While the run is `sending` or `scheduled`: a `Card` with "Sending to 1,284 subscribers", the time it started, "812 of 1,284", a progress bar, and "Stop sending" (or "Cancel schedule"), both behind a `ConfirmDialog` that says emails already handed over will still arrive. When `waiting` is `daily_limit`, show "Paused by this project's daily limit. It continues after 00:00 UTC." Poll `getNewsletterEmailRun` every 3 seconds while the tab is visible, the way `components/broadcasts/broadcast-live.tsx` polls, through a small route handler `app/api/newsletter-run/[slug]/[publicationId]/[runId]/route.ts`.
- Five `Stat` tiles: Delivered (with "98.3% of 812 sent"), Opened (with the rate and the word "estimate"), Clicked, Bounced or failed, Unsubscribed. Use delivered as the base for open and click rates. Show "—" when the base is 0.
- Recipients: a search `Input`, a status `Select`, and a `Table` with Subscriber, Status, Opened. Rows link to the email in the Emails section when `emailId` is set.
- Links clicked: a `Table` with Link and Clicks, and the note "Opens are an estimate. Mail apps that block or pre-load images change the count."
- A post that is published and was never emailed shows the header, a short line "This post is on the website only.", and a button "Send by email" that goes to Review and send.

### 8.9 Subscribers (`#pub-subs`, add `?import=1` to the mockup URL to see the import sheet)

- Toolbar: a search `Input`, `Select`s for Status, Tag and Source that submit as query parameters, "Export", and the primary "Import". A `MoreButton` menu holds "Manage tags", which opens a `Dialog` with the tag list, an add field, and remove buttons.
- A count line: "1,284 subscribed · 12 waiting to confirm · 31 unsubscribed".
- `Table`: Subscriber (email, name under it), Status, Tags (as `Badge`s), Source, Joined. Rows open the subscriber page. `Pagination` under it.
- `EmptyState`: "No subscribers yet" with the buttons "Import" and "Copy sign-up link" (the second only when the form is on).
- Import is a `Sheet` with three steps and a thin step bar: (1) Upload: a drop zone for a CSV, and under it "or import an existing audience" with a `Select`. (2) Match columns: the file name and row count, one `Select` per field, the counts as `StatusBadge`s (new, already here, invalid, opted out and kept out), and a five-row sample `Table`. (3) Permission: "Where did these people sign up?" (`Input`), the date (native date input), and a `Checkbox` "These people agreed to receive this newsletter." Then "Import 812 subscribers". After that the sheet shows progress, the result counts, and "Download rows with errors" when there are any. The server calls are the ones the current `SubscriberImport` makes.
- Subscriber page: keep the route. `PageHeader` with the email and a `StatusBadge`. A `Card` with name fields and tag `Checkbox`es. A `Card` "Permission record" using `DetailList`. A `Card` "Activity" as a timeline in the style of `components/emails/event-timeline.tsx`. A danger `Card` with "Unsubscribe" and "Delete subscriber", each behind a `ConfirmDialog`.

### 8.10 Analytics (`#pub-analytics`)

`SegmentedLinks` for 7, 30 and 90 days, and a muted line naming the timezone. A `Card` "Subscribers" with a Recharts area chart of the running total, built from `days` (follow `components/metrics/metrics-view.tsx` for chart styling and use `--series-1`). Then two tables side by side: "Emails sent" (Post, Delivered, Opened, Clicked) from `listNewsletterEmailRuns`, and "Where subscribers came from" from `sources`. Empty states inside each card. Remove the "Email reports are unavailable" section.

### 8.11 Website (`#pub-website`)

Two columns. Left: a `Card` with two `SwitchField`s, "Public website" and "Sign-up form" (disabled with "Verify a sender first" and a link when `subscriptionConfirmation` is false); the address in a read-only `Input` with copy and open buttons; "Embed the form on your own site" as a code block from `components/ui/code.tsx` with a copy button. Right: `LayoutPreview` in website mode. Switches save at once with a toast.

### 8.12 Settings (`#pub-settings`)

Stacked `Card`s, max width 720px, each with its own Save button in a `CardFooter`. One client component holds the publication and its `revision`, and updates both after each save.

1. Identity: Name, Description, Timezone (`TimezoneSelect`), Logo (preview, Replace, Remove).
2. Look: the layout cards, accent swatches and typeface control from 8.4, with `LayoutPreview` beside them.
3. Sender: a `StatusBadge` Verified or Not verified in the card header; From name, From address, Reply-to (optional), Postal address. When not verified, a `Notice tone="warning"` with a link to the project's Domains page.
4. AI writing help: see 7.3.
5. A danger `Card`: "Archive this newsletter" with a `ConfirmDialog`.

### 8.13 Checks for S5

- `pnpm --filter @flaresend/dashboard test` passes, including the new rows in `redesign.test.ts`.
- By hand, on a local mailer with a verified sender and three subscribers you control: create a newsletter, write a post, send a test, publish and send now, watch the report page reach "Sent", click a link in the received email and see it under "Links clicked". Then schedule a second post two minutes ahead and watch the cron send it.
- Open each screen at 375px, 768px and 1440px, in light and dark, and compare it with its mockup.
- `grep -rn "unavailable\|not available yet" apps/dashboard/src/components/newsletters "apps/dashboard/src/app/[slug]/newsletters"` returns nothing about email.
- `NewsletterPolicyNotice` no longer exists, and `EmailServiceNote` is imported by exactly one file.

## 9. S6: documents and final checks

- Rewrite `docs/newsletters/README.md` and `operations.md` to describe what is built: sending, the AI binding and its three vars, the new routes. Remove the "Delivery boundary" section.
- In `design.md` and `implementation.md`, keep the note at the top that points here, and delete or correct section 2 of `design.md` and sections 4 and 9 of `implementation.md`.
- Update the root `README.md` and `scripts/setup.md` where they describe newsletters, and add the `ai` binding to the setup steps.
- `apps/mailer/.dev.vars.example`: no new secrets. The AI vars are plain vars in `wrangler.jsonc`.

Run and report the output of:

```bash
pnpm --filter @flaresend/types build
pnpm typecheck
pnpm test
pnpm --filter @flaresend/dashboard build
```

## 10. Not in this work

- Broadcasts: its 500-recipient cap, the `broadcasts_enabled` switch and its warning notice stay as they are. See the open question below.
- Paid subscriptions, referral programmes, A/B tests, custom domains for the public site, team roles.
- Bulk actions on subscribers and search on the Posts page.
- More text styles (underline, strike, colours), tables, nested lists and columns in the post body. They need a version 2 of the document format and renderer.
- An AI check of the post before sending, and AI images.
- Streaming for subject suggestions.

## 11. Decisions after the plan

1. **Broadcasts follow the same rule** (user, 1 October 2026). The `broadcastsEnabled` switch no longer blocks anything (the field stays in the API so old callers still validate), `BROADCAST_MAX_RECIPIENTS` defaults to `0`, meaning no cap, and the warning banners are replaced by the same one-line note next to the composer's send buttons.
2. **The note** sits on Review and send, under the email switch, and in the broadcast composer. `EmailServiceNote` is imported by those two files only.

## 12. Where the build differs from this plan

- Headings: BlockNote's `createHeadingBlockSpec({ levels: [2, 3] })` restricts levels directly, so no level-1 correction runs on change.
- The Ask AI menu and the Alt text panel open from the selection toolbar but render outside it. The toolbar hides when focus leaves the editor, which would close a menu that lived inside it.
- The email send checks the reviewed content (`revisionId`) but not `expectedRevision`. Publishing on the website first raises the post's revision; requiring both would make "publish and send" fail its own second step.
- An AI model failure returns `500 ai_failed` (`internal_error`). The codebase has no 502 error type.
- New newsletter derives the public address prefix from an existing newsletter's URL, because the mailer info call does not return `PUBLIC_BASE_URL`. With no newsletter yet it shows `…/n/{project}/`.
