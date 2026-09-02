import type { NextConfig } from 'next';

/**
 * SECURITY HEADERS (A5-01).
 *
 * There were none. The A5 overlay said, in as many words: *"No CSP is
 * configured yet; flag it if Phase 3 closes without one."* Measured against the
 * live deployment, the only security header present was `Strict-Transport-
 * Security`, and Vercel adds that itself.
 *
 * Two of these matter more than the rest for what this product is about to
 * become:
 *
 *   - `frame-ancestors 'none'` — this site is growing a payment confirmation
 *     button (S7f). A payments UI that can be framed by an attacker's page is
 *     the textbook clickjacking setup, and the control is one directive.
 *   - `X-Content-Type-Options: nosniff` — stops a browser re-typing a response
 *     whose content a user influenced.
 *
 * ── WHY THE CSP IS REPORT-ONLY, AND WHY THAT IS NOT A DODGE ──────────────────
 *
 * Next.js inlines its bootstrap and hydration data as `<script>` content. A
 * `script-src` without `'unsafe-inline'` therefore breaks the app unless every
 * inline script carries a nonce, which means routing a per-request nonce
 * through middleware into the document — real work, with a real chance of
 * shipping a white page.
 *
 * The night before a presentation is the wrong time to discover that. So the
 * enforcing directives that CANNOT break rendering are enforced, and the CSP
 * runs in `Report-Only` where a mistake costs a console warning instead of the
 * demo. `'unsafe-inline'` is stated openly below rather than quietly omitted —
 * a CSP that lies about its own strength is worse than none, because it stops
 * anyone looking again.
 *
 * When the nonce middleware lands, promote this header to
 * `Content-Security-Policy` and drop `'unsafe-inline'` from `script-src`.
 */

/**
 * `connect-src` must allow the app's own origin for `/api/agent` and
 * `/api/context`. Gemini is called from the SERVER, never the browser, so
 * `generativelanguage.googleapis.com` deliberately does not appear here — if it
 * ever needs to, that is a design regression worth noticing (ADR-0014: no key
 * in a client).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next's inline bootstrap. See the note above — this is the directive the
  // nonce work exists to remove.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind emits a stylesheet, but next/font injects an inline <style>.
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts, so no fonts.gstatic.com. data: is for inlined glyphs.
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Belt and braces with CSP frame-ancestors, for anything that predates it.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Send the origin cross-site, the full path same-site. A referrer carrying a
  // path is how ids leak to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs any of these. Voice (S8c) will need microphone — add it
  // deliberately, on the route that needs it, when it lands.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel Hobby caps functions at 10s (docs/10 §1). Nothing here may block on
  // MoMo — persist, fire, return. See docs/01 §6.
  experimental: {},
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
