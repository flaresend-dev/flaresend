import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { generateOGImage } from 'fumadocs-ui/og';
import { appName, getPageImageUrl } from '@/lib/shared';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const revalidate = false;

// Read once at build time; the images are generated during `next build`, never at request time.
const logo = readFile(join(process.cwd(), 'public', 'logo.png')).then((b) => `data:image/png;base64,${b.toString('base64')}`);

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: appName,
    // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og
    icon: <img src={await logo} alt="" width={56} height={56} />,
    primaryColor: 'rgba(249, 115, 22, 0.35)',
    primaryTextColor: 'rgb(251, 146, 60)',
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
}
