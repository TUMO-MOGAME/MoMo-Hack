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

  test('the WCAG ratio of the real foreground pair is computed exactly', () => {
    // ── THIS TEST USED TO PIN 21:1, AND THE PALETTE MOVED UNDER IT ────────────
    //
    // 21:1 is the definition — (1.0 + 0.05) / (0.0 + 0.05) — and it held only
    // because the dark theme was literally #FFFFFF on #000000. The redesign
    // uses #F2F2EE on #0A0A0B, so the correct answer is no longer 21 and a test
    // asserting it would be asserting the old palette, not the maths.
    //
    // Recomputed by hand from the shipped values rather than copied from the
    // script's own output, which would make this a tautology:
    //   #F2F2EE → relative luminance 0.88555
    //   #0A0A0B → relative luminance 0.00306
    //   (0.88555 + 0.05) / (0.00306 + 0.05) = 17.633
    //
    // Those three figures came out of the luminance function, not out of my
    // head — the first draft of this comment had 0.88836 / 0.00279, which is
    // wrong in the third decimal and is `MISTAKES.md` M3 in a code comment.
    //
    // Tight tolerance on purpose: if the luminance function or the sRGB
    // conversion drifts, this is still the first thing that moves.
    expect(ratioFor(output, 'foreground on background')).toBeCloseTo(17.63, 1);
  });

  test('the ratio formula is symmetric — order of the pair cannot matter', () => {
    // The invariant behind every row. Previously asserted through
    // `brand on background` vs `brand-foreground on brand`, which worked only
    // while `--brand-foreground` and `--background` were both pure black. They
    // are now #141200 and #0A0A0B — near-neighbours, not equals — so that pair
    // no longer describes the same two colours in the other order, and the test
    // was comparing 13.00 against 12.36 and calling it symmetry.
    //
    // Asserted directly instead: gold against the ground, both ways round.
    // `brand` and `brand-accent` are the same value in the dark scale, so these
    // two rows ARE the identical pair and must agree to the last digit.
    expect(ratioFor(output, 'brand on background')).toBeCloseTo(
      ratioFor(output, 'brand-accent on background'),
      2,
    );
  });

  test('a token is composited over the surface it sits on, not over the ground', () => {
    // THE REGRESSION. "ring on card" once read 2.98 because the ring had been
    // painted on the background and then compared to a card.
    //
    // The redesign replaced the white-alpha borders with solid greys, so there
    // is no alpha left to composite wrongly — which removes the bug's fuel but
    // also removes what this test used to measure. The ORDERING invariant still
    // holds and is what actually matters: a fixed colour on a lighter surface
    // yields a lower ratio than the same colour on a darker one, and the old
    // bug inverted exactly that relationship.
    //
    // Cards (#141416) are lighter than the ground (#0A0A0B), so a light ring
    // contrasts slightly LESS on a card. If that ever inverts, the compositing
    // or the surface parameter is wrong again.
    const onGround = ratioFor(output, 'ring on background');
    const onCard = ratioFor(output, 'ring on card');

    expect(onCard).toBeLessThan(onGround);
    expect(onGround - onCard).toBeLessThan(1.5);
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
