import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { siteUrl } from '@/lib/site';
import './global.css';

// Same latin variable fonts as the dashboard and docs, kept in the repo so the build never downloads from Google Fonts.
const inter = localFont({ src: './fonts/inter-latin-var.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' });
const mono = localFont({
  src: './fonts/jetbrains-mono-latin-var.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const description =
  'Open-source transactional email that runs in your own Cloudflare account. A Resend-style API, logs, retries, templates and webhooks. MIT licensed.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Flaresend: open-source transactional email on Cloudflare',
  description,
  openGraph: { type: 'website', siteName: 'Flaresend', title: 'Flaresend', description },
  twitter: { card: 'summary_large_image', title: 'Flaresend', description },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
