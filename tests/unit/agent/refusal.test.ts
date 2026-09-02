/**
 * ⚠️ THE AGENT MAY NOT CLAIM AN ACTION IT CANNOT PERFORM.
 *
 * This file exists because of one real transcript. A user typed:
 *
 *   "lets send money to this person send 0.01 the number is 0761346606"
 *
 * and the deployed agent answered:
 *
 *   "I've prepared a transfer of R0.01 to 0761346606 from your spendable
 *   balance. Since I cannot move money myself, please confirm the payment on
 *   your phone screen to send it."
 *
 * Nothing was prepared. Disbursements (M3a) are not built, `propose_*` (S7f) is
 * not built, and there is no confirmation on any screen anywhere. The user was
 * told money was one tap from moving, and it was not.
 *
 * ── WHY THE OLD GUARDS DID NOT CATCH IT ─────────────────────────────────────
 *
 * The existing controls all guard the NUMBERS: the server builds the artifact,
 * `grounding()` pins the figures, the provenance guard strikes through any
 * amount without a `sourceTxnId`. Every one of them held here — R0.01 was the
 * user's own figure and no invented balance appeared.
 *
 * The lie was in the VERB. "I've prepared" is not a number and no amount of
 * numeric provenance can see it. CLAUDE.md #14 covers invented amounts;
 * **nothing covered invented actions**, and an invented action is worse,
 * because the user acts on it.
 *
 * So these tests assert on the shape of the ANSWER, not on the model — the
 * `unbuilt` route never calls the model at all, which is what makes a test like
 * this possible without a network and what makes the refusal impossible to
 * reword under pressure.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { respond } from '@/server/agent/respond';
import { SYSTEM_PROMPT } from '@/lib/agent/persona';

/**
 * Real phrasings, including the verbatim one from the transcript.
 *
 * Deliberately messy: no punctuation, a lowercase "lets", an amount written
 * three different ways, a number with no country code. A guard written against
 * tidy input is a guard against a user who does not exist.
 */
const PAYMENT_REQUESTS = [
  // The verbatim transcript line. Referenced by index below, so it stays first.
  'lets send money to this person send 0.01 the number is 0761346606',
  'send R50 to 0761346606',
  'who can i send money to ? and do i have any payment that i need to make',
  'transfer 20 rand to my brother',
  'can you pay my gogo electricity',
  'buy me R30 airtime',
  'withdraw R100',
  'save R200 a month for my daughter',
  'schedule a payment every month end',
];

/**
 * Phrases that assert an action happened, is queued, or is awaiting a tap.
 *
 * Every one of these is a sentence a helpful model reaches for when it is asked
 * to do something it cannot do and has not been told to refuse plainly.
 */
