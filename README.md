<div align="center">
  <br>
  <a href="https://flaresend.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/images/wordmark-dark.png">
      <source media="(prefers-color-scheme: light)" srcset=".github/images/wordmark-light.png">
      <img alt="Flaresend" src=".github/images/wordmark-light.png" width="360">
    </picture>
  </a>
  <br>
  <br>
  <h3>Open-source transactional email that runs in your own Cloudflare account.</h3>

  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-orange" alt="MIT license"></a>
  <a href="https://www.npmjs.com/package/@flaresend/client"><img src="https://img.shields.io/npm/v/@flaresend/client?label=%40flaresend%2Fclient&color=orange" alt="npm version"></a>
  <a href="https://docs.flaresend.dev"><img src="https://img.shields.io/badge/docs-docs.flaresend.dev-orange" alt="Documentation"></a>

  <p>
    <a href="https://flaresend.dev">Website</a> ·
    <a href="https://docs.flaresend.dev/docs">Docs</a> ·
    <a href="https://docs.flaresend.dev/docs/api-reference">API reference</a> ·
    <a href="https://docs.flaresend.dev/docs/self-hosting/deploy">Self-hosting</a>
  </p>
</div>

<br>

Flaresend is an email API you deploy to Cloudflare. Your apps send over REST from anywhere, or over RPC from other Workers, and Flaresend handles the rest: logging, retries, templates, bounces, suppressions and webhooks. It is built on Workers, D1, R2, Queues and Cloudflare Email Service, so there are no servers to run and no other company between your code and Cloudflare.

> [!IMPORTANT]
> **Transactional email only.** Cloudflare Email Service does not allow marketing or bulk campaigns. Broadcasts exist for small, opted-in lists: they are off per project by default and capped at 500 recipients unless you raise the limit.

## Quickstart

Deploy Flaresend to your Cloudflare account. From a clone of this repo:

```bash
pnpm install
npx wrangler login
pnpm bootstrap
```

It asks for your sending domain and a Cloudflare API token, sets everything up, and prints your first API key. [Deploy](https://docs.flaresend.dev/docs/self-hosting/deploy) has the details and the manual steps. Then, in your app:

```bash
npm install @flaresend/client
```

```ts
import { Flaresend } from "@flaresend/client";

const flaresend = new Flaresend({ apiKey: process.env.FLARESEND_API_KEY!, baseUrl: "https://mailer.acme.com" });

const { id } = await flaresend.emails.send({
  from: "Acme <hello@acme.com>",
  to: "ada@example.com",
  subject: "Welcome to Acme",
  html: "<p>Glad you're here.</p>",
});
```

From another Worker, skip the API key and call the mailer through a service binding:

```ts
import { rpcClient } from "@flaresend/client/rpc";

await rpcClient(env.MAILER, { project: "acme" }).send({ from: "hello@acme.com", to: user.email, subject: "Welcome", html });
```

Quickstarts for [Next.js, Hono, Bun, Python, Go, PHP, Ruby and cURL](https://docs.flaresend.dev/docs/send-with/nodejs) are in the docs.

## Why Flaresend?

- **Runs in your account.** The email log lives in your D1 database and email bodies in your R2 bucket. You own the data and set the limits.
- **An API you already know.** Modeled on Resend: `POST /v1/emails`, idempotency keys, batch and scheduled sends, typed errors and a typed SDK.
- **Reliable by default.** Requests return `202` as soon as the email is stored. A queue sends it and retries temporary failures with backoff.
- **Everything around the send.** React Email templates, signed webhooks, open and click tracking, automatic suppression of bounces and complaints, and `fs_test_` keys that never send.
- **A dashboard and a CLI.** See every email and its timeline, and manage projects, keys, domains and templates.
- **Open source, all of it.** MIT licensed. There is no hosted edition with extra features.

## What's in this repo

| | |
|---|---|
| [`apps/mailer`](apps/mailer) | The Worker: HTTP API, RPC entrypoints, queue consumers and cron |
| [`apps/dashboard`](apps/dashboard) | The admin dashboard, deployed to Workers behind Cloudflare Access |
| [`packages/client`](packages/client) | [`@flaresend/client`](https://www.npmjs.com/package/@flaresend/client): HTTP client, RPC client and webhook signature checks |
| [`packages/templates`](packages/templates) | React Email templates rendered inside the mailer |
| [`packages/cli`](packages/cli) | The `flaresend` command for the admin API |
| [`apps/docs`](apps/docs), [`apps/web`](apps/web) | [docs.flaresend.dev](https://docs.flaresend.dev) and [flaresend.dev](https://flaresend.dev) |

## Resources

- [Documentation](https://docs.flaresend.dev/docs): guides for sending, templates, webhooks and deliverability
- [API reference](https://docs.flaresend.dev/docs/api-reference): every endpoint with request and response examples
- [Self-hosting](https://docs.flaresend.dev/docs/self-hosting): deploy, configure and upgrade the mailer and dashboard
- [llms.txt](https://docs.flaresend.dev/llms.txt): the docs in a format for AI agents
- [Contributing](CONTRIBUTING.md): running the repo locally, how a send works inside the mailer, and how releases work

## License

[MIT](LICENSE)
