// Checks that every internal /docs/... link in the MDX content points at a page that exists.
// Run with `pnpm check-links`. Exits 1 and lists the broken links when any are found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = new URL('../content/docs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mdx') ? [p] : [];
  });
}

/** content/docs/(guides)/emails/tags.mdx -> /docs/emails/tags ; .../index.mdx -> its folder. */
function urlOf(file) {
  const parts = relative(root, file).split(sep).filter((s) => !/^\(.*\)$/.test(s));
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.mdx$/, '');
  if (parts[parts.length - 1] === 'index') parts.pop();
  return '/' + ['docs', ...parts].join('/');
}

const files = walk(root);
const pages = new Set(files.map(urlOf));
const broken = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:\]\(|href=["'{]{1,2})(\/docs[^)"'#\s}]*)/g)) {
    const url = m[1].replace(/\/$/, '');
    if (!pages.has(url)) broken.push(`${relative(root, file)} -> ${m[1]}`);
  }
}

if (broken.length) {
  console.error(`${broken.length} broken link(s):\n` + broken.join('\n'));
  process.exit(1);
}
console.log(`All internal links OK (${files.length} pages).`);
