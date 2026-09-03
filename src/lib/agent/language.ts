/**
 * THE LANGUAGE DIRECTIVE. One copy, imported everywhere. (S7g)
 *
 * ── WHY THIS IS A MODULE AND NOT A PARAGRAPH IN `persona.ts` ─────────────────
 *
 * `docs/12` §2 makes a public claim: *"MoMo Kasi understands and replies in
 * every South African language today."* Until this file existed, that claim was
 * carried by two lines inside the VOICE block —
 *
 *     - Match the user's language and register, including code-switching. If
 *       they mix isiZulu and English, you mix isiZulu and English.
 *
 * — and by nothing else. No carve-outs, no test, and an English-only regex layer
 * wrapped around it (see `respond.ts` ROUTES). Two lines of prompt is not a
 * feature; it is a claim.
 *
 * Those two lines have been REMOVED from VOICE rather than left beside this
 * file. A rule stated in two places is a rule that drifts: one copy gets tuned,
 * the other does not, and the user ends up mirrored in chat and answered in
 * English everywhere else — which reads as "this product is not for me".
 * `docs/12` §4.2 was edited in the same commit, because `refusal.test.ts` pins
 * the doc and the code to each other and would otherwise fail.
 *
 * ── MIRRORING, NOT A PICKER ──────────────────────────────────────────────────
 *
 * There is deliberately no language setting anywhere in this product. Real
 * users at a taxi rank code-switch inside a single sentence — *"ngifuna
 * ukukhokha my electricity"* is the example `docs/12` itself uses. A picker
 * forces "pure" output in one direction or the other, and a user reads that as
 * being corrected. Correction reads as judgement. So we match what arrives.
 *
 * ── WHAT THIS FILE CANNOT DO ─────────────────────────────────────────────────
 *
 * It makes the model TRY in eleven languages. It does not make the model GOOD in
 * eleven languages, and instruction-following is not fluency. `EVAL_VERIFIED`
 * below names the ones we have graded evidence for; everything else is declared
 * and unverified, and must be described that way — see `scripts/language-eval.mjs`
 * and `docs/12` §2a.
 */

/**
 * The languages our users actually write in, in the tier order `docs/12` §2 and
 * the Census 2022 first-language shares put them.
 *
 * This array is NOT interpolated into the directive. The directive names each
 * language in its own prose, and `tests/unit/agent/language.test.ts` asserts
 * that every entry here appears there. Build the sentence from the array and the
 * test passes vacuously — it would be checking that a template literal contains
 * its own inputs, which is true no matter what the model is told.
 */
export const LANGUAGES: readonly string[] = [
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
];

/**
 * What we use when there is nothing to mirror.
 *
 * Also the language every term in `DOMAIN_VOCAB` stays in.
 */
export const FALLBACK_LANGUAGE = 'English';

/**
 * The languages a fluent speaker has actually graded (Step 9 of the brief).
 *
 * Everything in `LANGUAGES` that is not in here is DECLARED, NOT VERIFIED. That
 * distinction is not pedantry: model quality falls off sharply for low-resource
 * languages, and Xitsonga, siSwati, Tshivenda and isiNdebele are the four where
 * it is least reliable. Saying "we support eleven languages" without this split
 * is the same category of claim as the spoken-isiZulu one `docs/12` §2 already
 * refuses to make.
 */
export const EVAL_VERIFIED: readonly string[] = ['English', 'isiZulu', 'Afrikaans', 'Setswana'];

/**
 * Terms of art that must survive untranslated inside a sentence in any language.
 *
 * Taken from how the product and its users already talk — `pay-replies.ts`,
 * `tools.ts`, the persona, and `docs/00` — not from a glossary. Translating
 * "stokvel" or "MoMo PIN" into a language nobody says them in makes the advice
 * unactionable: the user cannot match the word to the thing on their handset.
 *
 * Asserted present in the directive by the wiring test.
 */
export const DOMAIN_VOCAB: readonly string[] = [
  // money and MTN
  'R12.50',
  'MoMo',
  'MTN',
  'MoMo PIN',
  'wallet',
  'ledger',
  'escrow',
  'stokvel',
  // kasi terms already used untranslated inside English sentences in this product
  'kasi',
  'spaza',
  'kombi',
  'taxi rank',
  'gogo',
];

