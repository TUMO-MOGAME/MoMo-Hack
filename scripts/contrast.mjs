/**
 * `npm run contrast` — the measured half of A3.
 *
 * WHY THIS EXISTS. The A3 overlay says contrast below 4.5:1 is not a
 * technicality for this product: the user is on a cracked screen in direct
 * Highveld sunlight, and an unreadable balance is a person who cannot check
 * their money. A judgement that serious should not rest on anyone's eye, and
 * "looks fine on my monitor" is how a dark theme passes review and fails
 * outside.
 *
 * So this converts the real tokens — OKLCH, including the alpha-composited
 * `--border`, `--input` and `--ring` — through sRGB to WCAG relative luminance,
 * and prints the ratio against the threshold that applies. Alpha matters: a
 * token like `oklch(1 0 0 / 12%)` is meaningless until it is composited over
 * the surface behind it, and that composite is what the eye receives.
 *
 * It found two real failures at PHASE-3-A3 (`--input` at 1.39:1, `--ring` at
 * 2.98:1 on cards) that no amount of looking had found in four sessions.
 *
 * Colour maths: Björn Ottosson's oklab. Thresholds: WCAG 2.2 SC 1.4.3 (4.5:1
 * for normal text) and SC 1.4.11 (3:1 for the boundary of a control).
 *
 * Token values are READ FROM `src/app/globals.css` and never typed out here —
 * see the note above `darkTokens()` for why that turned out not to be optional.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, c));
  };
  return [enc(r), enc(g), enc(bl)];
}

function luminance([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Alpha-composite fg over bg in sRGB (what the browser actually paints).
function over(fg, bg, alpha) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * ── READ THE STYLESHEET. DO NOT KEEP A SECOND COPY. ──────────────────────────
 *
 * These values were typed out here once, with a comment asking the next person
 * to keep them in step with `globals.css`. They drifted **within the hour** —
 * the A3-01 fix raised `--input` from 15% to 40% and this file went on
 * confidently reporting 1.39:1 for a token that no longer existed.
 *
 * That is A2-01, the audit's own High finding, reproduced in miniature by the
 * script that found it: a source of truth is only a source of truth if
 * something *derives* from it. So this parses the `.dark` block and fails loudly
 * if a token it needs is absent, rather than carrying a stale duplicate that
 * looks authoritative.
 *
 * Parsing is what produced this session's OTHER false finding — a script that
 * matched the light scale against the dark block and reported 30 phantom
 * drifts — so the parse here is deliberately narrow: one named block, one
 * `--token: value;` shape, and an explicit error naming anything missing.
 * `tests/unit/design/contrast.test.ts` asserts the parse actually found the
 * tokens, because a parser that silently returns nothing is the failure mode
 * that matters.
 */
function blockTokens(header) {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const block = css.split(header)[1]?.split('\n}')[0];
  if (!block) throw new Error(`contrast: no \`${header}\` block found in globals.css`);

  const out = {};
  for (const m of block.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gim)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** `oklch(0.72 0 0)` or `oklch(1 0 0 / 45%)` → sRGB triple + alpha. */
function parseOklch(value, name) {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/.exec(value);
  if (!m) throw new Error(`contrast: cannot parse --${name}: ${value}`);
  return {
    rgb: oklchToSrgb(Number(m[1]), Number(m[2]), Number(m[3])),
    alpha: m[4] === undefined ? 1 : Number(m[4]) / 100,
  };
}

/**
 * `#RRGGBB`, `#RGB`, `#RRGGBBAA` → the same shape as `parseOklch`.
 *
 * The design system moved to hex when the UI was redrawn, and converting those
 * hexes to OKLCH to keep this parser happy would have shifted every colour by a
 * rounding error — measuring a palette that is not quite the one that ships is
 * the whole failure mode `MISTAKES.md` M11 is about. So the checker learns the
 * notation instead of the palette bending to the checker.
 */
function parseHex(value, name) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) throw new Error(`contrast: cannot parse --${name}: ${value}`);
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  return {
    rgb: [n(0), n(2), n(4)],
    alpha: h.length === 8 ? n(6) : 1,
  };
}

