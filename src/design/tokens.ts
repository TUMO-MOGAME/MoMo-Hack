/**
 * src/design — THE single source of truth for MoMo Kasi's design.
 *
 * Architecture adopted from the Social-Assembly design system (the reference
 * template): platform-agnostic tokens, plain data, no framework imports,
 * consumed by Tailwind v4 `@theme` CSS vars generated from `colors`.
 *
 * THE ONE RULE: components use SEMANTIC tokens, never raw palette values.
 *   ok    bg-primary text-primary-foreground, text-muted-foreground, bg-card
 *   not   bg-neutral-900, text-slate-700, #ffcb05, inline oklch(...)
 *
 * ── HOW THE CSS AND THIS FILE ARE KEPT IN STEP (A2-01) ──────────────────────
 *
 * This docstring used to say *"regenerating the CSS (`npm run tokens`), never
 * hand-editing globals.css"*. **There is no `tokens` script and never was**, so
 * `globals.css` is a second hand-maintained copy — and by the time the audit
 * looked, three dark roles had already drifted, with the FAILING values sitting
 * in this file (see `border` / `input` / `ring` below).
 *
 * What is true now: **edit both, and a test will not let them disagree.**
 * `tests/unit/design/token-drift.test.ts` imports this module, parses
 * `globals.css`, and compares every colour role in both scales in both
 * directions. It runs in the `Tests` CI job.
 *
 * A generator is still the better answer, and A2-01 asks for one. It is not
 * built because `globals.css` is not purely generated content — its palette
 * lines carry hand-written rationale (why `--ring` is 45% and not 35%) that a
 * generator would delete. That prose cost a session to recover once already.
 *
 * WHAT WE KEPT from Social-Assembly: the neutral grayscale system, the
 * "super glowing black" dark palette, the radius/motion/type scales, and the
 * Geist + Geist Mono + Playfair Display trio.
 *
 * WHAT WE CHANGED: `brand` moves from violet/fuchsia to an MTN-adjacent
 * amber/gold. This is a different product for a different audience — a South
 * African mobile-money hackathon — and the brand colour should read as MTN at a
 * glance. Everything else is deliberately the same system.
 */

export interface ColorScale {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  success: string;
  'success-foreground': string;
  warning: string;
  'warning-foreground': string;
  info: string;
  'info-foreground': string;
  /** The MoMo-adjacent brand gold. Used solid, as a gradient, and as soft tints. */
  brand: string;
  'brand-foreground': string;
  /**
   * Gold you WRITE WITH, as opposed to gold you fill with.
   *
   * `#FFCB05` on a white surface is about 1.5:1 — it fails SC 1.4.3 outright,
   * and every design that puts brand-coloured text on white and hopes gets this
   * wrong. Splitting the brand into a fill and a text tone is the fix, and it is
   * the single most useful idea in the redesign.
   *
   * On dark ground the two converge: gold on near-black is already ~13:1.
   */
  'brand-text': string;
  /** The tint behind a brand-coloured chip or highlight. Never a text colour. */
  'brand-soft': string;
  'brand-accent': string;
  'brand-accent-foreground': string;
  border: string;
  input: string;
  ring: string;
  /** Modal scrim behind the bottom sheet. Dims the conversation, never hides it. */
  overlay: string;
  /** Split / allocation visualisation. Four roles = the 60/25/10/5 fare split. */
  'chart-1': string;
  'chart-2': string;
  'chart-3': string;
  'chart-4': string;
  'chart-5': string;
}

