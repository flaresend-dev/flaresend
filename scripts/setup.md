# One-time Cloudflare setup

## Quick setup

Run it on macOS, Linux or WSL. On plain Windows the mailer deploys but the dashboard does not build.

```bash
pnpm install
npx wrangler login
pnpm bootstrap
```

`pnpm bootstrap` (`scripts/bootstrap.mjs`) does steps 2 to 9 below. It asks for your sending domain, an optional hostname for the mailer, and a `CF_API_TOKEN` (it lists the permissions and checks the token before using it). It then creates the D1 database, R2 bucket and queues, deploys the mailer with its secrets, creates the first project and a live API key, onboards the domain, and deploys the dashboard. At the end it asks for the two Cloudflare Access values for the dashboard; you can skip that and run it again later.

It is safe to run again: anything that already exists is kept, and existing secrets are not replaced. Your answers and the admin key are saved in `.flaresend/bootstrap.json` (gitignored). You need the Workers Paid plan (Cloudflare Email Service needs it to send to any address) and the sending domain's DNS on Cloudflare in the same account.

The rest of this file is the same setup by hand.

## Manual setup

Run these from `apps/mailer` unless a step says otherwise. Replace the placeholders (`acme.com`, `<ZONE_ID>`, `mailer.example.com`, `dashboard.example.com`).

### 1. Log in

```bash
npx wrangler login
```

### 2. Create the resources

```bash
npx wrangler d1 create flaresend                    # the config finds it by name; no id to paste
npx wrangler r2 bucket create flaresend-payloads
npx wrangler r2 bucket lifecycle add flaresend-payloads expire-payloads-30-days payloads/ --expire-days 30
npx wrangler queues create flaresend-send
npx wrangler queues create flaresend-events
npx wrangler queues create flaresend-dlq
npx wrangler queues create flaresend-webhooks
```

Email bodies in R2 are deleted after 30 days by that lifecycle rule. After that, `GET /v1/emails/:id/content` returns `404 content_expired` and resend is no longer possible. The D1 metadata stays.

### 3. Onboard each sending domain

Repeat for every domain a project will send from. On zones that use Cloudflare DNS this adds the SPF and DKIM records for you.

```bash
npx wrangler email sending enable acme.com
npx wrangler email sending dns get acme.com       # confirm the records
npx wrangler email sending list
```

Also add a DMARC record for each sending domain (skip it if the onboarding flow already added one):

```
_dmarc.acme.com  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@acme.com"
```

### 4. Send delivery events to the events queue

One subscription per sending domain. `--zone-id` is the zone that contains the domain.

```bash
npx wrangler queues subscription create flaresend-events \
  --source email.sending \
  --events message.delivered,message.deferred,message.bounced,message.failed,message.rejected,message.complained \
  --zone-id <ZONE_ID> --domain acme.com \
  --name flaresend-acme-com
```

Without this step emails still send, but they stay at `sent` forever: no delivered, bounced or complained status, and no suppression mirror.

### 5. Secrets

```bash
npx wrangler secret put ADMIN_API_KEY               # generate with: openssl rand -base64 32
npx wrangler secret put TRACKING_SECRET             # open/click tracking and unsubscribe links; openssl rand -base64 32
npx wrangler secret put PUBLIC_BASE_URL             # the mailer's public URL, e.g. https://mailer.acme.com (step 6)
npx wrangler secret put CF_ACCOUNT_ID               # your account ID (npx wrangler whoami)
npx wrangler secret put CF_API_TOKEN                # optional: domain status and setup, mailer URL in the dashboard (see below)
```

`PUBLIC_BASE_URL` and `CF_ACCOUNT_ID` are secrets rather than `vars` so that `wrangler.jsonc` holds nothing specific to one account. `wrangler deploy` never removes secrets.

#### `CF_API_TOKEN`

A Cloudflare API token the mailer uses to check whether each sending domain is onboarded, and to look up its own URL for the dashboard. Sending does not use it (that goes through the `EMAIL` binding). Without it, every domain shows `unknown` on the Domains page and the dashboard cannot show the mailer's URL.

Create it in the Cloudflare dashboard under **My Profile → API Tokens → Create Token → Create Custom Token**:

| Permission | Why |
|---|---|
| Zone → Zone → Read | `GET /zones?name=...` finds the zone that holds the domain |
| Email Sending → Read | `GET /zones/{id}/email/sending/subdomains` reads the domain's sending status |
| Email Sending → Edit | **Set up in Cloudflare** adds the domain to Email Sending |
| DNS → Edit | **Set up in Cloudflare** adds the SPF, DKIM, return-path and DMARC records |
| Queues → Edit | **Set up in Cloudflare** subscribes the domain's delivery events to `flaresend-events` (step 4) |
| Account → Workers Scripts → Read | The dashboard shows the mailer's URL (its custom domains and `workers.dev` address) on the API Keys and Settings pages |