/** Whichever notation the stylesheet actually uses for this token. */
function parseColour(value, name) {
  return value.trim().startsWith('#') ? parseHex(value, name) : parseOklch(value, name);
}

/**
 * Both themes ship now, so both are measured.
 *
 * This header used to read "DARK THEME (the only shipped theme)" and the whole
 * script only ever read `.dark`. That was true for as long as the app was
 * `className="dark"`, and false the moment light shipped — a measuring tool
 * confidently reporting on half the product. Same expiry class as MISTAKES.md
 * M10's second cause, which is why it is fixed here rather than noted.
 *
 * Dark is printed FIRST because dark is the default theme.
 */
function measure(header) {
  const RAW = blockTokens(header);

  function token(name) {
    const value = RAW[name];
    if (!value) throw new Error(`contrast: --${name} is not defined in the ${header} block`);
    return parseColour(value, name);
  }

  /** Opaque roles, as sRGB triples. */
  const T = Object.fromEntries(
    [
      ['background', 'background'],
      ['foreground', 'foreground'],
      ['card', 'card'],
      ['secondary', 'secondary'],
      ['secondaryFg', 'secondary-foreground'],
      ['muted', 'muted'],
      ['mutedFg', 'muted-foreground'],
      ['brand', 'brand'],
      ['brandFg', 'brand-foreground'],
      ['brandText', 'brand-text'],
      ['brandSoft', 'brand-soft'],
      ['brandAccent', 'brand-accent'],
      ['destructive', 'destructive'],
      ['success', 'success'],
      ['warning', 'warning'],
    ].map(([key, cssName]) => [key, token(cssName).rgb]),
  );

  /** Alpha-capable roles, read from the stylesheet — never typed out here. */
  const ALPHA = {
    border: token('border'),
    input: token('input'),
    divider: token('divider'),
    ring: token('ring'),
  };

  return { T, ALPHA };
}

/**
 * `--border`, `--input` and `--ring` are white at low alpha, so they have no
 * colour of their own — they are whatever they are painted ON.
 *
 * ── THE BUG THIS SHAPE EXISTS TO PREVENT ─────────────────────────────────────
 *
 * The first version of this file composited all three over `--background` once,
 * then compared that single result against every surface. So the "ring on card"
 * row asked: *what is the contrast between a ring painted on the page ground and
 * a card?* — a question about two things that are never adjacent. It reported
 * the focus ring at **2.98:1** and PHASE-3-A3 filed a High finding on it.
 *
 * **That finding was wrong.** Composited correctly — over the card, because that
 * is what a ring drawn on a card sits on — it is **3.03:1**, and it passes.
 *
 * An alpha colour is meaningless until you say what is behind it, so the surface
 * is now a parameter and every pairing carries its own. There is no way to ask
 * the malformed question any more.
 *
 * `alphaOn(alpha, surface)` returns the painted colour; each row names the
 * surface once and it is used for both the composite and the comparison.
 */
const alphaOn = (role, surface) => over(role.rgb, surface, role.alpha);

const TEXT = [
  ['foreground on background', 'foreground', 'background', 4.5],
  ['foreground on card', 'foreground', 'card', 4.5],
  ['muted-foreground on background', 'mutedFg', 'background', 4.5],
  ['muted-foreground on card', 'mutedFg', 'card', 4.5],
  ['muted-foreground on muted', 'mutedFg', 'muted', 4.5],
  ['muted-foreground on secondary', 'mutedFg', 'secondary', 4.5],
  ['secondary-foreground on secondary', 'secondaryFg', 'secondary', 4.5],
  // ⚠️ `brand-text`, NOT `brand`. This row used to read `brand on background`
  // and it FAILED at 1.38:1 the moment the light theme was measured — because
  // #FFCB05 on #F4F4F2 is unreadable, which is exactly why the palette splits
  // the brand into a fill and a text tone.
  //
  // But we never RENDER that pairing: the wordmark, links and gold labels all
  // use `--brand-text`. Grading a combination the UI does not use is the same
  // error as MISTAKES.md M11's "ring painted on the ground, compared to a card"
  // — a real number answering a question nobody asked. The fill is still
  // reported below, ungraded, so it cannot hide.
  ['brand-text on background (wordmark, links)', 'brandText', 'background', 4.5],
  ['brand-text on card', 'brandText', 'card', 4.5],
  ['brand-text on brand-soft (chips)', 'brandText', 'brandSoft', 4.5],
  ['brand-foreground on brand (button, wallet card)', 'brandFg', 'brand', 4.5],
  ['brand-accent on background', 'brandAccent', 'background', 4.5],
  ['destructive on background', 'destructive', 'background', 4.5],
  ['success on background', 'success', 'background', 4.5],
  ['warning on background', 'warning', 'background', 4.5],
];

