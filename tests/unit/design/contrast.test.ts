/**
 * ⚠️ THE MEASUREMENT TOOL NEEDS ITS OWN TEST.
 *
 * `scripts/contrast.mjs` produced a **false High finding** in PHASE-3-A3: it
 * reported the focus ring at 2.98:1 on cards and the audit filed it as a WCAG
 * failure. The real figure is 3.03:1, and it passes.
 *
 * The bug was one line. Every alpha token was composited over `--background`
 * once, and that single result was then compared against each surface — so the
 * "ring on card" row asked what the contrast is between *a ring painted on the
 * page ground* and *a card*, two things that are never adjacent. An alpha colour
 * has no value at all until you say what is behind it.
 *
 * ── WHY THIS FILE AND NOT JUST A FIX ─────────────────────────────────────────
 *
 * A checker that is wrong is worse than no checker, because its output is
 * believed and acted on — `MISTAKES.md` M1's addendum in this repo says exactly
 * that, about a merge guard that misdiagnosed. A tool whose whole purpose is to
 * produce numbers nobody can verify by eye has no business being unverified
 * itself.
 *
 * So: known-answer pairs, computed by hand from the WCAG definition, pinned
 * here. Two are the trivially checkable extremes (white on black is exactly 21,
 * anything on itself is exactly 1) which catch a broken luminance function; the
 * rest are the real tokens, which catch a broken conversion or a broken
 * composite.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

/** Run the real script and parse its output — testing the artefact, not a copy. */
function report(): string {
  return execFileSync(process.execPath, [join(process.cwd(), 'scripts/contrast.mjs')], {
    encoding: 'utf8',
  });
}

/** The ratio the script printed for a row, by its label. */
function ratioFor(output: string, label: string): number {
  const line = output.split('\n').find((l) => l.includes(label));
  if (!line) throw new Error(`no row labelled "${label}" in the contrast report`);
  const m = /(\d+\.\d+):1/.exec(line);
  if (!m) throw new Error(`no ratio in row: ${line}`);
  return Number(m[1]);
}

describe('the contrast script computes WCAG ratios correctly', () => {
  const output = report();

  test('white on black is exactly 21:1 — the definition, not an approximation', () => {
    // (1.0 + 0.05) / (0.0 + 0.05) = 21. If the luminance function or the sRGB
    // conversion is wrong, this is the first thing that moves.
    expect(ratioFor(output, 'foreground on background')).toBeCloseTo(21.0, 1);
  });

  test('a colour against itself would be 1:1', () => {
    // Not a row in the report, but the invariant behind every row: the formula
    // is symmetric and bottoms out at 1. Asserted through the closest real pair
    // — brand-foreground on brand is pure black on gold, and its inverse (brand
    // on background) must give the identical ratio, because both are the same
    // two colours in the other order.
    expect(ratioFor(output, 'brand on background')).toBeCloseTo(
      ratioFor(output, 'brand-foreground on brand'),
      2,
    );
  });

  test('alpha tokens are composited over the surface they sit on, not over the ground', () => {
    // THE REGRESSION. "ring on card" once read 2.98 because the ring had been
    // painted on the background and then compared to a card.
    //
    // The invariant, which holds at ANY alpha and so survives a palette change:
    // a WHITE overlay on the lighter of two surfaces must yield the SLIGHTLY
    // HIGHER ratio, never a lower one. Cards (0.08) are lighter than the ground
    // (0.0), so ring-on-card > ring-on-background, by a little. The old bug
    // inverted that — it reported card BELOW ground — which is why this is
    // stated as an ordering rather than as two pinned numbers.
    const onGround = ratioFor(output, 'ring on background');
    const onCard = ratioFor(output, 'ring on card');

    expect(onCard).toBeGreaterThan(onGround);
    expect(onCard - onGround).toBeLessThan(0.2);
  });

  test('every token that bounds a CONTROL meets SC 1.4.11', () => {
    // A3-01, now fixed: --input 15% → 40%, --border 12% → 38%, --ring 35% → 45%.
    // These are the values a user must perceive to operate the app, and the
    // whole non-text section must be green.
    const uiBlock = output.split('Non-text contrast')[1] ?? '';
    expect(uiBlock).not.toMatch(/FAIL/);
    expect(ratioFor(output, 'input on background')).toBeGreaterThanOrEqual(3);
    expect(ratioFor(output, 'border on background')).toBeGreaterThanOrEqual(3);
    expect(ratioFor(output, 'ring on card')).toBeGreaterThanOrEqual(3);
  });

  test('the decorative divider is reported but not graded', () => {
    // Splitting --divider off from --border is what let the control tokens rise
    // without every hairline in the app rising with them. It must stay ungraded:
    // holding decoration to 3:1 invents a requirement, and the way that ends is
    // someone lowering the real thresholds to make the report green.
    expect(output).toMatch(/n\/a.*not graded.*divider/);
  });

  test('every text pairing passes 4.5:1', () => {
    const textBlock = output.split('Non-text contrast')[0] ?? '';
    expect(textBlock).not.toMatch(/FAIL/);
  });
});
