<img src="https://docs.flaresend.dev/logo.png" alt="Flaresend" width="72">

# @flaresend/client

Client for the Flaresend mailer. It works two ways:

- **HTTP** (`@flaresend/client`): any runtime with `fetch` (Node 18+, Bun, Deno, browsers, Workers). Uses a project API key.
- **RPC** (`@flaresend/client/rpc`): Cloudflare Workers in the same account, over a service binding. No API key.

The only runtime dependency is `@flaresend/types`.

## Install

```sh
pnpm add @flaresend/client
```

## HTTP usage

```ts
import { Flaresend } from "@flaresend/client";

const mail = new Flaresend({
  apiKey: process.env.FLARESEND_API_KEY!, // fs_live_... or fs_test_...
  baseUrl: "https://mailer.yourdomain.com", // required: where your mailer Worker is deployed
  // fetch: customFetch,  // optional, defaults to globalThis.fetch
  // maxRetries: 2,       // optional, retries on 429, 5xx and network errors
});

const { id, status } = await mail.emails.send({
  from: "Acme <hello@acme.com>",
  to: "ada@example.com",
  subject: "Welcome",
  html,
  text,
});

const email = await mail.emails.get(id);
const page = await mail.emails.list({ status: "bounced", limit: 50 });
const next = await mail.emails.list({ cursor: page.nextCursor ?? undefined });
```

`baseUrl` has no default. Pass the URL of your own deployment.

### What is available

| Namespace | Methods |
|---|---|
| `emails` | `send`, `sendBatch`, `get`, `list`, `content`, `cancel`, `reschedule` |
| `events` | `list` |
| `domains` | `list` |
| `apiKeys` | `list` |
| `me()` | project and key info, useful as a connectivity check |
| `webhooks` | `list`, `create`, `get`, `update`, `remove`, `test`, `rotateSecret`, `deliveries` |
| `templates` | `list`, `get`, `create`, `update`, `remove`, `versions`, `restore`, `render` |
| `analytics` | `get({ range: "7d" \| "30d" \| "90d", interval: "day" \| "hour" })` |
| `contacts` | `list`, `create` (upserts by email), `get`, `update`, `remove`, `import` (up to 5000) |
| `audiences` | `list`, `create`, `get`, `update`, `remove`, `contacts`, `addContacts`, `removeContacts` |
| `broadcasts` | `list`, `create` (draft), `get`, `update`, `remove`, `send`, `cancel` |

Paginated endpoints (`emails.list`, `events.list`, `webhooks.deliveries`, `contacts.list`, `audiences.contacts`) return `{ data, nextCursor }`. The other `list` methods return a plain array.

### Batch

```ts
const { data } = await mail.emails.sendBatch([a, b, c]);             // results in input order
const preview = await mail.emails.sendBatch([a, b], { dryRun: true }); // validates, sends nothing
```

Each item in `data` is either `{ id, status }` or `{ error: { type, code, message, param? } }`.

### Attachments

The API takes attachment content as base64. `attachmentFromBytes` does the encoding without `Buffer`, so it works in Workers and browsers too.

```ts
import { attachmentFromBytes } from "@flaresend/client";

const pdf = new Uint8Array(await file.arrayBuffer());
await mail.emails.send({ to, subject: "Your invoice", text, attachments: [attachmentFromBytes("invoice.pdf", pdf, "application/pdf")] });
```

### Typed templates

Pass a map of template name to data type, and `data` is checked against the template name:

```ts
type Templates = {
  welcome: { name: string; appName: string; loginUrl: string };
  "magic-link": { loginUrl: string; expiresInMinutes?: number };
};

await mail.emails.send<Templates>({ to, template: "welcome", data: { name: "Ada", appName: "Acme", loginUrl } });
```

`TypedSend<Templates>` is the input type on its own, if you want to use it in your code. The client does not depend on `@flaresend/templates`; you bring the map.

### Retries

