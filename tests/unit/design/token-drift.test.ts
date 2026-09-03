/**
 * A2-01 — the design tokens and the shipped CSS must not drift apart.
 *
 * `src/design/tokens.ts` calls itself *"THE single source of truth for MoMo
 * Kasi's design"*. `src/app/globals.css` is what the browser actually loads.
 * The audit's finding was blunt and correct:
 *
 * > *"The single source of truth is only a source of truth if something derives
 * > from it."*
 *
 * Nothing did. The two files were verified to agree 60/60 by hand, once, and
 * nothing kept them agreeing.
 *
 * ── WHY THIS IS A TEST AND NOT THE GENERATOR THE AUDIT ASKED FOR ─────────────
 *
 * A2-01's preferred fix is `scripts/tokens.mjs` emitting the `:root` and
 * `.dark` blocks. **`globals.css` is not purely generated content.** Its
 * palette lines are interleaved with hand-written rationale that is worth more
 * than the convenience — the `--ring` note recording that 35% passes at 3.01:1
 * with no headroom while 45% gives ~4.4:1 and costs nothing, for instance. A
 * generator that emitted the block would delete that reasoning, and the reason
 * we know the reasoning matters is that A3 spent a session recovering it.
 *
 * So this takes the audit's own stated minimum — *"a unit test asserting every
 * role in `tokens.ts` equals its `globals.css` value, the comparison this audit
 * ran by hand"* — which closes the drift gap without putting a script in a
 * position to rewrite prose. The generator remains the better long-term answer
 * once the CSS is only values.
 *
 * ── AND IT IS BUILT AGAINST MISTAKES.md M11 ─────────────────────────────────
 *
 * M11 is a token checker that reported all 30 dark roles as drifted. It had
 * matched the LIGHT scale from the TypeScript against the `.dark` block of the
 * CSS. A second one kept its own hardcoded copy of the values and drifted
 * within the hour.
 *
 * So: this imports the real module and parses the real stylesheet — no copies,
 * no "keep these in step" comment. It checks BOTH scales against BOTH blocks,
 * and it asserts the parse actually found tokens, because **a parser that
 * silently returns nothing is the failure mode that matters** — a checker
 * comparing two empty objects passes forever.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { colors } from '@/design/tokens';

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/**
 * The `--token: value;` pairs inside one named block.
 *
 * Split on the block header and stop at the first line-anchored `}`, which is
 * how `scripts/contrast.mjs` reads the same file. Narrow on purpose: a lenient
 * parser that swallows the next block is exactly the M11 bug.
 */
function blockTokens(header: string): Record<string, string> {
  const body = CSS.split(header)[1]?.split('\n}')[0];
  if (!body) throw new Error(`token-drift: no \`${header}\` block found in globals.css`);

  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gim)) {
    out[m[1] as string] = norm(m[2] as string);
  }
  return out;
}

/**
 * Compare COLOURS, not the exact characters that spell them.
 *
 * Prettier normalises hex in CSS to lower case, so `#F4F4F2` in `tokens.ts`
 * arrives here as `#f4f4f2` — the same colour, a failing string comparison, and
 * a test that breaks every time anyone runs the formatter. A guard that fires
 * on formatting is a guard people learn to ignore, which is worse than not
 * having it.
 *
 * Case and surrounding whitespace only. Nothing here collapses `#fff` to
 * `#ffffff` or reorders an `oklch()` — those are differences worth failing on,
 * because they are differences someone typed on purpose.
 */
function norm(value: string): string {
  return value.trim().toLowerCase();
}

const root = blockTokens(':root {');
const dark = blockTokens('.dark {');

describe('the parser found something', () => {
  // If these ever hit zero, every assertion below passes vacuously and the
  // guard has silently stopped guarding.
  test('the :root block yields tokens', () => {
    expect(Object.keys(root).length).toBeGreaterThan(20);
  });

  test('the .dark block yields tokens', () => {
    expect(Object.keys(dark).length).toBeGreaterThan(20);
  });

  test('the two blocks are genuinely different', () => {
    // M11's actual bug, inverted into an assertion: if the parse returned the
    // same object for both, a light-vs-dark comparison would be meaningless.
    expect(root['background']).not.toBe(dark['background']);
  });

  test('tokens.ts exports both scales', () => {
    expect(Object.keys(colors.light).length).toBeGreaterThan(20);
    expect(Object.keys(colors.dark).length).toBe(Object.keys(colors.light).length);
  });
});

describe('every role in tokens.ts matches the shipped CSS', () => {
  // Built as a table so a failure names the ROLE and the SCALE, not just
  // "objects differ" — the whole point is that someone can act on it.
  const cases: { scale: 'light' | 'dark'; header: string; css: Record<string, string> }[] = [
    { scale: 'light', header: ':root', css: root },
    { scale: 'dark', header: '.dark', css: dark },
  ];

  for (const { scale, header, css } of cases) {
    describe(`${scale} → ${header}`, () => {
      for (const [role, value] of Object.entries(colors[scale])) {
        test(`--${role}`, () => {
          expect(`--${role}: ${css[role] ?? '(missing from globals.css)'}`).toBe(
            `--${role}: ${norm(value)}`,
          );
        });
      }
    });
  }
});

describe('the CSS does not carry roles the token file has never heard of', () => {
  // The other direction. Drift is symmetric: a role added to globals.css alone
  // is just as much a second source of truth as one added to tokens.ts alone.
  //
  // Only the colour roles are compared. `globals.css` legitimately defines
  // non-colour custom properties (radius, glows, dividers) that `ColorScale`
  // does not model, so they are named here rather than silently tolerated by a
  // loose filter.
  const NOT_COLOUR_ROLES = new Set([
    'radius',
    'divider',
    'glow',
    'glow-strong',
    'glow-brand',
    'font-sans',
    'font-mono',
    'font-serif',
  ]);

  test('every colour role in :root exists in tokens.ts', () => {
    const known = new Set(Object.keys(colors.light));
    const strangers = Object.keys(root).filter((r) => !known.has(r) && !NOT_COLOUR_ROLES.has(r));
    expect(strangers).toEqual([]);
  });

  test('every colour role in .dark exists in tokens.ts', () => {
    const known = new Set(Object.keys(colors.dark));
    const strangers = Object.keys(dark).filter((r) => !known.has(r) && !NOT_COLOUR_ROLES.has(r));
    expect(strangers).toEqual([]);
  });
});
