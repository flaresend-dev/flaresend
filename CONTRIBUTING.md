# Contributing to Flaresend

Maintainer notes: how the repo is laid out, how to run it, how a send works inside the mailer, how the client is released, and what is still unverified. For using Flaresend, see the [docs](https://docs.flaresend.dev). One-time Cloudflare setup is `pnpm bootstrap`; the manual steps are in [scripts/setup.md](scripts/setup.md).

## Repository layout

| Path | What it is |
|---|---|
| `apps/mailer` | The Worker: Hono HTTP API, `MailerRpc` and `AdminRpc` entrypoints, queue consumers, cron |
| `apps/dashboard` | Next.js 15 admin dashboard on Workers (OpenNext), behind Cloudflare Access |
| `apps/docs` | The documentation site, served by the `flaresend-docs` Worker |
| `apps/web` | The landing page, served by the `flaresend-web` Worker |
| `packages/types` | `@flaresend/types`: zod schemas and TS types shared by everything |
| `packages/client` | `@flaresend/client`: HTTP client, RPC client, webhook signature check |
| `packages/templates` | `@flaresend/templates`: React Email templates rendered inside the mailer |
| `packages/cli` | `@flaresend/cli`: the `flaresend` command for the admin API |
| `scripts/bootstrap.mjs` | `pnpm bootstrap`: one-command Cloudflare setup |
| `scripts/setup.md` | Cloudflare setup by hand |

```bash
pnpm install
pnpm build        # packages first (turbo)
pnpm typecheck
pnpm test
```

Node 22, pnpm 10.

## How a send works

1. `POST /v1/emails` (or `MailerRpc.send`) validates the input, checks the sender against the project's `allowed_domains` / `allowed_senders`, checks the local suppression list, headers and size, handles the idempotency key and the rate limits, writes the body to R2 (`payloads/{id}.json`), writes the `emails`, `email_recipients` and `email_events` rows in one D1 batch, and puts `{ emailId }` on `flaresend-send`. It returns `202 { id, status: "queued" }` without waiting for Cloudflare.
2. The send consumer loads the body, applies open/click tracking if enabled, calls `env.EMAIL.send()`, stores the returned `messageId` and sets `sent`. Retryable errors (`E_RATE_LIMIT_EXCEEDED`, `E_INTERNAL_SERVER_ERROR`, `E_DELIVERY_FAILED`, network) back off `min(2^n·15 s, 1 h)` + jitter, up to 8 retries, then the DLQ marks the email `failed`. Everything else fails at once (`E_RECIPIENT_SUPPRESSED` → `rejected` and a suppression row).
3. Cloudflare publishes one event per recipient to `flaresend-events`. The events consumer dedupes on `eventId`, matches on `messageId`, updates the recipient (never downgrading a final state), adds a timeline event, recomputes the email status (complained > bounced > rejected > failed > delivered-for-all > deferred) and mirrors hard bounces and complaints into `suppressions`. Events that arrive before the `messageId` is stored are retried, then parked in `orphan_events` and replayed after the send finishes.
4. Every timeline event fans out to matching webhooks through `flaresend-webhooks`, signed with `Flaresend-Signature: t=<unix>,v1=<hmac>`.

## Releasing the client to npm

`@flaresend/client` and `@flaresend/types` are published together, always at the same version, with no manual steps. Every push to `main` that changes `packages/types` or `packages/client` runs `.github/workflows/release-client.yml`, which uses `scripts/release-client.mjs` to pick the next version from the commit messages since the last `client-v*` tag:

| Commit | Release |
|---|---|
| `fix:`, `perf:` | patch (0.1.0 → 0.1.1) |
| `feat:` | minor (0.1.0 → 0.2.0) |
| `feat!:` or a `BREAKING CHANGE:` line in the body | major (minor while on 0.x) |
| `chore:`, `docs:`, `test:`, `refactor:`, anything else | no release |

Only commits that touch those two folders count. When there is something to release, the workflow builds, typechecks and tests both packages, commits the new version to `main` as `chore(release): @flaresend/client vX.Y.Z`, tags it `client-vX.Y.Z`, publishes to npm and creates a GitHub release. Pull after a release so your local `main` has the version commit.

Publishing uses npm trusted publishing (set up on npmjs.com for both packages: owner `flaresend-dev`, repository `flaresend`, workflow `release-client.yml`), so there is no npm token in GitHub. If a publish fails after the tag was pushed, re-run the workflow from the Actions tab: it publishes any version that is in `package.json` but not on npm yet.

To see what the next release would be: `node scripts/release-client.mjs --dry-run`.

## Assumptions to settle on the first real deploy

These need a real Cloudflare account and real sends, so they are **not verified yet**. Record the answers here.

- **A1** One `messageId` per `send()` call, and every per-recipient event carries it. Test: send one email to 2 addresses you control and check both `email_recipients` rows move to `delivered`. If each recipient gets its own id, move `cloudflare_message_id` to `email_recipients`. **Answer:** _not yet checked_
- **A2** `E_DELIVERY_FAILED` is transient. If it turns out to be terminal, move it out of `RETRYABLE` in `apps/mailer/src/queue/send-consumer.ts`. **Answer:** _not yet checked_
- **A3** Events are delivered at least once, possibly out of order. Already handled: dedupe on `eventId`, no downgrades (covered by tests).
- **A4** `wrangler email sending enable` adds DNS records on Cloudflare zones. Cloudflare's current docs say Email Service requires Cloudflare DNS, so domains with DNS elsewhere may not work at all. **Answer:** _not yet checked_

## Implementation notes

- **Rate limit binding** uses wrangler's first-class `ratelimits` key instead of `unsafe.bindings`; it is the same binding.
- **`webhook_deliveries`** (migration 0003) has no foreign key on `event_id` and stores the exact JSON body in a `payload` column, so `POST /v1/webhooks/:id/test` can deliver a synthetic event with no `email_events` row.
- **Queue messages carry `kind`** (`"send"` or `"webhook"`) so the shared DLQ can tell them apart.
- **`email.scheduled`** is an extra timeline event type for scheduled sends. Scheduled emails do not fire `email.queued` webhooks at creation.
- **Audience ids** use the prefix `aud_`.
- **`dailyLimit: 0`** means no daily limit.
- **List endpoints** (`GET /v1/emails`) return recipients but an empty `events` array per email; fetch one email for its timeline.
- **`sendBatch` over RPC** takes an optional third argument `{ idempotencyKey, dryRun }`.
- **`verifyWebhookSignature`** is async (see above).
- **Analytics** buckets by the email's creation time. `sent` counts emails handed to Cloudflare; the other metrics count emails currently in that status, so they match `GROUP BY status` for a day. Days are frozen once rolled up at 00:10 UTC.
- **Tests**: `vi.mock` does not reach modules the Workers test pool has already loaded, so the provider and queue producer expose small objects (`emailProvider`, `queueOps`) that tests replace with `vi.spyOn`. The test config uses compatibility date `2026-08-22` because the workerd bundled with `@cloudflare/vitest-pool-workers` 0.22 does not support `2026-09-01` yet; production uses `2026-09-01`.
- **Dashboard template preview**: `AdminRpc.renderTemplate` only renders the saved template, so the editor also renders unsaved drafts in the browser with a copy of the `{{var}}` renderer (`apps/dashboard/src/lib/mustache.ts`).
- **Dashboard build on Windows**: `opennextjs-cloudflare build` does not work on Windows, even with Developer Mode on: the copied pnpm symlinks point back into the repo's own `node_modules`, so the bundler picks up `sharp`'s native Windows binary (`No loader is configured for ".node" files`). Without Developer Mode it fails even earlier, with `EPERM: operation not permitted, symlink`. `next dev` and `next build` work. Deploy from CI (Linux) or WSL. The OpenNext bundle is about 6.4 MiB / 1.36 MiB gzip.
- **Bundle size**: `@react-email/render` imports prettier at load time; `wrangler.jsonc` aliases it to a stub (`src/stubs/prettier.ts`). The mailer bundle is about 1.28 MiB / 262 KiB gzip.

## Phase checklists

What is covered by automated tests (`apps/mailer/test`, 200+ tests running in workerd) versus what needs a real account.

Phase 1:
- [x] `POST /v1/emails` returns 202 without calling Cloudflare (the send happens in the queue consumer). 87 ms under local `wrangler dev`; production p50 not measured yet.
- [x] Same `Idempotency-Key` twice → one email, `idempotent: true` on the second call
- [x] Test key → status `test`, nothing sent
- [x] `from` outside `allowed_domains` → 403 `invalid_sender`
- [x] Suppressed recipient → 422
- [x] `E_SENDER_NOT_VERIFIED` → `failed`, no retry loop
- [x] Delivery, deferral, bounce, complaint events land on the timeline with SMTP details (using Cloudflare's documented example payloads)
- [x] `GET /v1/emails/:id` returns the timeline
- [x] RPC and HTTP produce the same D1 rows apart from `source` and `api_key_id`
- [ ] Real sends through Cloudflare, A1/A2/A4, migrating a real project off Resend (needs the account)

Phase 2:
- [x] Webhook delivery with a signature that `verifyWebhookSignature` accepts; failing endpoint retries on 30 s, 2 m, 10 m… and the DLQ marks it failed
- [x] `template: "welcome"` renders html + text and stores `template_name`; bad data → 400 with the field path
- [x] Searching by recipient finds emails where the address was in `cc`
- [ ] Dashboard deployed behind Access (needs the account; builds locally, see `apps/dashboard/README.md`)

Phase 3:
- [x] Analytics numbers match `GROUP BY status`
- [x] Scheduled sends: within 12 h go straight to the queue with a delay; later ones are picked up by the cron; cancel and reschedule work
- [x] D1 templates version on every edit, sends record `template_version`, restore works, D1 shadows Git
- [x] Open pixel and click redirect record events; the original HTML is untouched
- [x] A 20-recipient broadcast creates 20 tagged emails, skips unsubscribed and suppressed contacts, and one-click unsubscribe works
