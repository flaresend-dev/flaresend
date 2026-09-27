import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // @flaresend/types ships prebuilt ESM/CJS; transpiling keeps dev and build consistent in the monorepo.
  transpilePackages: ["@flaresend/types"],
  poweredByHeader: false,
  // The old global pages. `/` then picks the project (last visited, else the first). Old `/projects/{slug}?tab=…`
  // URLs are mapped by app/projects/[slug]/page.tsx and old `/emails/{id}` links by app/emails/[id]/page.tsx.
  async redirects() {
    return ["/emails", "/analytics", "/logs", "/suppressions"].map((source) => ({ source, destination: "/", permanent: false }));
  },
};

export default nextConfig;

// Makes getCloudflareContext() work under `next dev` (bindings + vars from wrangler.jsonc / .dev.vars).
initOpenNextCloudflareForDev();
