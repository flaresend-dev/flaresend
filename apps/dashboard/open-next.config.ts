import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every dashboard page is dynamic (live data from the mailer), so no incremental cache is configured.
export default defineCloudflareConfig({});
