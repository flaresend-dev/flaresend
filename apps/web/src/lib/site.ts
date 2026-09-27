/** Where the landing page lives (the custom domain in wrangler.jsonc). NEXT_PUBLIC_SITE_URL overrides it; empty falls back too. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://flaresend.dev').replace(/\/+$/, '');

/** The docs site (apps/docs). */
export const docsUrl = (process.env.NEXT_PUBLIC_DOCS_URL || 'https://docs.flaresend.dev').replace(/\/+$/, '');

export const githubUrl = 'https://github.com/flaresend-dev/flaresend';
export const npmUrl = 'https://www.npmjs.com/package/@flaresend/client';

export const docs = (path: string) => `${docsUrl}/docs${path}`;
