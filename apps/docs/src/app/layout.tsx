import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Provider } from '@/components/provider';
import { siteUrl } from '@/lib/shared';
import './global.css';

// Same latin variable fonts as the dashboard, kept in the repo so the build never downloads from Google Fonts.
const inter = localFont({ src: './fonts/inter-latin-var.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' });
const mono = localFont({
  src: './fonts/jetbrains-mono-latin-var.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Flaresend Docs', template: '%s · Flaresend Docs' },
  description: 'Send transactional email from your own Cloudflare account. Guides, SDK and API reference for Flaresend.',
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

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
