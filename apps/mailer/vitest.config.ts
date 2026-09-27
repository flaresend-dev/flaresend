import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // The workerd bundled with @cloudflare/vitest-pool-workers 0.22 supports dates up to 2026-08-22;
          // wrangler.jsonc uses 2026-09-01. Nothing between the two dates changes behaviour we test.
          compatibilityDate: "2026-08-22",
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            ADMIN_API_KEY: "test-admin-key",
            TRACKING_SECRET: "test-tracking-secret",
            CF_API_TOKEN: "",
            // Secrets in production (see wrangler.jsonc), so tests supply them.
            PUBLIC_BASE_URL: "https://mailer.test",
            CF_ACCOUNT_ID: "",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
