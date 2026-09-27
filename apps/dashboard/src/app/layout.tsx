import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { THEME_KEY, THEME_SCRIPT, htmlClassFor, parseTheme } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import "./globals.css";

// Latin variable fonts from Fontsource, kept in the repo so the build never downloads from Google Fonts
// (a bad Google Fonts response failed the deploy). Licenses are next to the files in ./fonts.
const inter = localFont({ src: "./fonts/inter-latin-var.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-var.woff2", weight: "100 800", variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Flaresend", template: "%s · Flaresend" },
  description: "Flaresend admin dashboard",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

// Every page shows live data from the mailer.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_KEY)?.value);
  return (
    // The inline script may add .dark before hydration when the theme is "system".
    <html lang="en" className={cn(inter.variable, mono.variable, htmlClassFor(theme))} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
