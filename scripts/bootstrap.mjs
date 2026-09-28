#!/usr/bin/env node
// One-command Cloudflare setup for a self-hosted Flaresend.
//
//   npx wrangler login     (once; opens a browser)
//   pnpm bootstrap
//
// Creates the D1 database, R2 bucket and queues, deploys the mailer with its secrets, creates the first project
// and API key, onboards the sending domain, and deploys the dashboard. Safe to run again: anything that already
// exists is kept. Answers are saved in .flaresend/bootstrap.json (gitignored) so a re-run does not ask again.
// The manual version of every step is in scripts/setup.md.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAILER_DIR = path.join(ROOT, "apps", "mailer");
const DASHBOARD_DIR = path.join(ROOT, "apps", "dashboard");
const STATE_FILE = path.join(ROOT, ".flaresend", "bootstrap.json");

const MAILER = "flaresend";
const DASHBOARD = "flaresend-dashboard";
const DATABASE = "flaresend";
const BUCKET = "flaresend-payloads";
const LIFECYCLE_RULE = "expire-payloads-30-days";
const QUEUES = ["flaresend-send", "flaresend-events", "flaresend-webhooks", "flaresend-dlq"];
const CF_API = "https://api.cloudflare.com/client/v4";

// [label, why, key for the pre-filled token link (https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/)]
const TOKEN_PERMISSIONS = [
  ["Zone → Zone → Read", "find the zone that holds each sending domain", { key: "zone", type: "read" }],
  // "email_sending" is not in Cloudflare's list of documented keys. If the page leaves it out, the user ticks it by hand.
  ["Zone → Email Sending → Read", "show whether a domain is onboarded", { key: "email_sending", type: "read" }],
  ["Zone → Email Sending → Edit", "onboard new sending domains", { key: "email_sending", type: "edit" }],
  ["Zone → DNS → Edit", "add the SPF, DKIM, return-path and DMARC records", { key: "dns", type: "edit" }],
  ["Account → Queues → Edit", "send each domain's delivery events to flaresend-events", { key: "queues", type: "edit" }],
  ["Account → Workers Scripts → Read", "show the mailer's URL in the dashboard", { key: "workers_scripts", type: "read" }],
];

/** The token page with the permissions above already ticked, scoped to this account and the sending zone. */
const tokenUrl = (account, zoneId) =>
  "https://dash.cloudflare.com/profile/api-tokens?" +
  new URLSearchParams({
    permissionGroupKeys: JSON.stringify(TOKEN_PERMISSIONS.map(([, , p]) => p)),
    accountId: account,
    zoneId,
    name: "Flaresend mailer",
  });

// ---------- output ----------

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint(1);
const dim = paint(2);
const green = paint(32);
const yellow = paint(33);
const red = paint(31);

let stepNo = 0;
const step = (title) => console.log(`\n${bold(`${++stepNo}. ${title}`)}`);
const ok = (msg) => console.log(`   ${green("✓")} ${msg}`);
const info = (msg) => console.log(`   ${msg}`);
const warn = (msg) => console.log(`   ${yellow("!")} ${msg}`);

class SetupError extends Error {}
const fail = (msg) => {
  throw new SetupError(msg);
};

// ---------- prompts ----------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
rl.on("SIGINT", () => {
  console.log();
  process.exit(130);
});
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) rl.output.write(s);
};

// Lines are queued rather than read with rl.question, so answers piped in all at once are not lost.
const pendingLines = [];
const waiting = [];
let inputClosed = false;
rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : pendingLines.push(line)));
rl.on("close", () => {
  inputClosed = true;
  while (waiting.length) waiting.shift()(null);
});

async function question(q) {
  rl.setPrompt(q);
  rl.prompt();
  const line = pendingLines.length ? pendingLines.shift() : inputClosed ? null : await new Promise((r) => waiting.push(r));
  if (line === null) fail("input ended before setup finished.");
  if (!process.stdin.isTTY) rl.output.write("\n");
  return line;
}

async function ask(label, { def, validate } = {}) {
  for (;;) {
    const answer = (await question(`   ${label}${def ? dim(` [${def}]`) : ""}: `)).trim() || def || "";
    const problem = validate?.(answer);
    if (!problem) return answer;
    warn(problem);
  }
}