/** [label, alpha role, the surface it is painted on]. One surface, used twice. */
const UI = [
  ['border on background', 'border', 'background'],
  ['border on card', 'border', 'card'],
  ['input on background (the composer)', 'input', 'background'],
  ['input on card', 'input', 'card'],
  ['ring on background (focus)', 'ring', 'background'],
  ['ring on card (focus)', 'ring', 'card'],
];

const fmt = (n) => n.toFixed(2).padStart(6);
const verdict = (r, need) => `${r >= need ? 'PASS' : 'FAIL'}  ${fmt(r)}:1  (needs ${need})`;

function printTheme(themeLabel, header) {
  const { T, ALPHA } = measure(header);

  console.log(`--- WCAG 2.2 AA · normal text (>= 4.5:1) · ${themeLabel} ---`);
  for (const [label, fg, bg, need] of TEXT) {
    console.log(`${verdict(ratio(T[fg], T[bg]), need)}  ${label}`);
  }

  console.log('\n--- Non-text contrast, SC 1.4.11 (>= 3:1) ---');
  console.log('    a token is composited over the surface it is painted on');
  /**
   * `--divider` is reported but NOT graded, and the distinction is the whole point
   * of splitting the role. SC 1.4.11 governs what you must perceive in order to
   * *operate* something — a control's boundary, a state, a meaningful graphic. It
   * does not govern decoration. A hairline between two sections carries no
   * information a user needs, so holding it to 3:1 would be inventing a
   * requirement, and the usual way that ends is someone quietly lowering the real
   * thresholds to make the report green.
   *
   * Printing it as `n/a` rather than hiding it keeps the value visible, so that if
   * a divider is ever pressed into service as a control boundary, the number is
   * already on screen.
   */
  const DECORATIVE = ['divider on background (decorative)', 'divider', 'background'];

  /**
   * Reported, never graded: the gold FILL against the page.
   *
   * `--brand` is a background you put `--brand-foreground` on top of — the wallet
   * card, the send button — and that pairing is graded above at 12.36:1. What is
   * NOT a text pairing is the fill against the page behind it, which in the light
   * theme is 1.38:1.
   *
   * It is printed because a number that disappears is a number nobody reconsiders.
   * If a gold surface is ever given a border-less edge that a user must perceive
   * to operate it, this row is already on screen saying it cannot be.
   */
  const FILL = ['brand fill on background (not a text pairing)', 'brand', 'background'];

  for (const [label, role, surfaceName] of UI) {
    const surface = T[surfaceName];
    console.log(`${verdict(ratio(alphaOn(ALPHA[role], surface), surface), 3.0)}  ${label}`);
  }

  {
    const [label, role, surfaceName] = DECORATIVE;
    const surface = T[surfaceName];
    const r = ratio(alphaOn(ALPHA[role], surface), surface);
    console.log(`n/a  ${fmt(r)}:1  (not graded)  ${label}`);
  }

  {
    const [label, role, surfaceName] = FILL;
    console.log(`n/a  ${fmt(ratio(T[role], T[surfaceName]))}:1  (not graded)  ${label}`);
  }
}

// DARK FIRST — it is the default theme, and the existing assertions read the
// first matching row.
printTheme('DARK THEME (the default)', '.dark {');
console.log();
printTheme('LIGHT THEME', ':root {');
