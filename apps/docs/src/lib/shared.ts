import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Flaresend';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

/** Where the docs are served (the custom domain in wrangler.jsonc). NEXT_PUBLIC_SITE_URL overrides it at build time. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://docs.flaresend.dev').replace(/\/+$/, '');

export const gitConfig = {
  user: 'flaresend-dev',
  repo: 'flaresend',
  branch: 'main',
  /** Folder of the MDX files, relative to the repo root. */
  contentDir: 'apps/docs/content/docs',
};

export const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
