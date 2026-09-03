/**
 * THE LANGUAGE EVAL SET. (docs/12 §2a)
 *
 * ── WHAT THE OTHER TESTS PROVE, AND WHAT THEY DO NOT ─────────────────────────
 *
 * `language.test.ts` proves the directive is wired in. `language-routing.test.ts`
 * proves the deterministic layer covers the languages the directive promises.
 * Neither is evidence that the model is any good in isiZulu.
 *
 * Instruction-following is not fluency. Model quality falls off sharply between
 * high-resource and low-resource languages, and a model will cheerfully obey
 * "reply in isiZulu" while producing isiZulu that a first-language speaker reads
 * as machine-translated English — grammatical enough to pass any assertion in
 * this repository, wrong enough to be insulting. No automated test can see that.
 * A person who speaks the language has to read it. That is what
 * `npm run eval:language` is for, and this is what it asks.
 *
 * ── WHY EVERY LANGUAGE ASKS THE SAME SIX QUESTIONS ───────────────────────────
 *
 * Because the third grading criterion is *did the substance survive* — is the
 * isiZulu answer as specific, as correct and as useful as the English answer to
 * the same question. That is only answerable if it IS the same question, so
 * `language.test.ts` asserts the `id` sets match across languages. Fixtures that
 * drift per language make the eval unfalsifiable.
 *
 * ── WHY THE DATA IS JSON AND THIS FILE IS A WRAPPER ──────────────────────────
 *
 * `scripts/language-eval.mjs` is plain Node and cannot import a `.ts` module that
 * uses extensionless specifiers. Rather than keep a second copy of the messages
 * in the script — which would drift, and would drift silently, since nothing
 * compares them — the data lives in `messages.json` and both sides read it.
 *
 * This file is `.ts` and not `.test.ts` on purpose: `npm test` must never pick it
 * up, because grading needs a live model call, an API key and quota
 * (CLAUDE.md #7), and a human.
 */

import raw from './messages.json';

export interface EvalMessage {
  /** Shared across languages — this is what makes two answers comparable. */
  readonly id: string;
  readonly language: string;
  readonly text: string;
  /**
   * What `classify()` must route this to, asserted offline by
   * `tests/unit/agent/language-routing.test.ts`.
   *
   * The router is deterministic, so its coverage is testable with no network at
   * all. Only the PROSE needs a human.
   */
  readonly tool: 'read_wallet' | 'read_transactions' | 'read_split' | 'none';
  /** True when the only acceptable answer is a refusal (CLAUDE.md #11). */
  readonly mustRefuse?: boolean;
  /** Why this row is here, when it is not obvious. Shown in the grading sheet. */
  readonly note?: string;
}

const TOOLS = new Set(['read_wallet', 'read_transactions', 'read_split', 'none']);

/**
 * Validated rather than cast.
 *
 * A JSON import is `any` shaped like hope. `as EvalMessage[]` would make a typo
 * in `messages.json` — `"read_wallets"`, a missing `language` — into a test that
 * passes while grading the wrong thing, which is the failure this whole feature
 * is about in miniature. So the shape is checked once, at import, and a bad row
 * fails loudly at the first test that touches it.
 */
function validate(rows: unknown): readonly EvalMessage[] {
  if (!Array.isArray(rows)) throw new TypeError('messages.json is not an array');

  return rows.map((row, i) => {
    const r = row as Record<string, unknown>;
    for (const field of ['id', 'language', 'text', 'tool'] as const) {
      if (typeof r[field] !== 'string') {
        throw new TypeError(`messages.json[${i}]: ${field} must be a string`);
      }
    }
    if (!TOOLS.has(r.tool as string)) {
      throw new TypeError(`messages.json[${i}]: unknown tool ${JSON.stringify(r.tool)}`);
    }
    return {
      id: r.id as string,
      language: r.language as string,
      text: r.text as string,
      tool: r.tool as EvalMessage['tool'],
      ...(r.mustRefuse === true ? { mustRefuse: true as const } : {}),
      ...(typeof r.note === 'string' ? { note: r.note } : {}),
    };
  });
}

/**
 * Six questions × the four languages in `EVAL_VERIFIED`.
 *
 * English is the baseline and the language the domain vocabulary lives in.
 * isiZulu because `docs/12` calls it the demo language. Afrikaans because it has
 * the best model fluency of the SA languages and is therefore the cheapest
 * quality win available. Setswana as the Sotho-Tswana representative — the group
 * most heavily code-switched in the Gauteng urban mix, and the case mirroring
 * handles that a picker never would.
 *
 * The six questions cover one of each failure this feature can have:
 *
 *   balance / activity / fare  — does a real tool still get reached
 *   payment                    — is the REFUSAL as firm in isiZulu as in English
 *   codeswitch                 — the mixed sentence a picker could not serve
 *   capability                 — an open question, where substance drift hides
 */
export const EVAL_MESSAGES: readonly EvalMessage[] = validate(raw);
