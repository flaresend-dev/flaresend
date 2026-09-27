# @flaresend/templates

React Email templates that the Flaresend mailer Worker renders when a send request has `template` + `data`.

```ts
import { renderTemplate, isTemplateName } from "@flaresend/templates";

const { subject, html, text } = await renderTemplate("welcome", {
  name: "Ada",
  appName: "Acme",
  loginUrl: "https://app.example.com/login",
});
```

`renderTemplate` parses `data` with the template's zod schema and throws the `ZodError` when it is invalid.

## Templates

| Name | Data |
|---|---|
| `welcome` | `name`, `appName`, `loginUrl` |
| `password-reset` | `name?`, `resetUrl`, `expiresInMinutes = 30` |
| `magic-link` | `loginUrl`, `expiresInMinutes = 15` |
| `notification` | `title`, `body`, `ctaText?`, `ctaUrl?` |
| `invoice` | `invoiceNumber`, `amount`, `dueDate`, `items[{ description, amount }]`, `payUrl?` |

## Add a template

1. Create `src/emails/<name>.tsx`. Export the component (named and default) and a `PreviewProps` object with example data, and set `Component.PreviewProps = PreviewProps` so the preview server can show it. Use `Layout` and `styles` from `src/emails/_components/layout.tsx` to match the other emails.
2. Add an entry to `templates` in `src/index.ts` with `defineTemplate({ description, schema, subject, component, example })`. The component's props must match the schema's parsed output.
3. Add the expected subject to `expectedSubjects` in `test/templates.test.ts`.
4. Run `pnpm test`, `pnpm typecheck` and `pnpm build`. The mailer bundles `dist/`, so rebuild before deploying it.

Files and folders in `src/emails/` that start with `_` are helpers; the preview server ignores them.

## Preview

```sh
pnpm preview            # React Email dev server on http://localhost:3000
pnpm preview --port 3899
```

It shows every file in `src/emails/` rendered with its `PreviewProps`.

## Using it in a Worker

- Components come from `react-email` (the `@react-email/components` packages are deprecated).
- `@react-email/render` has a `workerd` export condition, so wrangler picks its edge build, which uses `react-dom/server.edge`. No special setting is needed beyond `nodejs_compat`.
- Never call `render(..., { pretty: true })`. `@react-email/render` still imports prettier at the top of the file, which adds about 325 KiB (87 KiB gzipped) to the bundle even though it is never called. It works in workerd as is. To drop it, alias it to a stub in the Worker's `wrangler.jsonc`:

  ```jsonc
  "alias": {
    "prettier/standalone": "./src/stubs/prettier.ts",
    "prettier/plugins/html": "./src/stubs/prettier.ts"
  }
  ```

  ```ts
  // src/stubs/prettier.ts
  export function format(): never {
    throw new Error("prettier is not bundled; do not use render(..., { pretty: true })");
  }
  export default {};
  ```
