import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logo } from '@/components/logo';
import { githubUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
      url: '/',
    },
    githubUrl,
    links: [
      { text: 'Documentation', url: '/docs', active: 'none', on: 'nav' },
      { text: 'API Reference', url: '/docs/api-reference', active: 'none', on: 'nav' },
      { text: 'npm', url: 'https://www.npmjs.com/package/@flaresend/client', external: true },
    ],
  };
}
