# @flaresend/cli

`flaresend` is the command line tool for the Flaresend mailer. It talks to the mailer's HTTP API: the admin routes (`/v1/admin/*`) for everything except `send`, and `POST /v1/emails` for `send`.

## Setup

```bash
pnpm --filter @flaresend/cli build
node packages/cli/dist/index.js --help     # or link it: the package's bin is "flaresend"
```

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `FLARESEND_BASE_URL` | every command | Required. The mailer URL, e.g. `https://mailer.example.com` or `http://localhost:8787`. |
| `FLARESEND_ADMIN_KEY` | every command except `send` | The mailer's `ADMIN_API_KEY` secret. |
| `FLARESEND_API_KEY` | `send` | A project key (`fs_live_...` or `fs_test_...`). |
| `FLARESEND_DEBUG` | errors | When set, stack traces are printed after error messages. |

Global flags (put them anywhere on the command line):

| Flag | Meaning |
|---|---|
| `--base-url <url>` | Overrides `FLARESEND_BASE_URL`. |
| `--admin-key <key>` | Overrides `FLARESEND_ADMIN_KEY`. |
| `--api-key <key>` | Overrides `FLARESEND_API_KEY`. |
| `--json` | Print the raw JSON response instead of tables. |

On an API error the CLI prints `Error: <code>: <message> [HTTP <status> <type>]` to stderr and exits with code 1. Network errors and bad input also exit with code 1.

## Commands

### Projects

```bash
flaresend projects list
flaresend projects create --slug acme --name Acme --domains acme.com,mail.acme.com \
  [--default-from "Acme <hello@acme.com>"] [--senders hello@acme.com,support@acme.com] \
  [--daily-limit 500] [--rpc | --no-rpc]
flaresend projects show <slug>
flaresend projects update <slug> [--name ..] [--domains ..] [--default-from ..] [--senders ..] [--daily-limit ..] [--rpc | --no-rpc]
flaresend projects disable <slug>
flaresend projects enable <slug>
```

- `--domains` and `--senders` are comma-separated.
- On `update`, pass `""` to `--default-from` or `--senders` to clear them (sends `null`).
- `disable` calls `DELETE /v1/admin/projects/:slug` (sets `disabledAt`). `enable` sends `PATCH { disabled: false }`.

### API keys

```bash
flaresend keys create --project <slug> --name <name> [--mode live|test] [--expires-at 2027-01-01T00:00:00Z]
flaresend keys list [--project <slug>]
flaresend keys revoke <id>
flaresend keys rename <id> <name>
```

`keys create` prints the full key once, in a box. It cannot be shown again. `--mode` defaults to `live`.

### Emails

```bash
flaresend emails list [--project <slug>] [--status delivered] [--to a@x.com] [--from b@y.com] [--q "subject text"] \
  [--tag key:value] [--since <iso>] [--until <iso>] [--limit 25] [--cursor <nextCursor>]
flaresend emails get <id>              # header info, recipients table, events timeline
flaresend emails content <id>          # headers, attachments, text body (or HTML if there is no text)
flaresend emails content <id> --html   # only the HTML body, good for piping to a file
flaresend emails content <id> --text   # only the text body
flaresend emails resend <id>           # send the stored payload again as a new email
```

When there are more results, `emails list` prints the command for the next page.

### Suppressions

```bash
flaresend suppressions list [--q text] [--limit 25] [--cursor <nextCursor>]
flaresend suppressions add <address> [--reason manual|hard_bounce|complaint]
flaresend suppressions remove <address>
```

This is Flaresend's local list only. Cloudflare keeps its own suppression list, which you edit in the Cloudflare dashboard.

### Stats

```bash
flaresend stats
```

Counts by status per project for today, the last 7 days and the last 30 days.

### Send

```bash
flaresend send --to a@x.com --subject "Hello" --text "Hi there"
flaresend send --from "Acme <hello@acme.com>" --to a@x.com,b@x.com --to c@x.com \
  --subject "Report" --html-file ./report.html --cc boss@x.com --reply-to support@acme.com \
  --tag kind=report --tag user=42 --idempotency-key report-2026-09-25
flaresend send --to a@x.com --template welcome --data '{"name":"Ada"}'
flaresend send --to a@x.com --subject "Later" --text "..." --scheduled-at 2026-10-01T09:00:00Z
```

- Uses `FLARESEND_API_KEY`, not the admin key.
- Body: at least one of `--text`, `--html`, `--html-file`, `--template`. `--html` and `--html-file` cannot be combined. `--data` needs `--template`.
- `--subject` is required unless `--template` is set.
- `--to`, `--cc`, `--bcc` can be repeated or comma-separated. Commas inside quotes or `<...>` are kept.
- `--tag key=value` can be repeated.
- `--idempotency-key` is sent as the `Idempotency-Key` header.
- `--project` is accepted but ignored: the API key already decides the project.

### Dev: fake delivery events

```bash
flaresend dev event <delivered|deferred|bounced|failed|rejected|complained> <emailId> \
  [--recipient a@x.com] [--bounce-type hard|soft] [--message-id <cloudflare message id>]
```

Cloudflare does not deliver email events to `wrangler dev`, so this command fakes them. It loads the email with `GET /v1/admin/emails/:id`, builds one Cloudflare event per recipient (or only `--recipient`) and posts each to `POST /v1/admin/dev/events`. The mailer only accepts that route when `ENVIRONMENT` is not `production`.

The email needs a `cloudflareMessageId`, which the send consumer sets after sending. Until then, pass `--message-id`.

From `packages/cli`, `pnpm dev:event delivered <emailId>` runs the same command (build first).

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```

The payload builder is `buildDevEvent` / `buildDevEventsForEmail` in `src/dev-event.ts`. The `send` and `projects create/update` argument mapping is in `src/bodies.ts`.