- GET requests retry on 429, 5xx and network errors, up to `maxRetries` times (default 2).
- `emails.send` and `emails.sendBatch` retry the same way. Each call gets a random idempotency key that is reused on its own retries, so a retry after a timeout never sends the email twice. You don't need to pass a key.
- To stop the same email going out twice across separate calls (a double click, a job that runs twice), pass your own key: `mail.emails.send(input, { idempotencyKey: `welcome-${user.id}` })`. A second call with the same key and the same content returns the first email with `idempotent: true`. The same key with different content fails with `idempotency_payload_mismatch`. Keys don't expire.
- Other POST, PATCH and DELETE requests are tried once.
- The wait between tries is exponential backoff with jitter (0.5 s, 1 s, 2 s, ..., capped at 8 s). If the response has `Retry-After`, that value is used instead. If `Retry-After` is over 60 seconds, the client does not wait and throws the error.
- `429 daily_limit_exceeded` is never retried.

## RPC usage (Cloudflare Workers)

In the calling Worker's `wrangler.jsonc`:

```jsonc
{
  "services": [
    { "binding": "MAILER", "service": "flaresend", "entrypoint": "MailerRpc" }
  ]
}
```

```ts
import { rpcClient, type MailerRpcBinding } from "@flaresend/client/rpc";

interface Env { MAILER: MailerRpcBinding }

export default {
  async fetch(req: Request, env: Env) {
    const mail = rpcClient(env.MAILER, { project: "acme" }); // the project slug
    const { id } = await mail.send(
      { from: "hello@acme.com", to: "ada@example.com", subject: "Welcome", html, text },
      { idempotencyKey: "welcome-123" }, // merged into input.idempotencyKey
    );
    const email = await mail.get(id); // EmailRecord | null
    return Response.json(email);
  },
};
```

The RPC client has `send`, `sendBatch`, `get`, `list` and `cancel`. The project must have RPC enabled. RPC calls do not retry.

## Webhook verification

Every webhook request has a `Flaresend-Signature` header:

```
Flaresend-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>
```

The key is the UTF-8 bytes of the whole secret string, including the `whsec_` prefix. After a secret rotation the header can carry more than one `v1`; any match is accepted.

```ts
import { verifyWebhookSignature } from "@flaresend/client/webhooks";

export default {
  async fetch(req: Request, env: Env) {
    const raw = await req.text(); // the raw body, not re-serialised JSON
    const ok = await verifyWebhookSignature(env.FLARESEND_WEBHOOK_SECRET, req.headers.get("Flaresend-Signature"), raw);
    if (!ok) return new Response("bad signature", { status: 401 });
    const event = JSON.parse(raw) as import("@flaresend/client").WebhookPayload;
    // ...
    return new Response("ok");
  },
};
```

`verifyWebhookSignature(secret, header, rawBody, toleranceSeconds = 300)` returns a `Promise<boolean>`. It is async because Web Crypto HMAC is async (the plan's sync signature is not possible with Web Crypto). It returns `false` for a missing or malformed header, a signature that does not match, or a timestamp more than `toleranceSeconds` away from now. It does not throw on bad input.

`signWebhookPayload(secret | secrets[], body, timestamp?)` builds the header. It is the reference implementation of the algorithm and is handy in tests.

## Error handling

Both transports throw `FlaresendError`:

```ts
import { FlaresendError } from "@flaresend/client";

try {
  await mail.emails.send(input);
} catch (e) {
  if (e instanceof FlaresendError) {
    e.type;    // "validation_error" | "authentication_error" | "permission_error" | "not_found" | "conflict" | "unprocessable" | "rate_limit_error" | "internal_error"
    e.code;    // e.g. "invalid_sender", "recipient_suppressed", "rate_limited"
    e.message;
    e.param;   // the field at fault, when there is one (e.g. "from")
    e.status;  // HTTP status
  }
  throw e;
}
```

Special cases over HTTP:

| What happened | `type` | `code` | `status` |
|---|---|---|---|
| Error response whose body is not the Flaresend error JSON | `internal_error` | `http_<status>` | the response status |
| No response after all retries (DNS, connection reset, ...) | `internal_error` | `network_error` | `0` |
| 2xx response that is not JSON | `internal_error` | `invalid_response` | the response status |

Over RPC, the mailer encodes the error into the thrown message and the client rebuilds the `FlaresendError` (with `status` taken from the error type). An error that cannot be decoded is rethrown unchanged.
