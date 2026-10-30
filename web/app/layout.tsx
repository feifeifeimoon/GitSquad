import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// Both faces are the latin variable files, vendored under `app/fonts/` and
// loaded with `next/font/local` rather than fetched from Google at build time.
//
// That is not a preference. `next/font/google` asks Google for a stylesheet and
// builds an @font-face from whatever comes back, and roughly one response in
// sixty comes back with extensionless `/l/font?kit=…&skey=…` URLs instead of
// `/s/…/*.woff2` ones — which Turbopack cannot resolve, so the build dies with
// "next/font/google queries have exactly one entry" (vercel/next.js#99114).
// One request per subset per weight made that a coin-toss on CI; a local file
// cannot answer with a different shape. The files are the same bytes Google
// serves, and `web/THIRD-PARTY-FONTS.md` carries the licence they travel under.
const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  variable: "--font-plex-sans",
  weight: "100 700",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GitSquad - Your autonomous developer team on GitHub",
  description: "Your autonomous developer team on GitHub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
