/**
 * The opening greeting, in all eleven official spoken languages.
 *
 * ── WHY IT ROTATES ───────────────────────────────────────────────────────────
 *
 * The opening screen said "Sawubona." and nothing else, which quietly makes the
 * product isiZulu-shaped. `docs/12` §2 claims MoMo Kasi meets people in every
 * South African language; the first word on the first screen is the cheapest
 * place to actually show that, and the only one a judge sees before they read
 * anything. So it cycles, and a Xitsonga speaker gets greeted in Xitsonga
 * roughly a tenth of the time instead of never.
 *
 * ── THE LANGUAGE NAMES ARE NOT MINE TO INVENT ────────────────────────────────
 *
 * `language` on each row must name a language in `src/lib/agent/language.ts`'s
 * `LANGUAGES` — the one list this product uses, in `docs/12` §2's tier order.
 * That module is not on `main` yet (it is in flight on `feat/language-mirroring`),
 * so this file cannot import it today without depending on unmerged work.
 *
 * It is NOT left to a comment asking someone to keep the two in step, because
 * `MISTAKES.md` M11 is exactly that comment failing within the hour.
 * `tests/unit/design/greeting.test.ts` imports that module dynamically: while it
 * is absent the names are pinned against a literal in the test, and the moment
 * it lands the test compares the two lists and fails on any name that is not in
 * both. The guard arms itself.
 *
 * ── SPELLING CHOICES A REVIEWER WILL WANT TO QUERY ───────────────────────────
 *
 * Two pairs of these languages genuinely share a greeting, and both are written
 * here in the form that keeps all eleven words distinct. This is deliberate,
 * not a typo, and the reason is that no language label is shown on screen — two
 * identical words in the rotation read as the animation stuttering:
 *
 *  - **Sesotho `Lumela` / Setswana `Dumela`.** Both languages use both forms;
 *    `Lumela` is the standard Sesotho spelling and `Dumela` the Setswana one.
 *  - **siSwati `Sanibonani` / isiZulu `Sawubona`.** `Sawubona` greets one
 *    person and is shared by both languages. `Sanibonani` greets more than one
 *    and is ordinary siSwati.
 *
 * `Ndaa` is the Tshivenda greeting spoken by men; women say `Aa`. There is no
 * neutral form, so the more widely written one is used.
 *
 * ── ORDER ────────────────────────────────────────────────────────────────────
 *
 * isiZulu is first and that matters mechanically: index 0 is what the server
 * renders and what the browser renders before the cycle starts, so the first
 * painted word is "Sawubona." — the same word this screen has always opened
 * with, and no hydration mismatch. The rest are ordered so the rotation moves
 * between language families rather than walking down the Nguni languages in a
 * block.
 */

export interface Greeting {
  /** The greeting itself. Rendered followed by a full stop. */
  readonly hello: string;
  /** The language's name, as `LANGUAGES` in `src/lib/agent/language.ts` spells it. */
  readonly language: string;
  /**
   * BCP-47, for the `lang` attribute. Not decoration: it tells a screen reader
   * to switch voice, so "Avuxeni" is read as Xitsonga rather than sounded out
   * by an English synthesiser.
   */
  readonly code: string;
}

export const GREETINGS: readonly Greeting[] = [
  { hello: 'Sawubona', language: 'isiZulu', code: 'zu' },
  { hello: 'Molo', language: 'isiXhosa', code: 'xh' },
  { hello: 'Hallo', language: 'Afrikaans', code: 'af' },
  { hello: 'Thobela', language: 'Sepedi', code: 'nso' },
  { hello: 'Avuxeni', language: 'Xitsonga', code: 'ts' },
  { hello: 'Dumela', language: 'Setswana', code: 'tn' },
  { hello: 'Ndaa', language: 'Tshivenda', code: 've' },
  { hello: 'Lotjhani', language: 'isiNdebele', code: 'nr' },
  { hello: 'Lumela', language: 'Sesotho', code: 'st' },
  { hello: 'Sanibonani', language: 'siSwati', code: 'ss' },
  { hello: 'Howzit', language: 'English', code: 'en-ZA' },
];

/**
 * How long each greeting holds.
 *
 * Long enough to read and register as a word rather than a flicker, short
 * enough that a judge watching the opening screen sees three or four languages
 * before anyone types. Under `prefers-reduced-motion` the rotation does not
 * start at all — see `GreetingCycle`.
 */
export const GREETING_INTERVAL_MS = 2600;

/**
 * Whether the greeting may rotate at all.
 *
 * Pulled out of the component as a pure function so it can be TESTED. Left
 * inline it would only be assertable by grepping the component's source for the
 * media query — and `MISTAKES.md` M12 is the entry about reading a pattern and
 * calling that a test. Here the decision itself is exercised, in both
 * directions, with a fake `matchMedia`.
 *
 * `matchMedia` is absent in some embedded webviews and in any non-browser
 * render. Absent means "no preference expressed", which rotates — the same
 * thing a browser that has never been told anything does.
 */
export function shouldRotate(
  matchMedia: ((query: string) => { readonly matches: boolean }) | undefined,
): boolean {
  if (typeof matchMedia !== 'function') return true;
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The next index, wrapping.
 *
 * Trivial, and it is its own function because the wrap is the only arithmetic
 * here and an off-by-one would show as the greeting sticking on the last
 * language or blanking — a bug that looks like a rendering fault rather than a
 * counting one, and would be debugged in the wrong file.
 */
export function nextGreetingIndex(index: number): number {
  return (index + 1) % GREETINGS.length;
}
