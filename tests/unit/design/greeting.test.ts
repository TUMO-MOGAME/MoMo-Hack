import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GreetingCycle } from '@/components/greeting-cycle';
import { GREETINGS, nextGreetingIndex, shouldRotate } from '@/lib/greetings';

/**
 * The opening greeting rotates through all eleven official spoken languages.
 *
 * The things that can go wrong here are quiet ones: a duplicate word that reads
 * as the animation stuttering, a first index that does not match what the
 * server rendered, a heading that re-announces itself to a screen reader every
 * 2.6 seconds, and a reduced-motion guard that was written but never exercised.
 * None of them throws. All of them are asserted below.
 */

const chatPage = readFileSync(
  fileURLToPath(new URL('../../../src/app/(app)/chat/page.tsx', import.meta.url)),
  'utf8',
);

/**
 * The eleven, spelled as `docs/12` §2 spells them.
 *
 * A literal, deliberately. `src/lib/agent/language.ts` owns this list, but it is
 * still in flight on `feat/language-mirroring` — so until it lands the names are
 * pinned here, and the moment it lands the final test in this file compares the
 * two and fails on any name that is not in both. See `src/lib/greetings.ts`.
 */
const OFFICIAL_SPOKEN = [
  'English',
  'isiZulu',
  'isiXhosa',
  'Afrikaans',
  'Sepedi',
  'Setswana',
  'Sesotho',
  'Xitsonga',
  'siSwati',
  'Tshivenda',
  'isiNdebele',
] as const;

describe('the greeting covers every language it claims to', () => {
  it('has one greeting per official spoken language, and no others', () => {
    expect(GREETINGS).toHaveLength(OFFICIAL_SPOKEN.length);
    expect([...GREETINGS.map((g) => g.language)].sort()).toEqual([...OFFICIAL_SPOKEN].sort());
  });

  it('never shows the same word twice in the rotation', () => {
    // Two languages genuinely share `Sawubona` and two share `Dumela`. No
    // language label is shown on screen, so a repeat reads as a stutter rather
    // than as a fact about South Africa. `src/lib/greetings.ts` documents which
    // form was chosen for which language and why.
    const words = GREETINGS.map((g) => g.hello);
    expect(new Set(words).size).toBe(words.length);
  });

  it('carries a distinct BCP-47 code on every row, for the screen reader voice', () => {
    const codes = GREETINGS.map((g) => g.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?$/);
  });

  it('opens on isiZulu, because index 0 is what the server renders', () => {
    // If this ever changes, the server and the browser's first render disagree
    // and React logs a hydration mismatch on the page's own heading.
    expect(GREETINGS[0]).toMatchObject({ hello: 'Sawubona', language: 'isiZulu', code: 'zu' });
  });
});

describe('the rotation itself', () => {
  it('wraps back to the start instead of running off the end', () => {
    expect(nextGreetingIndex(0)).toBe(1);
    expect(nextGreetingIndex(GREETINGS.length - 1)).toBe(0);
    // Every index reachable, none skipped.
    const seen = new Set<number>();
    let i = 0;
    for (let n = 0; n < GREETINGS.length; n += 1) {
      seen.add(i);
      i = nextGreetingIndex(i);
    }
    expect(seen.size).toBe(GREETINGS.length);
    expect(i).toBe(0);
  });

  it('does not rotate when reduced motion is asked for', () => {
    // The dangerous direction. A CSS-only guard would still swap the word every
    // 2.6 seconds with the fade removed, which is the part that actually hurts.
    expect(shouldRotate(() => ({ matches: true }))).toBe(false);
  });

  it('rotates when no preference is expressed, or matchMedia is missing', () => {
    expect(shouldRotate(() => ({ matches: false }))).toBe(true);
    expect(shouldRotate(undefined)).toBe(true);
  });

  it('asks the reduced-motion query and not some other one', () => {
    const asked: string[] = [];
    shouldRotate((q) => {
      asked.push(q);
      return { matches: false };
    });
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
  });
});

describe('what a screen reader gets', () => {
  const html = renderToStaticMarkup(createElement(GreetingCycle));

  it('exposes one stable heading word, not a changing one', () => {
    // The rotating word sits inside the page's <h2>. Left readable, it would be
    // re-announced every 2.6 seconds over whatever the person was reading.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="sr-only">Sawubona.</span>');
  });

  it('renders the first greeting with its language tagged', () => {
    expect(html).toContain('lang="zu"');
    expect(html).toContain('Sawubona.');
  });
});

describe('the opening screen', () => {
  it('uses the cycling greeting rather than a hardcoded word', () => {
    expect(chatPage).toContain('<GreetingCycle />');
    expect(chatPage).not.toContain('Sawubona');
  });

  it('no longer lists what the build can and cannot do', () => {
    // Removed at Tumo's request. These four lines are what the opening screen
    // said before the greeting rotated; they are asserted gone so a revert or a
    // stray merge cannot quietly bring them back.
    expect(chatPage).not.toContain('CAPABILITIES');
    expect(chatPage).not.toContain('the difference between what you have and what you can spend');
    expect(chatPage).not.toContain('Where a taxi fare went');
    expect(chatPage).not.toContain('every one with its journal id');
    expect(chatPage).not.toContain('asks them on their own phone');
  });
});

describe('the language list has one owner', () => {
  it('agrees with LANGUAGES once src/lib/agent/language.ts lands', () => {
    // `src/lib/greetings.ts` must not invent language names. That module is the
    // owner; it is in flight on `feat/language-mirroring`. This assertion is
    // inert until it merges and arms itself the moment it does — rather than a
    // comment asking someone to keep the two in step, which `MISTAKES.md` M11
    // is the entry about watching fail within the hour.
    //
    // It READS the file rather than importing it, for one dull reason: `tsc`
    // cannot resolve a module that does not exist yet, so a dynamic import here
    // fails typecheck on this branch and only this branch. Parsing is also what
    // `scripts/contrast.mjs` does to `globals.css`, for the same M11 reason —
    // derive the value, never keep a second copy of it.
    const owner = fileURLToPath(new URL('../../../src/lib/agent/language.ts', import.meta.url));
    if (!existsSync(owner)) {
      // Not on this branch yet. The literal at the top carries the names until
      // it is, and the first test in this file holds GREETINGS against it.
      expect(OFFICIAL_SPOKEN).toHaveLength(11);
      return;
    }

    const source = readFileSync(owner, 'utf8');
    const block = /export const LANGUAGES[^=]*=\s*\[([^\]]*)\]/.exec(source);
    expect(block, 'language.ts landed but no longer exports a LANGUAGES array').not.toBeNull();

    const owned = [...block![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    // A parser that silently finds nothing is the failure mode that matters
    // (MISTAKES.md M11's guard says exactly this about the contrast script).
    expect(owned.length).toBeGreaterThan(0);
    expect([...GREETINGS.map((g) => g.language)].sort()).toEqual([...owned].sort());
  });
});