Zone Resources: **All zones from an account** → your account, so new domains work without editing the token.

Set it on the mailer Worker (`flaresend`), not the dashboard:

- Deployed: `npx wrangler secret put CF_API_TOKEN` from `apps/mailer`, or **Workers & Pages → flaresend → Settings → Variables and Secrets** as a Secret. Takes effect without a redeploy.
- Local: `CF_API_TOKEN=...` in `apps/mailer/.dev.vars`, then restart `pnpm dev`.

With the three Edit permissions, the dashboard does steps 3 and 4 for you: **Add domain** onboards the new domain, and **Set up in Cloudflare** (in a domain's menu) does it for a domain that is already on the project. It only adds missing records and never changes a DNS record that already exists; a clashing record is reported as a conflict for you to fix by hand. The DMARC record it adds is `v=DMARC1; p=none`, and only when neither the domain nor the zone apex has one. Without the Edit permissions, only the status check works. Email Sending Edit also allows sending mail from any onboarded domain on the account, so treat the token as a password.

### 6. Public URL

The mailer answers on `https://flaresend.<your-subdomain>.workers.dev`. To use your own hostname, add it under **Workers & Pages → flaresend → Settings → Domains & Routes → Add → Custom domain** (or deploy once with `npx wrangler deploy --domain mailer.acme.com`). `wrangler.jsonc` has no `routes`, so later deploys leave the custom domain alone.

Set the `PUBLIC_BASE_URL` secret (step 5) to whichever URL people should see in tracking and unsubscribe links.

### 7. Migrate and deploy

```bash
npx wrangler d1 migrations apply flaresend --remote
npx wrangler deploy
```

Check it:

```bash
curl https://mailer.example.com/health
```

### 8. Create the first project and key

```bash
curl -X POST https://mailer.example.com/v1/admin/projects \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"slug":"acme","name":"Acme","defaultFrom":"Acme <hello@acme.com>","allowedDomains":["acme.com"]}'

curl -X POST https://mailer.example.com/v1/admin/projects/acme/api-keys \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"coolify-prod","mode":"live"}'
```

The second call returns the full key once. Store it in the app's secrets; Flaresend only keeps its hash.

Or with the CLI (`packages/cli`):

```bash
export FLARESEND_BASE_URL=https://mailer.example.com FLARESEND_ADMIN_KEY=...
flaresend projects create --slug acme --name Acme --domains acme.com --default-from "Acme <hello@acme.com>"
flaresend keys create --project acme --name coolify-prod --mode live
```

### 9. Dashboard

From `apps/dashboard`, see its README. In short:

1. `pnpm run deploy` from `apps/dashboard`. The dashboard reaches the mailer through the `MAILER_ADMIN` service binding (entrypoint `AdminRpc`), so it holds no API key. Until step 3 is done every page answers 500.
2. Protect it with Cloudflare Access: **Workers & Pages → flaresend-dashboard → Settings → Domains & Routes → workers.dev → enable Cloudflare Access**, or add a self-hosted Access application for its hostname in Zero Trust.
3. Set the Access application's AUD tag and your team domain as secrets:

   ```bash
   npx wrangler secret put ACCESS_AUD
   npx wrangler secret put ACCESS_TEAM_DOMAIN          # <team>.cloudflareaccess.com
   ```

### 10. CI

`.github/workflows/ci.yml` runs build, typecheck and tests on every PR and, on `main`, applies D1 migrations and deploys both Workers. Add these repository secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit, D1 Edit, Queues Edit, R2 Edit, Account Settings Read) and `CLOUDFLARE_ACCOUNT_ID`.

## Local development

```bash
cd apps/mailer
cp .dev.vars.example .dev.vars          # ADMIN_API_KEY=dev-admin-key etc.
npx wrangler d1 migrations apply flaresend --local
```

Two ways to run it:

- `npx wrangler dev --var ENVIRONMENT:development` uses `wrangler.jsonc` with a local `send_email` binding. Nothing is delivered; emails reach `sent` with a fake message id. Good for API and dashboard work.
- `pnpm dev` uses `wrangler.dev.jsonc`, which sets `"remote": true` on `send_email`, so **real emails are sent**. Only send to addresses you control. Never commit `remote: true` in `wrangler.jsonc`. Binary attachments (`ArrayBuffer`) do not work with `remote: true`; deploy to test them.

Event subscriptions do not deliver to `wrangler dev`. Fake a Cloudflare event with:

```bash
pnpm dev:event delivered <emailId>          # from the repo root; also deferred|bounced|failed|rejected|complained
```

This calls `POST /v1/admin/dev/events`, which only exists when `ENVIRONMENT` is not `production`.
