# @flaresend/dashboard

The Flaresend admin dashboard. Next.js 15 App Router, deployed as the Cloudflare Worker
`flaresend-dashboard` with `@opennextjs/cloudflare`, protected by Cloudflare Access.

It never holds an API key. Every read and write goes to the mailer's `AdminRpc` entrypoint over the `MAILER_ADMIN`
service binding (`src/lib/mailer.ts`). All mailer calls run on the server (server components, server actions, and two
route handlers: `/api/events`, polled by the Logs page, and `/api/broadcast/{slug}/{id}`, polled while a broadcast sends).

## Pages

Everything except `/projects` belongs to one project, picked with the switcher at the top of the sidebar. The layout
and wording follow Resend, so things are where a Resend user looks for them.

| Path | What it does |
| --- | --- |
| `/` | Redirects to the last project you visited (cookie `fs_project`), else the first project, else `/projects/new` |
| `/{slug}/emails` | Search box (recipient, subject, tag or email ID), status and date filters, cursor paging, "Send test email". With no emails yet: the three-step "Send your first email" guide |
| `/{slug}/emails/{id}` | Preview / Plain text / HTML / Headers / Attachments, details, event timeline, recipients. Resend, and Reschedule/Cancel for scheduled emails |
| `/{slug}/broadcasts`, `/new`, `/{id}` | List; composer with live preview (drafts); detail page whose stat tiles update every 5 s while sending |
| `/{slug}/audiences`, `/{id}` | Audiences; members with bulk remove and a searchable "Add contacts" dialog |
| `/{slug}/contacts` | Search, add, CSV import dialog, edit in a side sheet |
| `/{slug}/templates`, `/new`, `/{name}` | Built-in and editable templates. Split editor with live preview, variables, version history, test send |
| `/{slug}/metrics` | Sent, delivered, bounced, complained, opened, clicked over 7/30/90 days, by day or hour |
| `/{slug}/logs` | Email events, newest first, live every 10 s. `?emailId=` shows the events of one email |
| `/{slug}/domains` | Domains and their Cloudflare verification status (Verify re-checks), default sender, allowed sender addresses |
| `/{slug}/api-keys` | Create (the key is shown once), rename, revoke |
| `/{slug}/webhooks`, `/{id}` | Endpoints, events, enable switch; detail page with settings, signing secret rotation, test event, deliveries |
| `/{slug}/suppressions` | The suppression list. It is shared by every project |
| `/{slug}/settings` | Name, daily limit, tracking, RPC access, broadcasts, and Pause sending. Each card saves on its own |
| `/projects`, `/projects/new` | All projects, and the create form |

Old URLs still work: `/emails`, `/analytics`, `/logs` and `/suppressions` redirect to `/` (`next.config.ts`),
`/projects/{slug}?tab=…` redirects to the matching page (`app/projects/[slug]/page.tsx`), and `/emails/{id}` looks up the
project of the email and redirects (`app/emails/[id]/page.tsx`).

Errors from the mailer are shown as `code: message` (decoded with `decodeRpcError` from `@flaresend/types`), inline and
in a toast. ⌘K / Ctrl+K opens the command palette; `/` focuses the search box of the page.

## Local development

You need the mailer running, or at least reachable. There are two ways.

### 1. `next dev` against the mailer's HTTP admin API (quickest)

Start the mailer (`pnpm --filter @flaresend/mailer dev`, which listens on `http://localhost:8787`), then create
`apps/dashboard/.dev.vars` (or `.env.development.local`):

```
MAILER_URL=http://localhost:8787
MAILER_ADMIN_KEY=<the mailer's ADMIN_API_KEY>
```

```
pnpm --filter @flaresend/dashboard dev
```

When both vars are set and `NODE_ENV` is not `production`, `getMailer()` uses an HTTP client for `/v1/admin/*` instead
of the binding (`src/lib/mailer-http.ts`). In production, the binding always wins when it exists.

Do not put these in `.env` or `.env.local`: `opennextjs-cloudflare build` bundles `.env`, `.env.local` and
`.env.production*` into the Worker, so the admin key would ship inside it. `.dev.vars*` and `.env.development*` are not
bundled into a production build.

With `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` empty and `NODE_ENV=development`, the Access check is skipped.

### 2. `opennextjs-cloudflare preview` with the real service binding

Run the mailer with `wrangler dev` in one terminal. In another:

