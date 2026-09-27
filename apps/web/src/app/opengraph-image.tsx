import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Rendered once during `next build`; the static export ships the PNG.
export const dynamic = 'force-static';
export const alt = 'Flaresend: open-source transactional email on Cloudflare';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo.png'));
  const src = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: 'radial-gradient(70% 90% at 85% 0%, rgba(249,115,22,0.35) 0%, #0a0a0a 65%)',
          backgroundColor: '#0a0a0a',
          color: '#ededed',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og */}
          <img src={src} alt="" width={88} height={88} />
          <span style={{ fontSize: 48, fontWeight: 700 }}>Flaresend</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
            Transactional email that runs in your Cloudflare account.
          </div>
          <div style={{ fontSize: 30, color: '#fb923c' }}>Open source · MIT licensed</div>
        </div>
      </div>
    ),
    size,
  );
}
