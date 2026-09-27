# @flaresend/types

Zod schemas and TypeScript types for the Flaresend API. [`@flaresend/client`](https://www.npmjs.com/package/@flaresend/client) depends on this package, so you only need to install it yourself if you want to validate data with the schemas directly.

## Install

```sh
pnpm add @flaresend/types
```

## Usage

Every schema is exported as a Zod object, and most have a TypeScript type of the same name.

```ts
import { SendEmailInput } from "@flaresend/types";

const parsed = SendEmailInput.safeParse(body);
if (!parsed.success) {
  // parsed.error is a ZodError
}
```

## License

MIT