/**
 * Literals a machine reads. These NEVER translate, in any language.
 *
 * ── THE SILENT ONE ───────────────────────────────────────────────────────────
 *
 * The highest-severity failure in a multilingual feature is a translated literal
 * that something downstream parses, because nothing throws: the parser stops
 * matching, persistence and dashboards go quiet, and the user still sees a
 * perfectly good answer, so the symptom never points at the cause.
 *
 * TODAY THIS PRODUCT PARSES NOTHING OUT OF MODEL OUTPUT. `gemini.ts` joins the
 * text parts and `respond.ts` takes `text.trim()` as the whole reply — there is
 * no heading, no JSON key, no sentinel and no delimiter read back out. The
 * artifact is built by the server BEFORE the model is called and the model
 * cannot touch it (ADR-0013, ADR-0014), which is why this list is short.
 *
 * It is not empty, though, and the two kinds in it are real:
 *
 *   - COMMANDS the user types back verbatim. `parseCommand` matches
 *     `/^\/([a-z0-9_]+)/`. A model that helpfully offers "/khokha" in an isiZulu
 *     reply has invented a command that does not exist, and the user types it
 *     and gets nothing.
 *   - MTN'S OWN STATUS WORDS, which appear in `/status` text, are the keys of
 *     `REASONS` in `pay-replies.ts`, and are terminal states this project's
 *     vocabulary is defined in terms of (CLAUDE.md).
 *
 * Both are asserted in the wiring test. If a future change starts parsing
 * structure out of a reply — a heading, a JSON block, a tool call in text — it
 * goes in this list on the same day, not after the dashboards go empty.
 */
export const MACHINE_LITERALS: readonly string[] = [
  '/pay',
  '/status',
  '/start',
  '/help',
  '/about',
  'SUCCESSFUL',
  'PENDING',
  'FAILED',
  'REJECTED',
  'TIMEOUT',
  'PAYER_NOT_FOUND',
];

/**
 * The directive itself.
 *
 * Written as a rule about MIRRORING rather than as a list of supported
 * languages, because the list is the part that goes stale and the rule is the
 * part that generalises to the code-switched sentence nobody wrote a rule for.
 *
 * Kept tight on purpose. It rides on every model call, in front of VOICE,
 * CAPABILITY and the ledger grounding, on a free tier with an 8s timeout and an
 * 800-token output budget (`gemini.ts`). Every line here is a line the answer
 * does not get to be.
 */
export const LANGUAGE_DIRECTIVE = `LANGUAGE — MIRROR, DO NOT ASK
Reply in the SAME language the user writes to you in. Our users write in English,
isiZulu, isiXhosa, Afrikaans, Sepedi, Setswana, Sesotho, Xitsonga, siSwati,
Tshivenda and isiNdebele — and many code-switch mid-sentence, like "ngifuna
ukukhokha my electricity". Match how they ACTUALLY write, code-switching
included. Never "correct" them into formal English or into formal vernacular,
never translate their own message back at them, and never comment on or announce
their language choice.

KEEP THESE IN ENGLISH, even inside a sentence in another language. Translating
them makes the answer harder to act on, not easier:
- rand amounts exactly as written — R12.50, never converted or reworded
- MoMo, MTN, MoMo PIN, wallet, ledger, escrow, stokvel
- kasi, spaza, kombi, taxi rank, gogo
- anything the user types or taps back: /pay, /status, /start, /help, /about
- MTN's own status words: SUCCESSFUL, PENDING, FAILED, REJECTED, TIMEOUT, and
  reason codes such as PAYER_NOT_FOUND

NEVER TRANSLATE SOMEONE'S OWN WORDS. If you repeat back what a user said, a
transcript, a name, or a line out of the LEDGER DATA below, keep it verbatim in
the language it arrived in, code-switching intact. Do not clean it up, do not
summarise it, do not translate it.

If their language is genuinely ambiguous, or they have written nothing for you to
match, use English.

YOUR SUBSTANCE NEVER CHANGES WITH LANGUAGE. The reasoning, the structure, the
refusals and the recommendation are identical in isiZulu and in English. A
shorter, vaguer or more cautious answer in someone's own language is the exact
failure this rule exists to prevent.`;