```
pnpm --filter @flaresend/dashboard preview
```

Wrangler connects `MAILER_ADMIN` to the locally running `flaresend` Worker through its dev registry. This is a
production build, so the Access middleware is active: with `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` empty every request gets
a 500 "Access is not configured". To click around locally, use option 1.

### Windows note

`opennextjs-cloudflare build` fails on Windows with `EPERM: operation not permitted, symlink` unless the account may
create symlinks (Developer Mode on, or an elevated shell), because Next's standalone output copies pnpm's symlinks.
Build in WSL/CI, or turn on Developer Mode. `next dev` and `next build` are not affected.

## Tests and checks

```
pnpm --filter @flaresend/dashboard typecheck   # tsc --noEmit
pnpm --filter @flaresend/dashboard test        # vitest: CSV import, status labels, search box, routes, error decoding, HTTP fallback, Access mode, …
pnpm --filter @flaresend/dashboard build       # next build
```

After changing `wrangler.jsonc`, run `pnpm --filter @flaresend/dashboard cf-typegen` to regenerate
`worker-configuration.d.ts`.

## Deploy

`pnpm bootstrap` from the repo root does all of this (see `scripts/setup.md`). By hand:

1. Deploy the mailer first. The `MAILER_ADMIN` binding points at the Worker `flaresend`, entrypoint `AdminRpc`.
2. Deploy:

   ```
   pnpm --filter @flaresend/dashboard deploy    # opennextjs-cloudflare build && opennextjs-cloudflare deploy
   ```

3. Set up Cloudflare Access (next section). Until then every page answers 500.
4. Optional: a custom hostname. Add it under Workers & Pages -> flaresend-dashboard -> Settings -> Domains & Routes ->
   Add -> Custom domain. `wrangler.jsonc` has no `routes`, so later deploys leave it alone.

The dashboard uses no cache bindings (every page is dynamic), so there is nothing else to create.

## Cloudflare Access setup

The dashboard has no login of its own. Access is the login; the middleware is a second check.

The quickest way on `workers.dev`: Workers & Pages -> flaresend-dashboard -> Settings -> Domains & Routes -> workers.dev ->
enable Cloudflare Access, then copy the AUD tag it shows and go to step 5. Otherwise:

1. Zero Trust dashboard -> Access -> Applications -> Add an application -> **Self-hosted**.
2. Application domain: the dashboard's hostname. Session duration as you like.
3. Add a policy, for example Action **Allow**, Include **Emails** = your address, or an email domain. Login methods:
   one-time PIN or Google.
4. Save. Open the application's overview and copy the **Application Audience (AUD) Tag**.
5. Find your team domain under Settings -> Custom Pages (or Settings -> General): `<team>.cloudflareaccess.com`.
6. Set both as secrets from `apps/dashboard` (they take effect without a redeploy):

   ```
   npx wrangler secret put ACCESS_AUD
   npx wrangler secret put ACCESS_TEAM_DOMAIN    # <team>.cloudflareaccess.com
   ```

What `src/middleware.ts` does on every request:

- `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` set: requires the `Cf-Access-Jwt-Assertion` header (403 without it) and verifies
  it with `jose` against `https://<team>/cdn-cgi/access/certs`, issuer `https://<team>`, audience `ACCESS_AUD`
  (403 if invalid).
- Either var empty and `NODE_ENV=development` (`next dev`): no check.
- Either var empty in a production build: 500 with "Cloudflare Access is not configured for this dashboard".

The middleware reads the vars from `process.env`. That works on Workers because `@opennextjs/cloudflare` copies every
string var and secret from the Worker `env` into `process.env` on the first request, before any Next.js code runs
(`populateProcessEnv` in the adapter's `cli/templates/init.js`). Checked with `wrangler dev` on the built Worker:
no vars -> 500, vars set and no header -> 403, a bad token -> 403 "invalid Access token".

Static files under `/_next/static` are served straight from the assets binding and skip the middleware. They contain
no data.

## Broadcasts warning

Cloudflare Email Service is for transactional email. Its docs say marketing and bulk campaigns are not permitted.
Broadcasts exist for small, opted-in lists only: the mailer caps each broadcast at `BROADCAST_MAX_RECIPIENTS`
(default 500), and a project must have `broadcasts_enabled` turned on (Settings page) or sends return
`403 broadcasts_disabled`.
