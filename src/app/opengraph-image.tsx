/**
 * The Open Graph card, generated at build time (A6-01).
 *
 * Generated rather than designed as a PNG for two reasons. It cannot drift from
 * the brand, because it is built from the same values as the app; and it costs
 * no binary in a repository whose image budget has already been fought over
 * once (52MB of JPEGs down to 908KB).
 *
 * The one thing it must do is survive being shrunk: WhatsApp renders this at
 * roughly 300px wide in a chat bubble. So it is a wordmark, one line of claim,
 * and nothing else — no screenshot, no small text, no logo grid.
 *
 * Colours are literal here for the same reason as `icon.svg`: this runs in the
 * edge image runtime with no stylesheet, so there are no CSS variables to read.
 * They are the dark-theme `--background`, `--brand` and `--muted-foreground`
 * from `src/design/tokens.ts`.
 */
import { ImageResponse } from 'next/og';

export const alt = 'MoMo Kasi — daily money for Mzansi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: '#000000',
        padding: '80px 90px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 20,
            background: '#FFCB05',
            display: 'flex',
          }}
        />
        <div style={{ fontSize: 78, color: '#FFCB05', letterSpacing: -2 }}>MoMo Kasi</div>
      </div>

      <div style={{ fontSize: 46, color: '#FFFFFF', marginTop: 44, lineHeight: 1.25 }}>
        Daily money for Mzansi.
      </div>

      <div style={{ fontSize: 34, color: '#B8B8B8', marginTop: 18, lineHeight: 1.35 }}>
        Earn through micro-gigs. Share through stokvels. Spend on taxi fare, electricity and school
        fees.
      </div>

      <div
        style={{
          fontSize: 26,
          color: '#8A8A8A',
          marginTop: 'auto',
          display: 'flex',
          gap: 16,
        }}
      >
        <span>Built on the MTN MoMo API suite</span>
        <span style={{ color: '#3A3A3A' }}>·</span>
        <span>One double-entry ledger</span>
      </div>
    </div>,
    size,
  );
}
