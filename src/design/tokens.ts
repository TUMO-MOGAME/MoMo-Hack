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
    background: 'oklch(1 0 0)',
    foreground: 'oklch(0.145 0 0)',
    card: 'oklch(1 0 0)',
    'card-foreground': 'oklch(0.145 0 0)',
    popover: 'oklch(1 0 0)',
    'popover-foreground': 'oklch(0.145 0 0)',
    primary: 'oklch(0.205 0 0)',
    'primary-foreground': 'oklch(0.985 0 0)',
    secondary: 'oklch(0.97 0 0)',
    'secondary-foreground': 'oklch(0.205 0 0)',
    muted: 'oklch(0.97 0 0)',
    'muted-foreground': 'oklch(0.556 0 0)',
    accent: 'oklch(0.97 0 0)',
    'accent-foreground': 'oklch(0.205 0 0)',
    destructive: 'oklch(0.577 0.245 27.325)',
    'destructive-foreground': 'oklch(0.985 0 0)',
    success: 'oklch(0.596 0.145 163.225)',
    'success-foreground': 'oklch(0.985 0 0)',
    warning: 'oklch(0.554 0.135 66.442)',
    'warning-foreground': 'oklch(0.985 0 0)',
    info: 'oklch(0.546 0.215 262.881)',
    'info-foreground': 'oklch(0.985 0 0)',
    brand: 'oklch(0.842 0.166 89.5)',
    'brand-foreground': 'oklch(0.145 0 0)',
    'brand-accent': 'oklch(0.75 0.183 55.934)',
    'brand-accent-foreground': 'oklch(0.145 0 0)',
    border: 'oklch(0.922 0 0)',
    input: 'oklch(0.922 0 0)',
    ring: 'oklch(0.708 0 0)',
    overlay: 'oklch(0 0 0 / 55%)',
    'chart-1': 'oklch(0.842 0.166 89.5)',
    'chart-2': 'oklch(0.696 0.17 162.48)',
    'chart-3': 'oklch(0.707 0.165 254.624)',
    'chart-4': 'oklch(0.667 0.229 322.15)',
    'chart-5': 'oklch(0.705 0.213 47.604)',
  },
  // "Super glowing black" — kept from the reference system. Pure black ground,
  // near-black cards, white foreground, luminous edges.
  dark: {
    background: 'oklch(0 0 0)',
    foreground: 'oklch(1 0 0)',
    card: 'oklch(0.08 0 0)',
    'card-foreground': 'oklch(1 0 0)',
    popover: 'oklch(0.06 0 0)',
    'popover-foreground': 'oklch(1 0 0)',
    primary: 'oklch(1 0 0)',
    'primary-foreground': 'oklch(0 0 0)',
    secondary: 'oklch(0.14 0 0)',
    'secondary-foreground': 'oklch(1 0 0)',
    muted: 'oklch(0.12 0 0)',
    'muted-foreground': 'oklch(0.72 0 0)',
    accent: 'oklch(0.18 0 0)',
    'accent-foreground': 'oklch(1 0 0)',
    destructive: 'oklch(0.704 0.191 22.216)',
    'destructive-foreground': 'oklch(0.145 0 0)',
    success: 'oklch(0.765 0.177 163.223)',
    'success-foreground': 'oklch(0.205 0 0)',
    warning: 'oklch(0.828 0.189 84.429)',
    'warning-foreground': 'oklch(0.205 0 0)',
    info: 'oklch(0.707 0.165 254.624)',
    'info-foreground': 'oklch(0.205 0 0)',
    brand: 'oklch(0.862 0.176 90.5)',
    'brand-foreground': 'oklch(0 0 0)',
    'brand-accent': 'oklch(0.78 0.183 55.934)',
    'brand-accent-foreground': 'oklch(0 0 0)',
    // ⚠️ THESE THREE HAD ALREADY DRIFTED, and this file held the failing values.
    //
    // A3-01 measured `--border` at 1.27:1 and `--input` at 1.39:1 against a 3:1
    // requirement — on a cracked screen in Highveld sun the composer had no
    // visible edge. The fix raised them, and it was applied to `globals.css`
    // only. So the file calling itself "THE single source of truth" kept the
    // values that FAILED the audit, for as long as nothing compared the two.
    //
    // A2-01 predicted exactly this. `tests/unit/design/token-drift.test.ts`
    // caught it on its first run, which is the argument for that test in one
    // example. Interaction affordances are what a user must PERCEIVE to
    // operate, not decoration.
    border: 'oklch(1 0 0 / 38%)',
    input: 'oklch(1 0 0 / 40%)',
    // 35% passes at 3.01:1 with no headroom at all (A3-08). 45% gives ~4.4:1
    // and costs nothing, because the ring is transient.
    ring: 'oklch(1 0 0 / 45%)',
    overlay: 'oklch(0 0 0 / 72%)',
    'chart-1': 'oklch(0.862 0.176 90.5)',
    'chart-2': 'oklch(0.765 0.177 163.223)',
    'chart-3': 'oklch(0.707 0.165 254.624)',
    'chart-4': 'oklch(0.667 0.295 322.15)',
    'chart-5': 'oklch(0.705 0.213 47.604)',
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