async function askSecret(label) {
  rl.setPrompt(`   ${label}: `);
  rl.prompt();
  muted = true;
  try {
    return (await question("")).trim();
  } finally {
    muted = false;
    rl.output.write("\n");
  }
}

async function confirm(label, def = true) {
  const answer = (await question(`   ${label} ${dim(def ? "[Y/n]" : "[y/N]")} `)).trim().toLowerCase();
  return answer ? answer.startsWith("y") : def;
}

// ---------- state ----------

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

// ---------- wrangler ----------

function wranglerBin() {
  let pkgPath;
  try {
    pkgPath = createRequire(path.join(MAILER_DIR, "package.json")).resolve("wrangler/package.json");
  } catch {
    fail("wrangler is not installed. Run `pnpm install` from the repo root first.");
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.wrangler;
  return path.join(path.dirname(pkgPath), bin);
}

const WRANGLER = wranglerBin();
let accountId = "";

/** Runs wrangler. `interactive` hands it the terminal (for login, deploys and anything that may prompt). */
function wrangler(args, { cwd = MAILER_DIR, interactive = false, allowFail = false } = {}) {
  const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" };
  if (accountId) env.CLOUDFLARE_ACCOUNT_ID = accountId;
  const res = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (res.status !== 0 && !allowFail) {
    if (!interactive) console.log(output.trim().replace(/^/gm, "   │ "));
    fail(`\`wrangler ${args.join(" ")}\` failed.`);
  }
  return { ok: res.status === 0, stdout: res.stdout ?? "", output };
}

function wranglerJson(args, opts) {
  const res = wrangler(args, opts);
  const start = res.stdout.search(/[[{]/);
  try {
    return JSON.parse(res.stdout.slice(start));
  } catch {
    fail(`could not read the output of \`wrangler ${args.join(" ")}\`:\n${res.output}`);
  }
}

function pnpm(args, { cwd = ROOT } = {}) {
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };
  // Under `pnpm bootstrap`, npm_execpath is pnpm's own script, which runs the same on every OS.
  const execPath = process.env.npm_execpath;
  const res = execPath?.endsWith("js")
    ? spawnSync(process.execPath, [execPath, ...args], { cwd, env, stdio: "inherit" })
    : spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
  return res.status === 0;
}

// ---------- Cloudflare API ----------

async function cf(token, apiPath, { method = "GET", body } = {}) {
  const res = await fetch(`${CF_API}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.success !== false, status: res.status, result: json.result, errors: json.errors ?? [] };
}

/** Finds the zone that holds `hostname` (tries acme.com, then its parents). */
async function findZone(token, hostname) {
  const labels = hostname.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join(".");
    const res = await cf(token, `/zones?name=${encodeURIComponent(name)}&account.id=${accountId}`);
    if (res.ok && res.result?.length) return res.result[0];
  }
  return null;
}

// ---------- mailer admin API ----------

async function admin(baseUrl, adminKey, apiPath, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}/v1/admin${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${adminKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${method} /v1/admin${apiPath} answered ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  return json;
}

async function waitForHealth(baseUrl, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

// ---------- helpers ----------

const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;
const validDomain = (v) => (DOMAIN_RE.test(v) ? null : "enter a domain like acme.com");
const newSecret = () => randomBytes(32).toString("base64");

function openBrowser(url) {
  // Not `cmd /c start`: cmd splits the URL at its `&`s. Under WSL, open it in the Windows browser.
  const wsl = process.platform === "linux" && /microsoft/i.test(os.release());
  const tries =
    process.platform === "win32"
      ? [["rundll32", ["url.dll,FileProtocolHandler", url]]]
      : process.platform === "darwin"
        ? [["open", [url]]]
        : wsl
          ? [["wslview", [url]], ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]]
          : [["xdg-open", [url]]];
  for (const [cmd, args] of tries) {
    const res = spawnSync(cmd, args, { stdio: "ignore" });
    if (!res.error && res.status === 0) return;
  }
}

function withSecretsFile(values, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flaresend-"));
  const file = path.join(dir, "secrets.json");
  fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function secretNames(worker, cwd) {
  const res = wrangler(["secret", "list", "--format", "json", "--name", worker], { cwd, allowFail: true });
  if (!res.ok) return new Set(); // the Worker does not exist yet
  try {
    return new Set(JSON.parse(res.stdout.slice(res.stdout.indexOf("["))).map((s) => s.name));
  } catch {
    return new Set();
  }
}

/** Projects already in the account's flaresend database, or [] when there is no database or no tables yet. */
function existingProjects() {
  const res = wrangler(["d1", "execute", DATABASE, "--remote", "--json", "--command", "SELECT slug, allowed_domains FROM projects ORDER BY created_at"], {
    allowFail: true,
  });
  if (!res.ok) return [];
  try {
    const rows = JSON.parse(res.stdout.slice(res.stdout.indexOf("[")))[0]?.results ?? [];
    return rows.map((r) => ({ slug: r.slug, domains: JSON.parse(r.allowed_domains) }));
  } catch {
    return [];
  }
}

/** Checks what it can of CF_API_TOKEN without changing anything. Returns the permissions that are missing. */
async function probeToken(token, zone) {
  const verify = (await cf(token, "/user/tokens/verify")).ok || (await cf(token, `/accounts/${accountId}/tokens/verify`)).ok;
  if (!verify) return { valid: false, missing: [] };
  const checks = [
    ...(zone
      ? [
          ["Zone → Zone → Read", `/zones/${zone.id}`],
          ["Zone → Email Sending → Read", `/zones/${zone.id}/email/sending/subdomains`],
          ["Zone → DNS → Edit", `/zones/${zone.id}/dns_records?per_page=1`],
        ]
      : []),
    ["Account → Queues → Edit", `/accounts/${accountId}/queues`],
    ["Account → Workers Scripts → Read", `/accounts/${accountId}/workers/scripts`],
  ];
  const missing = [];
  for (const [label, apiPath] of checks) if (!(await cf(token, apiPath)).ok) missing.push(label);
  return { valid: true, missing };
}

// ---------- main ----------

async function main() {
  const state = loadState();
  console.log(bold("Flaresend setup"));
  console.log(dim("Sets up the mailer and dashboard in your Cloudflare account. Safe to run again."));

  // 1. Account
  step("Cloudflare account");
  let who = null;
  try {
    who = wranglerJson(["whoami", "--json"], { allowFail: true }); // prints {"loggedIn":false} and exits 1 when logged out
  } catch {}
  if (!who?.loggedIn) {
    info("You are not logged in to wrangler. Opening the login page…");
    wrangler(["login"], { interactive: true });
    who = wranglerJson(["whoami", "--json"]);
  }
  const accounts = who.accounts ?? [];
  if (!accounts.length) fail("this login has no Cloudflare accounts.");
  let account = accounts.find((a) => a.id === (process.env.CLOUDFLARE_ACCOUNT_ID || state.accountId));
  if (!account && accounts.length === 1) account = accounts[0];
  if (!account) {
    accounts.forEach((a, i) => info(`${i + 1}) ${a.name} ${dim(a.id)}`));
    const n = await ask("Which account", { validate: (v) => (accounts[Number(v) - 1] ? null : `enter 1 to ${accounts.length}`) });
    account = accounts[Number(n) - 1];
  }
  accountId = account.id;
  state.accountId = accountId;
  saveState(state);
  ok(`${account.name} ${dim(accountId)}`);
  const oauthToken = wranglerJson(["auth", "token", "--json"]).token;

  // 2. Existing install, or questions for a new one
  const existing = existingProjects();
  let zone = null;
  if (existing.length) {
    step("Existing setup");
    info("This account already runs Flaresend, so no project or domain is created. Projects found:");
    for (const p of existing) info(`  • ${p.slug.padEnd(20)} ${dim(p.domains.join(", "))}`);
    info(dim("Add domains and projects in the dashboard."));
    for (const d of existing.flatMap((p) => p.domains)) {
      zone = await findZone(oauthToken, d);
      if (zone) break;
    }
  } else {
    step("Your sending domain");
    info("The domain your apps send email from, like acme.com or send.acme.com. Its DNS must be on Cloudflare, in this account.");
    for (;;) {
      const domain = await ask("Sending domain", { def: state.domain, validate: validDomain });
      zone = await findZone(oauthToken, domain);
      if (zone) {
        state.domain = domain;
        break;
      }
      warn(`no zone for ${domain} in this account. Add the domain to Cloudflare first, or pick another.`);
    }
    ok(`zone ${zone.name}`);
    // The zone's first label names the project: mail.acme.com -> acme.
    const label = zone.name.split(".")[0].replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "") || "app";
    state.slug = await ask("Project slug", {
      def: state.slug ?? label,
      validate: (v) => (/^[a-z0-9][a-z0-9-]{0,62}$/.test(v) ? null : "lowercase letters, digits and dashes"),
    });
    state.name = await ask("Project name", { def: state.name ?? label[0].toUpperCase() + label.slice(1) });
    state.defaultFrom = await ask("Default sender", {
      def: state.defaultFrom ?? `${state.name} <hello@${state.domain}>`,
      validate: (v) => (v.toLowerCase().includes(`@${state.domain}`) ? null : `the address must be @${state.domain}`),
    });
  }
  info(`Optional: a hostname for the mailer, like mailer.${zone?.name ?? "acme.com"}. Leave empty to use its workers.dev address.`);
  const host = await ask("Mailer hostname", { def: state.mailerHost ?? "", validate: (v) => (!v || DOMAIN_RE.test(v) ? null : "enter a hostname") });
  state.mailerHost = host || undefined;
  if (state.mailerHost && !(await findZone(oauthToken, state.mailerHost))) {
    fail(`no zone for ${state.mailerHost} in this account; a custom hostname must be on a zone you have here.`);
  }
  saveState(state);

  // 3. CF_API_TOKEN
  step("Cloudflare API token for the mailer (CF_API_TOKEN)");
  const mailerSecrets = secretNames(MAILER, MAILER_DIR);
  let cfToken = "";
  if (mailerSecrets.has("CF_API_TOKEN") && (await confirm("The mailer already has a CF_API_TOKEN. Keep it?"))) {
    ok("keeping the existing token");
  } else {
    if (!zone) fail("no sending zone was found in this account; check the project domains before you create a token.");
    const url = tokenUrl(accountId, zone.id);
    info("The mailer uses this token at runtime to onboard domains and check their status.");
    info("Opening the token page with the permissions filled in. Check it has all of these, then Continue → Create Token:");
    for (const [perm, why] of TOKEN_PERMISSIONS) info(`  • ${perm.padEnd(34)} ${dim(why)}`);
    info(`Zone Resources: Specific zone - ${zone.name}. Add more zones to the token before you onboard them.`);
    info(dim(`If no browser opens: ${url}`));
    openBrowser(url);
    for (;;) {
      cfToken = await askSecret("Paste the token");
      if (!cfToken) continue;
      const probe = await probeToken(cfToken, zone);
      if (!probe.valid) {
        warn("Cloudflare does not accept that token. Paste it again.");
        continue;
      }
      if (!probe.missing.length) {
        ok("token works (the three Edit permissions can only be checked by using them, when a domain is set up)");
        break;
      }
      warn(`the token is missing: ${probe.missing.join(", ")}`);
      if (await confirm("Use it anyway? (No = paste a fixed token)", false)) break;
    }
  }

  // 4. Resources
  step("Database, storage and queues");
  const databases = wranglerJson(["d1", "list", "--json"]);
  if (databases.some((d) => d.name === DATABASE)) ok(`D1 database ${DATABASE} exists`);
  else {
    wrangler(["d1", "create", DATABASE]);
    ok(`created D1 database ${DATABASE}`);
  }
  const buckets = wrangler(["r2", "bucket", "list"]).stdout;
  if (new RegExp(`^name:\\s+${BUCKET}\\s*$`, "m").test(buckets)) ok(`R2 bucket ${BUCKET} exists`);
  else {
    const res = wrangler(["r2", "bucket", "create", BUCKET], { allowFail: true });
    if (!res.ok) {
      console.log(res.output.trim().replace(/^/gm, "   │ "));
      fail("could not create the R2 bucket. If R2 is not enabled on this account, enable it in the Cloudflare dashboard (R2 → Get started) and run again.");
    }
    ok(`created R2 bucket ${BUCKET}`);
  }
  const rules = wrangler(["r2", "bucket", "lifecycle", "list", BUCKET]).stdout;
  if (rules.includes(LIFECYCLE_RULE)) ok("email bodies expire after 30 days");
  else {
    wrangler(["r2", "bucket", "lifecycle", "add", BUCKET, LIFECYCLE_RULE, "payloads/", "--expire-days", "30", "--force"]);
    ok("added the rule that deletes email bodies after 30 days");
  }
  const queueList = wrangler(["queues", "list"]).stdout;
  for (const q of QUEUES) {
    if (new RegExp(`\\s${q}\\s`).test(queueList)) {
      ok(`queue ${q} exists`);
      continue;
    }
    const res = wrangler(["queues", "create", q], { allowFail: true });
    if (!res.ok) {
      console.log(res.output.trim().replace(/^/gm, "   │ "));
      fail("could not create the queue. See the error above.");
    }
    ok(`created queue ${q}`);
  }

  // 5. Mailer
  step("Deploy the mailer");
  wrangler(["d1", "migrations", "apply", DATABASE, "--remote"]);
  ok("database migrations applied");

  const sub = await cf(oauthToken, `/accounts/${accountId}/workers/subdomain`);
  const workersDevUrl = () => (state.workersSubdomain ? `https://${MAILER}.${state.workersSubdomain}.workers.dev` : "");
  // Do not trust a saved hostname as a destination for requests that carry the admin key.
  state.workersSubdomain = sub.ok && /^[a-z0-9-]+$/.test(sub.result?.subdomain ?? "") ? sub.result.subdomain : undefined;
  const publicUrl = () => (state.mailerHost ? `https://${state.mailerHost}` : workersDevUrl());

  const secrets = { CF_ACCOUNT_ID: accountId };
  if (publicUrl()) secrets.PUBLIC_BASE_URL = publicUrl();
  if (cfToken) secrets.CF_API_TOKEN = cfToken;
  if (!mailerSecrets.has("TRACKING_SECRET")) secrets.TRACKING_SECRET = newSecret();
  if (!mailerSecrets.has("ADMIN_API_KEY")) {
    state.adminKey = newSecret();
    secrets.ADMIN_API_KEY = state.adminKey;
  } else if (!state.adminKey) {
    info("The mailer already has an ADMIN_API_KEY, and this machine does not know it.");
    const pasted = await askSecret("Paste it, or press Enter to make a new one (the old one stops working)");
    state.adminKey = pasted || newSecret();
    if (!pasted) secrets.ADMIN_API_KEY = state.adminKey;
  }
  saveState(state);

  const deployArgs = ["deploy"];
  if (state.mailerHost) deployArgs.push("--domain", state.mailerHost);
  withSecretsFile(secrets, (file) => wrangler([...deployArgs, "--secrets-file", file], { interactive: true }));

  if (!state.workersSubdomain) {
    // A new account registers its workers.dev subdomain during the first deploy.
    const again = await cf(oauthToken, `/accounts/${accountId}/workers/subdomain`);
    if (again.ok && /^[a-z0-9-]+$/.test(again.result?.subdomain ?? "")) state.workersSubdomain = again.result.subdomain;
    saveState(state);
    if (!state.mailerHost && workersDevUrl()) {
      withSecretsFile({ PUBLIC_BASE_URL: workersDevUrl() }, (file) => wrangler(["secret", "bulk", file, "--name", MAILER]));
    }
  }
  ok(`deployed ${MAILER}`);

  const apiBase = workersDevUrl() || publicUrl();
  if (!apiBase) fail("could not work out the mailer's URL. Check Workers & Pages → flaresend → Settings → Domains & Routes.");
  info(`waiting for ${apiBase} to answer…`);
  if (!(await waitForHealth(apiBase, 120))) fail(`${apiBase}/health did not answer within 2 minutes. Run \`pnpm bootstrap\` again in a minute.`);
  ok("mailer is up");

  // 6. Project, key and domain (new installs only)
  let apiKey = "";
  if (!existing.length) {
  step("First project and API key");
  const projects = (await admin(apiBase, state.adminKey, "/projects")).data ?? [];
  let project = projects.find((p) => p.slug === state.slug);
  if (project) ok(`project ${state.slug} exists (no new API key made; create more in the dashboard)`);
  else {
    project = await admin(apiBase, state.adminKey, "/projects", {
      method: "POST",
      body: { slug: state.slug, name: state.name, defaultFrom: state.defaultFrom, allowedDomains: [state.domain] },
    });
    ok(`created project ${state.slug}`);
    apiKey = (await admin(apiBase, state.adminKey, `/projects/${state.slug}/api-keys`, { method: "POST", body: { name: "default", mode: "live" } })).key;
    ok("created a live API key");
  }

  // 7. Domain
  step(`Onboard ${state.domain} in Cloudflare Email Sending`);
  const allowed = project.allowedDomains ?? [];
  if (!allowed.includes(state.domain)) {
    warn(`project ${state.slug} does not list ${state.domain}; add it in the dashboard, then use Set up in Cloudflare.`);
  } else {
    const setup = await admin(apiBase, state.adminKey, `/projects/${state.slug}/domains/${state.domain}/setup`, { method: "POST" });
    for (const s of setup.steps ?? []) {
      const mark = s.status === "created" || s.status === "exists" ? green("✓") : s.status === "skipped" ? dim("-") : red("✗");
      info(`${mark} ${s.step}: ${s.status}${s.detail ? dim(` — ${s.detail}`) : ""}`);
    }
    if ((setup.steps ?? []).some((s) => s.status === "conflict" || s.status === "failed")) {
      warn("fix the lines marked ✗, then run this again or use Set up in Cloudflare in the dashboard.");
    }
  }
  }

  // 8. Dashboard
  step("Deploy the dashboard");
  const dashboardUrl = state.workersSubdomain ? `https://${DASHBOARD}.${state.workersSubdomain}.workers.dev` : "";
  let dashboardDeployed = false;
  if (process.platform === "win32") {
    // OpenNext's build does not work on Windows: the pnpm symlinks it copies point back into the repo's node_modules,
    // so the bundle picks up sharp's native Windows binary. It works on Linux (CI or WSL).
    warn("skipped: the dashboard can't be built on Windows. The mailer is done.");
    warn("Run `pnpm bootstrap` from WSL, or let CI deploy the dashboard and then set its Access secrets (scripts/setup.md step 9).");
  } else {
    dashboardDeployed = pnpm(["--filter", "@flaresend/dashboard", "run", "deploy"]);
    if (!dashboardDeployed) warn("the dashboard did not deploy. Fix the error above and run `pnpm bootstrap` again.");
  }

  const dashboardSecrets = dashboardDeployed ? secretNames(DASHBOARD, DASHBOARD_DIR) : new Set();
  const accessDone = dashboardSecrets.has("ACCESS_AUD") && dashboardSecrets.has("ACCESS_TEAM_DOMAIN");
  if (dashboardDeployed && accessDone) ok("Cloudflare Access is already set up");
  else if (dashboardDeployed) {
    info("The dashboard has no login of its own; Cloudflare Access is the login. Until it is set up, every page answers 500.");
    info(`  1. Workers & Pages → ${DASHBOARD} → Settings → Domains & Routes → workers.dev → enable Cloudflare Access.`);
    info("     (Or Zero Trust → Access → Applications → Add a self-hosted app for the dashboard's hostname.)");
    info("  2. Copy the application's Audience (AUD) tag, and your team domain from Zero Trust → Settings.");
    const aud = await ask("AUD tag (Enter to skip for now)");
    if (aud) {
      const team = await ask("Team domain", {
        validate: (v) => (/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(v) ? null : "looks like yourteam.cloudflareaccess.com"),
      });
      withSecretsFile({ ACCESS_AUD: aud, ACCESS_TEAM_DOMAIN: team }, (file) =>
        wrangler(["secret", "bulk", file, "--name", DASHBOARD], { cwd: DASHBOARD_DIR }),
      );
      ok("Access values saved on the dashboard");
    } else {
      warn("skipped. Run `pnpm bootstrap` again when you have them.");
    }
  }

  // Summary
  console.log(`\n${bold("Done.")}\n`);
  info(`Mailer:     ${publicUrl() || apiBase}`);
  if (dashboardUrl && dashboardDeployed) info(`Dashboard:  ${dashboardUrl}`);
  info(`Admin key:  ${state.adminKey}`);
  info(dim(`            saved in ${path.relative(ROOT, STATE_FILE)} (gitignored). The CLI uses it as FLARESEND_ADMIN_KEY.`));
  if (apiKey) {
    info(`API key:    ${apiKey}`);
    info(dim("            shown only once. Put it in your app's secrets as FLARESEND_API_KEY."));
  }
  if (state.mailerHost) info(dim(`A new custom hostname can take a few minutes to get its certificate; ${apiBase} works meanwhile.`));
  console.log();
}

main()
  .catch((err) => {
    console.error(`\n${red("Setup stopped:")} ${err instanceof SetupError ? err.message : err.stack}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