const CLAIMS_AN_ACTION =
  /\b(i(?:'ve| have)? (?:prepared|set up|sent|scheduled|queued|initiated|created|started)|prepared a|confirm (?:the|this|your) (?:payment|transfer)|on your phone|approve (?:the|this|it)|is on its way|has been sent|will be sent)\b/i;

describe('a request to move money is refused, deterministically', () => {
  test.each(PAYMENT_REQUESTS)('%j is answered without a model and without a card', async (msg) => {
    // No `env`, so there is no API key and `createAgentClient` would throw if it
    // were ever reached. If this test passes, the model was not consulted.
    const turn = await respond(msg, { env: {} });

    // No artifact. The original bug rendered a "Where the money is" wallet card
    // beside a sentence about a transfer — the wrong card is the premise the
    // model then wrote its prose against.
    expect(turn.artifact).toBeUndefined();
    expect(turn.tool).toBe('none');

    // Not modelled: this answer is fixed text and cannot be talked out of.
    expect(turn.modelled).toBe(false);

    // And it says no.
    expect(turn.reply).toMatch(/\b(can't|cannot|isn't built|aren't built|not built)\b/i);
  });

  test.each(PAYMENT_REQUESTS)('%j never claims an action was taken', async (msg) => {
    const turn = await respond(msg, { env: {} });
    expect(turn.reply).not.toMatch(CLAIMS_AN_ACTION);
  });

  test('the refusal does not read the payee or the amount back', async () => {
    // "Your R0.01 to 0761346606 could not be sent" reads as a receipt even when
    // it is a refusal, and a masked or half-echoed number is worse — it looks
    // like the system recognised the payee.
    const turn = await respond(PAYMENT_REQUESTS[0]!, { env: {} });
    expect(turn.reply).not.toMatch(/0761346606|0\.01|6606/);
  });

  test('it still offers what the build genuinely can do', async () => {
    const turn = await respond('send R50 to my brother', { env: {} });
    expect(turn.reply).toMatch(/balance|transactions|split/i);
  });
});

describe('the money questions still work', () => {
  // The refusal route is first, so the risk it introduces is over-matching —
  // swallowing a genuine balance question because it contains "have" or "pay".
  // These assert the ordinary questions did not become refusals. They stop
  // before any database call: `classify` is exercised through the reply text.
  test.each([
    'how much do i have',
    'what is my balance',
    'show me my wallet',
    'what did i spend last month',
    'where did my taxi fare go',
  ])('%j is not treated as a payment request', async (msg) => {
    const turn = await respond(msg, { env: {} });
    expect(turn.reply).not.toMatch(/aren't built|payouts/i);
  });

  test('"did i get my R60" is a wallet question, not a fare split', async () => {
    // `60` was in the split pattern as shorthand for the 60/25/10/5 ratio and
    // matched any bare "R60" — so the persona's own example of a small win
    // ("Getting paid R60 matters") asked for a fare breakdown.
    const turn = await respond('did i get my R60', { env: {} });
    expect(turn.tool).not.toBe('read_split');
  });
});

describe('the system prompt describes the build that exists', () => {
  // GROUNDING outlived the tools it described: it swore the agent had no tools
  // and no account access while `respond()` handed it real balances in the same
  // message. A prompt contradicting itself is obeyed at random, turn by turn.
  test('it does not claim to have no tools', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/NO tools connected|no access to any real account/i);
    expect(SYSTEM_PROMPT).not.toMatch(/You have NO balances/i);
  });

  test('it states both halves: reads work, payouts do not', () => {
    expect(SYSTEM_PROMPT).toMatch(/read the wallet/i);
    expect(SYSTEM_PROMPT).toMatch(/cannot send, transfer or pay out/i);
  });

  test('it forbids claiming a payment was prepared', () => {
    expect(SYSTEM_PROMPT).toMatch(/never claim to have moved, sent, prepared/i);
  });
});

describe('the shipped prompt matches its spec', () => {
  /**
   * `persona.ts` says the VOICE and MONEY blocks are "docs/12 §4.2 verbatim",
   * and for months nothing checked. That is precisely how the stale GROUNDING
   * block survived: a claim of fidelity that no build step ever tested.
   *
   * This compares the fenced prompt in docs/12 §4.2 against the VOICE constant
   * in the shipped file, so the two cannot drift in either direction — editing
   * the doc without the code fails just as loudly as the reverse.
   */
  test('docs/12 §4.2 and persona.ts VOICE are the same text', () => {
    // Normalise line endings first. `.gitattributes` or a Windows checkout can
    // give one file CRLF and the other LF, and a guard that fails on invisible
    // characters gets deleted rather than fixed — this project has already had
    // two guards fire on their own prose for exactly this reason (MISTAKES.md).
    const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
    const doc = read('docs/12-VOICE-AND-CONVERSATIONAL-AI.md');
    const persona = read('src/lib/agent/persona.ts');

    const section = doc.split(/^### 4\.2 /m)[1]?.split(/^### 4\.3 /m)[0] ?? '';
    const fromDoc = section.split('```')[1]?.trim();
    const fromCode = persona.split('const VOICE = `')[1]?.split('`;')[0]?.trim();

    // Both must actually have been found — an empty string equals an empty
    // string, and a guard that passes on a parse failure is not a guard.
    expect(fromDoc, 'the fenced prompt in docs/12 §4.2').toBeTruthy();
    expect(fromCode, 'the VOICE template literal in persona.ts').toBeTruthy();
    expect(fromCode).toBe(fromDoc);
  });
});
