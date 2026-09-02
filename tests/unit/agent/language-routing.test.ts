/**
 * ⚠️ THE REFUSAL MUST BE AS DETERMINISTIC IN isiZULU AS IT IS IN ENGLISH.
 *
 * `refusal.test.ts` is the English half of this and it exists because of one real
 * transcript: a user asked to send money, and the deployed agent answered *"I've
 * prepared a transfer of R0.01 … please confirm the payment on your phone"*.
 * Nothing was prepared. The fix was the `unbuilt` route — fixed text, no model
 * call, a refusal that cannot be reworded because there is nothing to reword it.
 *
 * That fix was keyed on English verbs. `send`, `transfer`, `pay`, `withdraw`.
 *
 * So *"Ngicela ukuthumela u-R5 kubhuti wami"* matched nothing, fell past the
 * refusal to `none`, and reached the model with no card and no fixed answer in
 * front of it — the exact configuration that produced the original lie. The
 * English speaker got a structural guarantee. Everybody else got a prompt and a
 * hope.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `language.test.ts` ──────────────────────
 *
 * That file asserts the directive is WIRED IN. This one asserts the code around
 * it actually COVERS the languages the directive promises. They fail for
 * different reasons and a reviewer should be able to tell which broke: a red
 * `language.test.ts` means the prompt stopped being sent; a red
 * `language-routing.test.ts` means a word list stopped matching.
 *
 * Every assertion here is offline. `respond()` is called with `env: {}`, so
 * `createAgentClient` would throw if the model were ever reached — which is the
 * point, and is what makes "no model was consulted" a testable claim.
 */

import { describe, expect, test } from 'vitest';
import { respond } from '@/server/agent/respond';
import { EVAL_MESSAGES } from '../../eval/language/fixtures';

/** Reused verbatim from `refusal.test.ts`. The lie is in the verb, not the number. */
const CLAIMS_AN_ACTION =
  /\b(i(?:'ve| have)? (?:prepared|set up|sent|scheduled|queued|initiated|created|started)|prepared a|confirm (?:the|this|your) (?:payment|transfer)|on your phone|approve (?:the|this|it)|is on its way|has been sent|will be sent)\b/i;

const REFUSALS = EVAL_MESSAGES.filter((m) => m.mustRefuse);
const QUESTIONS = EVAL_MESSAGES.filter((m) => !m.mustRefuse);

describe('a request to move money is refused in every language we claim', () => {
  test.each(REFUSALS.map((m) => [m.language, m.text] as const))(
    '%s: %j never reaches the model',
    async (_language, text) => {
      const turn = await respond(text, { env: {} });

      // No card. The original bug rendered a "Where the money is" wallet card
      // beside a sentence about a transfer, and the wrong card is the premise the
      // model then writes its prose against.
      expect(turn.artifact).toBeUndefined();
      expect(turn.tool).toBe('none');

      // Fixed text. Not "the model was told to refuse" — the model was not asked.
      expect(turn.modelled).toBe(false);
    },
  );

  test.each(REFUSALS.map((m) => [m.language, m.text] as const))(
    '%s: %j is answered with an actual no',
    async (_language, text) => {
      const turn = await respond(text, { env: {} });
      expect(turn.reply).toMatch(/\b(can't|cannot|isn't built|aren't built|not built)\b/i);
      expect(turn.reply).not.toMatch(CLAIMS_AN_ACTION);
    },
  );

  test('the code-switched sentence docs/12 uses as its own example is refused', async () => {
    // "ngifuna ukukhokha my electricity" — half isiZulu, half English, and the
    // reason there is no language picker in this product. A picker would have
    // forced this user to declare a language they are not writing in.
    const turn = await respond('ngifuna ukukhokha my electricity', { env: {} });
    expect(turn.modelled).toBe(false);
    // And it must be the ELECTRICITY refusal, not the generic payout one — the
    // sub-classifier chooses which true sentence a person reads.
    expect(turn.reply).toMatch(/airtime or electricity/i);
  });

  test('the isiZulu refusal is the same text as the English one', async () => {
    // ACCEPTED GAP, asserted rather than assumed (see `unbuiltProse`). The router
    // understands eleven languages; the refusal answers in one, because the only
    // translator available is the model and this is the one sentence the model is
    // not allowed to write. If that ever changes, this test is where it shows up.
    const [en, zu] = await Promise.all([
      respond('Send R5 to my brother', { env: {} }),
      respond('Ngicela ukuthumela u-R5 kubhuti wami', { env: {} }),
    ]);
    expect(zu.reply).toBe(en.reply);
  });
});

describe('the read tools are reachable in every language we claim', () => {
  test.each(QUESTIONS.map((m) => [m.language, m.text, m.tool] as const))(
    '%s: %j routes to %s',
    async (_language, text, tool) => {
      // A ledger read failing is caught inside `respond` and does not change the
      // routing decision, so this asserts `classify` end to end with no database.
      const turn = await respond(text, { env: {} });
      expect(turn.tool).toBe(tool);
    },
  );

  test('a balance question in isiZulu is not mistaken for a payment', async () => {
    // The risk of extending the `unbuilt` route is over-matching: it runs first,
    // so a stem that is too greedy turns an ordinary question into a refusal.
    // "izinkokhelo" (payments) must not trip `khokh[ae]\b`.
    const turn = await respond('Ngikhombise izinkokhelo zami', { env: {} });
    expect(turn.reply).not.toMatch(/aren't built|payouts/i);
  });

  test('"mali" does not match inside English words', async () => {
    // `\b(?:i|ne|ye|ze|kwe|nge|se)?mali\b` rather than a bare `mali`, which is a
    // substring of "normalise", "formality" and "Somalia". A wallet card in
    // answer to "can you normalise this" is the tell of a stem with no anchors.
    for (const text of ['please normalise the format', 'that is a formality']) {
      const turn = await respond(text, { env: {} });
      expect(turn.tool, `${text} matched the wallet route`).toBe('none');
    }
  });

  test('a Sesotho greeting is not answered with a refusal to send money', async () => {
    // "Rumela" is Tshivenda for "send" AND a Sotho greeting. It is deliberately
    // absent from the unbuilt route: answering "Rumela!" with "I can't send money
    // to anyone yet" is worse than not matching at all. Named here so nobody
    // helpfully adds it back.
    for (const greeting of ['Rumela', 'Dumela', 'Lumela']) {
      const turn = await respond(greeting, { env: {} });
      expect(turn.reply, `${greeting} was treated as a payment request`).not.toMatch(
        /aren't built|payouts/i,
      );
    }
  });
});
