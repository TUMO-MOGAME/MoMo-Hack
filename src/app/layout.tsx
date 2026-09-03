/** @jsxRuntime automatic */
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { THEME_BOOTSTRAP } from '@/lib/theme';

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
  // take a CSS variable. These are `--background` from `src/design/tokens.ts`
  // and must be kept in step with it by hand — nothing derives them.
  //
  // Pinned to DARK rather than keyed to `prefers-color-scheme`, because our
  // default is dark regardless of the OS setting. Keying it to the OS would put
  // light browser chrome above a dark app for anyone whose laptop is in light
  // mode — which is most projectors.
  themeColor: '#0A0A0B',
  width: 'device-width',
  initialScale: 1,
  // Taxi ranks, gloves, cracked screens. Let people zoom.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // ── BOTH THEMES SHIP. DARK IS THE DEFAULT. ────────────────────────────
    //
    // No `className="dark"` here any more, and no `className` at all: the class
    // is stamped by `THEME_BOOTSTRAP` below, synchronously, before first paint,
    // from the reader's own stored choice. Hard-coding it here would override
    // that choice on every navigation.
    //
    // `suppressHydrationWarning` is required and is not a shrug. The bootstrap
    // deliberately mutates <html> before React hydrates — that is the entire
    // point of running before paint — so the server's markup and the browser's
    // DOM differ on this one element by design. Scoped to <html>; every other
    // element still gets a real mismatch warning.
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        {/* Before first paint. See src/lib/theme.ts for why this is a script
            and not an effect.

            A text CHILD, not `dangerouslySetInnerHTML`. React 19 renders a
            single string child on <script> verbatim, so the prop buys nothing
            here — and the CI money guard bans the prop across all of `src`,
            not merely the artifact path. A broad guard is worth more than the
            one-line convenience of the prop, and an exception carved into a
            money guard for a theme flash is an exception the next person
            widens. Proved by `tests/unit/design/theme-bootstrap.test.ts`,
            which fails if React ever renders this element empty. */}
        <script>{THEME_BOOTSTRAP}</script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable}`}>
        {children}
      </body>
    </html>
  );
}