export const colors: { light: ColorScale; dark: ColorScale } = {
  light: {
    background: '#F4F4F2',
    foreground: '#121212',
    card: '#FFFFFF',
    'card-foreground': '#121212',
    popover: '#FFFFFF',
    'popover-foreground': '#121212',
    // Kept NEUTRAL rather than gold. The mockup's `.primary` button is gold,
    // but `--primary` is a shadcn role that existing components already use for
    // "the ordinary solid button". Repointing it at the brand would turn every
    // neutral control gold at once. Gold has its own role: `brand`.
    primary: '#1B1B1A',
    'primary-foreground': '#F4F4F2',
    secondary: '#ECECE8',
    'secondary-foreground': '#121212',
    muted: '#ECECE8',
    'muted-foreground': '#5C5C57',
    accent: '#ECECE8',
    'accent-foreground': '#121212',
    destructive: '#B3261E',
    'destructive-foreground': '#FFFFFF',
    success: '#136F3F',
    'success-foreground': '#FFFFFF',
    warning: '#8A5A00',
    'warning-foreground': '#FFFFFF',
    info: '#1B4FD8',
    'info-foreground': '#FFFFFF',
    brand: '#FFCB05',
    'brand-foreground': '#141200',
    // ⚠️ GOLD TEXT IS NOT THE GOLD FILL, and this is the sharpest idea in the
    // design. #FFCB05 on white is about 1.5:1 — unreadable, and it fails
    // SC 1.4.3 by a mile. So the brand has TWO tokens: a fill you put dark text
    // on, and a darkened gold you write WITH. In dark mode they converge,
    // because gold on near-black is already readable.
    'brand-text': '#6B5300',
    'brand-soft': '#FFF3C2',
    'brand-accent': '#6B5300',
    'brand-accent-foreground': '#FFFFFF',
    // ⚠️ MAPPED BY ROLE, NOT BY NAME, and the difference matters.
    //
    // The redesign calls its hairline `--border` (#D8D8D2) and its control edge
    // `--control-border` (#77776F). Our system uses `--border` for the graded
    // control boundary and `--divider` for the ungraded hairline. Copying the
    // names across would have put a 1.26:1 edge on every control — which is
    // A3-01 exactly, the finding this project raised these values to close.
    //
    // The mockup's own composer has that weakness: `.ta` draws its resting edge
    // with the light `--border`. It looks elegant and it is not perceivable in
    // Highveld sun. So the hairline tone goes to `--divider`, where it belongs
    // and where it is honestly ungraded, and controls keep an edge you can see.
    border: '#77776F',
    input: '#77776F',
    // The focus ring is `--brand-text`, NOT `--brand`. The mockup focuses with
    // `outline: 3px solid var(--brand)`; on the white surfaces this design uses
    // that is ~1.5:1 and would reintroduce the A3 finding we just closed.
    // #6B5300 still reads unmistakably gold and clears 3:1 with room.
    ring: '#6B5300',
    overlay: '#00000073',
    'chart-1': '#FFCB05',
    'chart-2': '#0E9F6E',
    'chart-3': '#2563EB',
    'chart-4': '#B4468A',
    'chart-5': '#D2691E',
  },
  // The dark scale from the same design: near-black ground, lifted surfaces,
  // and the brand converging to a single gold because gold on near-black is
  // already readable. No white-alpha borders here — the redesign uses solid
  // greys, which is why the A3-01 alpha-compositing trap does not recur.
  dark: {
    background: '#0A0A0B',
    foreground: '#F2F2EE',
    card: '#141416',
    'card-foreground': '#F2F2EE',
    popover: '#141416',
    'popover-foreground': '#F2F2EE',
    primary: '#F2F2EE',
    'primary-foreground': '#0A0A0B',
    secondary: '#1E1E21',
    'secondary-foreground': '#F2F2EE',
    muted: '#1E1E21',
    'muted-foreground': '#A3A39C',
    accent: '#1E1E21',
    'accent-foreground': '#F2F2EE',
    destructive: '#FF6B5E',
    'destructive-foreground': '#3A1410',
    success: '#4ADE80',
    'success-foreground': '#062B16',
    warning: '#FBBF24',
    'warning-foreground': '#2A1D00',
    info: '#7DA6FF',
    'info-foreground': '#0A1938',
    brand: '#FFCB05',
    'brand-foreground': '#141200',
    // Converges with `brand` here: on #0A0A0B, #FFCB05 is about 13:1, so the
    // darkened variant the light scale needs would only make text harder to
    // read. Same role, different value — which is what a token is for.
    'brand-text': '#FFCB05',
    'brand-soft': '#2A2300',
    'brand-accent': '#FFCB05',
    'brand-accent-foreground': '#141200',
    // Same role mapping as the light scale — see the note there. #2A2A2E is
    // 1.38:1 on this ground and is the DIVIDER; #6F6F76 is the control edge.
    border: '#6F6F76',
    input: '#6F6F76',
    ring: '#FFCB05',
    overlay: '#000000B8',
    'chart-1': '#FFCB05',
    'chart-2': '#34D399',
    'chart-3': '#7DA6FF',
    'chart-4': '#E879C7',
    'chart-5': '#FB923C',
  },
};

/** Dark-mode glow shadows — the signature of the reference system. */
export const glow = {
  glow: '0 0 28px rgba(255, 255, 255, 0.08), 0 0 1px rgba(255, 255, 255, 0.4)',
  'glow-strong': '0 0 60px rgba(255, 255, 255, 0.18), 0 0 1px rgba(255, 255, 255, 0.55)',
  /** Brand halo, used on the money-moving surfaces. */
  'glow-brand': '0 0 0 1px rgba(255, 203, 5, 0.35), 0 0 28px -6px rgba(255, 203, 5, 0.45)',
};

export const fonts = {
  sans: {
    cssVar: '--font-geist-sans',
    stack: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  },
  mono: { cssVar: '--font-geist-mono', stack: 'var(--font-geist-mono), ui-monospace, monospace' },
  display: {
    cssVar: '--font-playfair',
    stack: 'var(--font-playfair), Georgia, "Times New Roman", serif',
  },
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
} as const;

export const radius = {
  base: '0.625rem',
  sm: 'calc(0.625rem - 4px)',
  md: 'calc(0.625rem - 2px)',
  lg: '0.625rem',
  xl: 'calc(0.625rem + 4px)',
} as const;

export const motion = {
  duration: { fast: '150ms', base: '240ms', slow: '400ms' },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const tokens = { colors, glow, fonts, fontSize, radius, motion };
