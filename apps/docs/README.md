# @flaresend/docs

The Flaresend documentation site. [Fumadocs](https://fumadocs.dev) on Next.js 16, exported as static files and served from a Worker with static assets.

```bash
pnpm dev        # http://localhost:3217
pnpm build      # static site in out/
pnpm typecheck
pnpm run deploy # build, then wrangler deploy (Worker "flaresend-docs")
```

The site is served at `https://docs.flaresend.dev` (the custom domain in `wrangler.jsonc`). Set `NEXT_PUBLIC_SITE_URL` at build time to build for a different URL (it is used for Open Graph URLs).

## Where things are

| Path | What |
|---|---|
| `content/docs/(guides)` | The "Documentation" tab. The `(guides)` folder name is not part of the URL: `(guides)/emails/tags.mdx` is `/docs/emails/tags`. |
| `content/docs/api-reference` | The "API Reference" tab. One page per endpoint. |
| `content/docs/self-hosting` | The "Self-hosting" tab. |
| `meta.json` in each folder | Sidebar order, titles and icons (any [Lucide](https://lucide.dev/icons) name). |
| `src/components/api/*` | `Endpoint`, `ParamField`, `ResponseField`, `Expandable`, `ApiPage` and friends. |
| `src/components/mdx.tsx` | Every component available in MDX without an import. |

Search, `/llms.txt`, `/llms-full.txt`, per-page Markdown (`/llms.mdx/docs/<page>/content.md`) and Open Graph images are generated at build time.

## Writing rules

Plain English. Say exactly what happens, with the real names, numbers and error codes from the code. If the code doesn't do it, the docs don't say it.

**Example values**, used everywhere so pages read as one set:

| Thing | Value |
|---|---|
| Mailer URL | `https://mailer.example.com` |
| Project slug / name | `acme` / `Acme` |
| Sending domain | `acme.com` |
| Sender | `Acme <hello@acme.com>` |
| Recipient | `ada@example.com` (second one: `grace@example.com`) |
| API key env var | `FLARESEND_API_KEY` (`fs_live_…`) |
| Admin key env var | `FLARESEND_ADMIN_KEY` (the mailer's `ADMIN_API_KEY` secret) |
| Email ID | `email_01K6B2Y4ZP9R3M7T8V5N2QXW4C` |
| Other IDs | `evt_…`, `wh_…`, `whd_…`, `ct_…`, `aud_…`, `bc_…`, `tmpl_…`, `key_…`, `proj_…` + a 26-character ULID |
| Node client variable | `flaresend` (`new Flaresend({ apiKey, baseUrl })`) |
| RPC client variable | `mail` (`rpcClient(env.MAILER, { project: 'acme' })`) |

**Code tabs.** Request examples use fenced blocks with `tab="…" tab-group="lang"` so the reader's language choice sticks across pages. Use exactly these labels: `Node.js`, `cURL`, `Worker (RPC)` (only where the RPC client has the method: `send`, `sendBatch`, `get`, `list`, `cancel`), and for language quickstarts `Python`, `Go`, `PHP`, `Ruby`. Response examples use `tab-group="status"` with labels like `200`, `201`, `202`, `404`.

**API reference page shape** (copy `api-reference/emails/send.mdx`):

```mdx
---
title: Retrieve an email        # verb + noun, sentence case
description: One sentence.
method: GET                     # puts the badge in the sidebar and makes the page full width
---

<Endpoint method="GET" path="/v1/emails/:id" />   {/* auth="admin" for /v1/admin, auth="none" for public routes */}

<ApiPage>
<ApiMain>
Short intro.
## Path parameters / ## Query parameters / ## Headers / ## Body parameters
<Fields><ParamField path="id" type="string" required>…</ParamField></Fields>
## Response
<Fields><ResponseField name="id" type="string">…</ResponseField></Fields>
## Errors
| Status | Code | When |
</ApiMain>
<ApiAside>
<ApiExample title="Request"> …tabbed fences… </ApiExample>
<ApiExample title="Response"> …json fences… </ApiExample>
</ApiAside>
</ApiPage>
```

Leave a blank line between a JSX tag and Markdown or a code fence inside it, or MDX won't parse the Markdown.

**Guide pages** use `Callout` (`type="info" | "warn" | "error" | "success"`), `Steps`/`Step`, `Tabs`/`Tab`, `Cards`/`Card`, `Accordions`/`Accordion`, `TypeTable`, `StatusBadge` and the two diagrams `ArchitectureDiagram` and `LifecycleDiagram`. Link to other pages with absolute paths (`/docs/emails/idempotency`).
