/** @jsxRuntime automatic */
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const playfair = Playfair_Display({ variable: '--font-playfair', subsets: ['latin'] });

/**
 * The canonical host. `momo.tumoolo.tech` and not the Vercel alias, and this is
 * not only an SEO preference: the MoMo API user is BOUND to this host at
 * provisioning time, and a mismatched `X-Callback-Url` is a hard 500 with no
 * payment created (momoAPIs.md §4.1, measured). Anything that encourages the
 * alias to be treated as equivalent is a small trap for a future session.
 */
const SITE = 'https://momo.tumoolo.tech';

const DESCRIPTION =
  'Earn through micro-gigs, share through stokvels, spend on taxi fare, electricity and school fees. One double-entry ledger across three MTN MoMo APIs.';

export const metadata: Metadata = {
  // A6-03. Without this, every relative OG URL below resolves against localhost
  // in development and against whichever host served the request in production.
  metadataBase: new URL(SITE),
  title: 'MoMo Kasi — the daily-money app for Mzansi',
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  applicationName: 'MoMo Kasi',
  // A6-01. There were NO Open Graph or Twitter tags, so a link pasted into
  // WhatsApp, Slack, LinkedIn or a Telegram chat rendered as bare grey text —
  // and chat apps are this project's entire sharing surface. `opengraph-image.tsx`
  // beside this file generates the card image at build time, so it needs no
  // design asset and cannot go stale against the brand.
  openGraph: {
    type: 'website',
    siteName: 'MoMo Kasi',
    locale: 'en_ZA',
    url: SITE,
    title: 'MoMo Kasi — the daily-money app for Mzansi',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MoMo Kasi — the daily-money app for Mzansi',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  // The one literal colour in the codebase: <meta name="theme-color"> cannot
  // take a CSS variable. Two entries, so the browser chrome follows whichever
  // theme is actually showing rather than being pinned to the old dark-only
  // build. These are `--background` from `src/design/tokens.ts` and must be
  // kept in step with it by hand — nothing derives them.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Taxi ranks, gloves, cracked screens. Let people zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // LIGHT IS THE DEFAULT NOW. The app was `className="dark"` — dark-only,
    // forced — and the redesign is drawn light-first. `.dark` is still defined
    // and still measured by `npm run contrast`, so switching back is one class.
    //
    // Light is also the safer choice for the thing this build exists to do:
    // a dark screen on a projector in a lit room washes out, and A3 measured
    // our dark palette as the one that had the contrast problems.
    <html lang="en-ZA">
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable}`}>
        {children}
      </body>
    </html>
  );
}
