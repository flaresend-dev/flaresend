// Works out the next version of @flaresend/types and @flaresend/client
// (they always share one version) from conventional commits since the
// last client-v* tag, and writes it into both package.json files.
//
//   fix:, perf:                      -> patch
//   feat:                            -> minor
//   type!: or "BREAKING CHANGE"      -> major (minor while on 0.x)
//   anything else                    -> no release
//
// Only commits that touch packages/types or packages/client count.
// If the version in package.json is not on npm yet (first run, or a
// publish that failed after the tag was pushed), it is released as is.
//
// Writes `version` and `bumped` to $GITHUB_OUTPUT. `version` is empty
// when there is nothing to release.
//
// Run locally with --dry-run to see what would happen.

import { execSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const PACKAGES = ["packages/types", "packages/client"];
const dryRun = process.argv.includes("--dry-run");

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function output(version, bumped) {
  console.log(version ? `release: ${version} (bumped: ${bumped})` : "release: nothing to release");
  if (process.env.GITHUB_OUTPUT && !dryRun) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nbumped=${bumped}\n`);
  }
}

function isPublished(name, version) {
  try {
    return sh(`npm view ${name}@${version} version`) === version;
  } catch {
    return false;
  }
}

const manifests = PACKAGES.map((dir) => {
  const path = `${dir}/package.json`;
  const text = readFileSync(path, "utf8");
  return { path, text, json: JSON.parse(text) };
});

const current = manifests[0].json.version;
for (const m of manifests) {
  if (m.json.version !== current) {
    throw new Error(`${m.path} is ${m.json.version} but ${manifests[0].path} is ${current}; they must match`);
  }
}

if (manifests.some((m) => !isPublished(m.json.name, current))) {
  output(current, false);
  process.exit(0);
}

let lastTag = "";
try {
  lastTag = sh(`git describe --tags --abbrev=0 --match "client-v*"`);
} catch {
  throw new Error("No client-v* tag found. Tag the commit the current version was released from.");
}

const log = sh(`git log ${lastTag}..HEAD --format=%s%x1f%b%x1e -- ${PACKAGES.join(" ")}`);
const commits = log
  .split("\x1e")
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [subject, body = ""] = c.split("\x1f");
    return { subject, body };
  });

// 0 = none, 1 = patch, 2 = minor, 3 = major
let level = 0;
for (const { subject, body } of commits) {
  const m = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(subject);
  if (!m) continue;
  const [, type, bang] = m;
  let l = 0;
  if (bang || /^BREAKING[ -]CHANGE:/m.test(body)) l = 3;
  else if (type === "feat") l = 2;
  else if (type === "fix" || type === "perf") l = 1;
  if (l) console.log(`  ${["", "patch", "minor", "major"][l]}: ${subject}`);
  level = Math.max(level, l);
}

if (level === 0) {
  console.log(`No feat/fix/perf/breaking commits in packages since ${lastTag}.`);
  output("", false);
  process.exit(0);
}

let [major, minor, patch] = current.split("-")[0].split(".").map(Number);
if (level === 3 && major === 0) level = 2;
if (level === 3) [major, minor, patch] = [major + 1, 0, 0];
else if (level === 2) [minor, patch] = [minor + 1, 0];
else patch += 1;
const next = `${major}.${minor}.${patch}`;

if (!dryRun) {
  for (const m of manifests) {
    writeFileSync(m.path, m.text.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
  }
}
output(next, true);
