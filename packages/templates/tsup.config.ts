import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Keep runtime deps external so the consumer's bundler (wrangler/esbuild) picks
  // the right entry for its platform, e.g. the `workerd` build of @react-email/render.
  external: ["react", "react-dom", "react-email", "@react-email/render", "zod"],
  outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
});
