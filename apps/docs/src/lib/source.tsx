import { llms, loader, type LoaderPlugin } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import { MethodBadge, type HttpMethod } from '@/components/api/method';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      /** API reference pages: the HTTP method, shown as a badge in the sidebar. */
      method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

/** Puts a method badge after the name of every page whose frontmatter has `method`. */
function methodBadgesPlugin(): LoaderPlugin {
  return {
    name: 'flaresend:method-badges',
    transformPageTree: {
      file(node, filePath) {
        if (!filePath) return node;
        const file = this.storage.read(filePath);
        if (!file || file.format !== 'page') return node;
        const method = (file.data as { method?: HttpMethod }).method;
        if (!method) return node;
        node.name = (
          <span key={filePath} className="flex w-full items-center justify-between gap-2">
            <span className="truncate">{node.name}</span>
            <MethodBadge method={method} size="sm" />
          </span>
        );
        return node;
      },
    },
  };
}

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin(), methodBadgesPlugin()],
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText('processed')}`,
});
