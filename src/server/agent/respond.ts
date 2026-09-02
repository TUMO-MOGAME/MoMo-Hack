/**
 * THE AGENT CORE. One implementation, both channels (S7a).
 *
 * The web chat and the Telegram bot call THIS. That is what makes "they should
 * both work the same and respond the same" a property of the code rather than a
 * promise two handlers make separately and drift apart on. A channel is a
 * renderer: web draws the artifact as components, Telegram draws it as text.
 * The decision, the data and the words are made once, here.
 *
 * ── THE SAFETY PROPERTY, AND IT IS THE WHOLE DESIGN ──────────────────────────
 *
 * **The server builds the artifact. The model writes the prose.**
 *
 * The model is called AFTER the ledger has been read and the artifact is
 * assembled. It never constructs an amount, because it never constructs an
 * artifact — there is no code path from a generated token to a rand value.
 * CLAUDE.md #14 stops being a rule the prompt asks for and becomes a shape the
 * program has.
 *
 * It also means intent routing is DETERMINISTIC. "How much do I have" reaches
 * `read_wallet` through a regex, not through a model deciding to call a tool.
 * A model that mis-routes shows the wrong card; a model that could choose its
 * own tools could be talked into choosing a dangerous one. There are no write
 * tools here at all, which is the other half of ADR-0014.
 *
 * ── IT MUST ANSWER EVEN WHEN THE MODEL DOES NOT ──────────────────────────────
 *
 * Gemini is a network call on a free tier, behind conference wifi, with about
 * 4.5s of headroom under the Vercel Hobby ceiling. So the model is an
 * ENHANCEMENT: every intent has a deterministic sentence built from the same
 * real data, and if the model is slow, rate-limited, unconfigured or wrong, the
 * user still gets a correct answer with the correct card. Silence is the one
 * outcome that is not allowed.
 */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { createAgentClient, type AgentMessage } from '@/lib/agent/gemini';
import { SYSTEM_PROMPT } from '@/lib/agent/persona';
import { log, scrub } from '@/server/log';
import { readFareSplit, readTransactions, readWallet } from './tools';

export interface AgentTurn {
  readonly reply: string;
  readonly artifact?: Artifact;
  /** Which tool ran. Logged, and shown in the demo so nothing looks like magic. */
  readonly tool: string;
  /** True when the prose came from the model rather than the fallback. */
  readonly modelled: boolean;
}

export interface RespondOptions {
  readonly history?: readonly AgentMessage[];
  readonly env?: Record<string, string | undefined>;
}

type Intent = 'wallet' | 'transactions' | 'split' | 'unbuilt' | 'none';

/**
 * Deterministic routing. Order matters — the first match wins, so the more
 * specific patterns come first.
 *
 * ── WHY `unbuilt` IS FIRST, AND WHY IT EXISTS AT ALL ─────────────────────────
 *
 * *"lets send money to this person send 0.01 the number is 0761346606"* used to
 * reach `wallet`, because the word **money** is in the wallet pattern. So the
 * server dutifully read the ledger, built a "Where the money is" card, handed it
 * to the model — and the model, asked to write prose for a payment request while
 * looking at a balance, replied:
 *
 *   *"I've prepared a transfer of R0.01 to 0761346606 … please confirm the
 *   payment on your phone screen to send it."*
 *
 * Nothing was prepared. There is no transfer, no proposal, no confirmation, no
 * phone screen — disbursements (M3a) are not built and `propose_*` (S7f) is not
 * built. The card beside that sentence said "Where the money is", which is not
 * what the sentence claimed to be showing.
 *
 * Two lessons, and the second is the general one:
 *
 * 1. **A request to DO something must never route to a tool that READS
 *    something.** The wrong card is not a cosmetic problem; it is the premise
 *    the model writes its prose against, and it will write prose that fits the
 *    card rather than the truth.
 * 2. **The deterministic answer is the safety mechanism, not the fallback.**
 *    For anything unbuilt there is nothing true for a model to add, so this
 *    intent does not call the model at all. A refusal that cannot be
 *    reworded cannot be talked out of.
 *
 * This costs one regex and closes the whole class: every unbuilt verb lands on a
 * fixed sentence with no artifact. When M3a lands, `send` moves out of here into
 * a real `propose_transfer` — and not one hour before.
 */
/**
 * ── LANGUAGE AUDIT (docs/12 §2a, brief step 6) ──────────────────────────────
 *
 * THE PROMPT LAYER IS MULTILINGUAL. THIS LAYER WAS NOT, AND THIS LAYER DECIDES
 * WHETHER A PAYMENT REQUEST IS REFUSED.
 *
 * `LANGUAGE_DIRECTIVE` makes the model mirror eleven languages. Every pattern
 * below used to be keyed on English verbs, which made this a two-tier product
 * in the worst possible place:
 *
 *   *"ngicela ukuthumela imali ku-0761346606"* matched NOTHING. Not `send`, not
 *   `transfer`, not `pay`. So it fell past the `unbuilt` route to `none`, and
 *   the model was asked to write prose about a payment request with no card and
 *   no refusal in front of it — the exact configuration that produced *"I've
 *   prepared a transfer of R0.01…"* in MISTAKES.md M10 and `refusal.test.ts`.
 *
 * An English speaker got the STRUCTURAL guarantee: fixed text, no model call, a
 * refusal that cannot be reworded. An isiZulu speaker got the PROMPT guarantee,
 * which is the one we already know is not enough — that is why this route
 * exists at all. Same product, same question, two different safety levels,
 * chosen by which language you happen to write in.
 *
 * And it concealed itself. `agent.intent.unbuilt` would have reported a clean
 * 0% fire rate for non-English traffic, which reads as "no payment requests"
 * when it actually means "not measured". `classify` now returns which pattern
 * family matched and `respond` logs it, so the gap can be seen rather than
 * inferred.
 *
 * DECISION: extend the patterns. Not a model-based classifier — this route's
 * whole value is that it never reaches a model, so a refusal cannot be talked
 * out of being a refusal. Not an accepted gap either: CLAUDE.md #11 does not
 * have an English-only clause.
 *
 * ── HOW THE `also` PATTERNS ARE BUILT, AND THEIR LIMITS ─────────────────────
 *
 * They are STEMS, not whole words. `\b` is an ASCII word boundary and the Nguni
 * and Sotho-Tswana languages agglutinate: "ukuthumela", "ngithumele" and
 * "thumela" are one verb wearing three prefixes, and `\bthumela\b` matches only
 * the bare form nobody actually types. So the verbs match on stem + inflection
 * (`thumel[ae]\b`) and the nouns match on stem + the concords that attach to
 * them (`(?:i|ne|ye|ze|kwe|nge|se)?mali\b`).
 *
 * Two things they deliberately do NOT do:
 *
 *  1. **No bare `mali`.** It is a substring of "normalise", "formality" and
 *     "Somalia". The concord alternation above anchors both ends instead.
 *  2. **No `rumela`.** It is Tshivenda for "send" AND a Sesotho/Sepedi greeting
 *     — "Rumela!" would be answered with "I can't send money to anyone yet",
 *     which is worse than not matching. Tshivenda keeps `badel[ae]` and
 *     `\brenga\b`; its send verb is an accepted gap, named here so the next
 *     person does not "fix" it back in.
 *
 * THESE WORD LISTS ARE DERIVED, NOT VALIDATED. They came from the vocabulary
 * already in this product (`mock.ts` has carried "ngingakanani", "umgalelo" and
 * "khokha" since S7a) plus the obvious money verbs — not from a native speaker.
 * `npm run eval:language` is where they get graded, and only English, isiZulu,
 * Afrikaans and Setswana are graded today (`EVAL_VERIFIED`). The other seven
 * are attempted, not verified, and docs/12 §2a says so in public.
 */
interface Route {
  readonly intent: Intent;
  /** English — the original patterns, unchanged. Their comments are scar tissue. */
  readonly test: RegExp;
  /** Every other language in LANGUAGES. Kept separate so the two review separately. */
  readonly also: RegExp;
}

const ROUTES: readonly Route[] = [
  {
    intent: 'unbuilt',
    // `\d+`, not `\d`: the trailing `\b` cannot follow a single digit inside a
    // longer number, so `save R2|00` failed to match "save R200 a month" and
    // that request fell through to the generic fallback. Caught by the test.
    test: /\b(send|sending|transfer|pay|paying|payout|withdraw|cash ?out|eft|deposit|top ?up|buy|purchase|schedule|automate|remind|save (?:me |up )?r?\d+)\b/i,
    // send · pay · buy · withdraw · save, in the other ten.
    //
    // `khokh[ae]\b` and not `khokh`: the noun "izinkokhelo" (payments) must NOT
    // land here. That is the isiZulu spelling of the `\btransaction\b`-cannot-
    // match-"transactions" bug two routes down — a stem that swallows the plural
    // noun turns "show me my payments" into a refusal.
    also: new RegExp(
      [
        // Nguni: isiZulu, isiXhosa, siSwati, isiNdebele
        'thumel[ae]\\b',
        'tfumel[ae]\\b',
        'khokh[ae]\\b',
        'hlawul[ae]\\b',
        'theng[ae]\\b',
        'londoloz[ae]\\b',
        // Sotho-Tswana: Sepedi, Setswana, Sesotho
        'romel[ae]\\b',
        'patal[ae]\\b',
        'bolok[ae]\\b',
        '\\bduel[ae]\\b',
        '\\blefa\\b',
        '\\breka\\b',
        // Afrikaans
        '\\bstuur',
        'betaal',
        'oorbetaal|oorplaas|oordrag',
        '\\bkoop\\b|aankoop',
        'onttrek',
        '\\bspaar',
        'skeduleer|herinner',
        // Xitsonga, Tshivenda
        'rhumel[ae]\\b',
        'hakel[ae]\\b',
        'badel[ae]\\b',
        '\\bxava\\b',
        '\\brenga\\b',
      ].join('|'),
      'i',
    ),
  },
  {
    intent: 'split',
    // `60` was here as shorthand for the 60/25/10/5 ratio, and it matched any
    // bare "R60" — so "did I get my R60" asked for a fare breakdown. It now
    // only matches as part of a written ratio.
    test: /\b(split|fare|taxi|divide|breakdown|60\s*[/:]\s*25|where did.*(go|money))\b/i,
    // "tekisi" is the taxi in isiZulu, isiXhosa and the Sotho-Tswana group alike,
    // and it carries most of this route on its own. `\bkarolo\b` (share/part) is
    // spelled out rather than stemmed as `arol`, which is inside "parole".
    also: /hlukanis|verdeel|opdeel|tekisi|\barola\b|\bkarolo\b|\bavanyis/i,
  },
  {
    intent: 'transactions',
    // `s?` before every closing boundary, and it is not cosmetic: `\btransaction\b`
    // does NOT match "transactions", because the boundary must fall between "n"
    // and "s" and both are word characters. So *"show me my transactions"* — the
    // most natural way anyone asks this — routed to `none` and got the generic
    // "I can show you your balance…" reply while a perfectly good tool sat
    // unused. Found by reading a real reply, not by reading the regex.
    //
    // Same shape as the `\d` vs `\d+` bug in the route above. A trailing `\b`
    // after a singular noun is a plural-shaped hole, every time.
    test: /\b(transactions?|payments?|spent|spend|history|activity|activities|statements?|last month|three months|3 months|recent)\b/i,
    // The noun forms the `unbuilt` route above is careful to leave alone.
    also: /transaksie|geskiedenis|uitgawe|bestee|onlangs|umlando|nkokhel|dipatel|ditef|ditshenyegelo|\bhistori/i,
  },
  {
    intent: 'wallet',
    test: /\b(balances?|wallets?|how much|money|afford|have|left)\b/i,
    // "money" in ten languages, plus "how much". The concord alternation on
    // `mali` is what keeps this out of "normalise" and "Somalia" — see the
    // header comment.
    also: /\b(?:i|ne|ye|ze|kwe|nge|se)?mali\b|\bmalini\b|ngakanani|bhalansi|sikhwama|\bgeld\b|\bbalans\b|\bsaldo\b|hoeveel|beursie|\bmadi\b|t[sš]helete|chelete|tshelede|bokae/i,
  },
];

/** Which pattern family answered. `multi` means "any language but English". */
type Matched = 'en' | 'multi' | 'none';

/**
 * Deterministic routing, now in eleven languages.
 *
 * BOTH patterns are tested against the SAME string, which is what makes a
 * code-switched sentence work without a single line of special handling:
 * *"ngifuna ukukhokha my electricity"* — docs/12's own example — matches
 * `khokh[ae]\b` on the isiZulu half, and would equally have matched `pay` if the
 * user had written the verb in English. Mirroring is not a mode we enter.
 *
 * `matched` is returned rather than discarded so `respond` can log it. Without
 * it, a non-English speaker who is never routed anywhere is indistinguishable
 * in the drain from a non-English speaker who never asked.
 */
function classify(message: string): { intent: Intent; matched: Matched } {
  for (const route of ROUTES) {
    if (route.test.test(message)) return { intent: route.intent, matched: 'en' };
    if (route.also.test(message)) return { intent: route.intent, matched: 'multi' };
  }
  return { intent: 'none', matched: 'none' };
}

/**
 * The answer for something this build cannot do.
 *
 * Fixed strings, chosen deterministically, and **the model is never called** —
 * see the ROUTES docstring. Each one names the limit, says it is not built, and
 * offers the nearest real thing, because "no" on its own is a dead end in a chat
 * whose whole job is to be useful.
 *
 * None of them acknowledges an amount or a payee. Repeating *"your R0.01 to
 * 0761346606"* back at someone reads as a receipt even when the sentence around
 * it is a refusal, and that is the exact confusion this route exists to end.
 *
 * ── ACCEPTED GAP: THESE SENTENCES ARE ENGLISH, IN EVERY LANGUAGE ────────────
 *
 * The router now understands eleven languages; the refusal answers in one. So
 * someone who writes *"ngicela ukuthumela imali"* is correctly refused — in
 * English. That is a real mirroring failure and it is chosen, not overlooked.
 *
 * The alternative is worse. The model is the only translator we have, and this
 * route exists precisely BECAUSE the model may not write this sentence: a
 * refusal it can reword is a refusal it can be talked out of (MISTAKES.md M10).
 * Shipping machine-translated safety text in ten languages nobody on this team
 * reads is how a refusal quietly becomes a maybe. Fixed English that is
 * correct beats fluent isiZulu that might not be.
 *
 * USER-VISIBLE CONSEQUENCE: an isiZulu, Sesotho or Afrikaans speaker asking to
 * send money gets a safe, accurate, English answer where the rest of the
 * product would have mirrored them.
 *
 * THE FIX, when it comes: verified translations from a native speaker, one
 * language at a time, gated on `EVAL_VERIFIED` — never on a model call. Same
 * applies to HELP_TEXT, ABOUT_TEXT, `denialText` and `pay-replies.ts`, which
 * are English for the same reason and none of which a model may rewrite.
 */
function unbuiltProse(message: string): string {
  // Same audit as ROUTES. These two sub-patterns choose WHICH refusal a person
  // reads, so an unmatched non-English request got the generic payout sentence
  // when it had asked about airtime — correct, but not an answer to the
  // question. Both are extended; the refusals themselves stay English, and that
  // is an accepted gap stated in full below.
  if (
    /\b(schedule|automate|remind|every (month|week|day)|save (?:me |up )?r?\d)\b/i.test(message) ||
    /\bspaar|skeduleer|herinner|elke maand|bolok[ae]\b|londoloz[ae]\b|njalo nge(nyanga|sonto)/i.test(
      message,
    )
  ) {
    return "I can't set up anything that runs on its own yet — scheduled and recurring payments aren't built. What I can do right now is show you your balance, your recent transactions, or how a taxi fare splits.";
  }
  if (
    /\b(buy|purchase|top ?up|airtime|electricity|data)\b/i.test(message) ||
    // "airtime" is airtime in every South African language. Electricity is not:
    // ugesi · motlakase · mohlagase · elektrisiteit · krag.
    /theng[ae]\b|\breka\b|\bkoop\b|\bxava\b|\brenga\b|ugesi|m[ou]tlakase|mohlagase|elektrisiteit|\bkrag\b/i.test(
      message,
    )
  ) {
    // ⚠️ The multilingual CONDITION is taken from `feat/language-mirroring`; the
    // SENTENCE is not. That branch predates #43 and #45 and its version added
    // "Money can come into this ledger, but nothing can go out of it yet" —
    // which #45 removed precisely because it stopped being true when
    // disbursements landed (M3a). Merging the branch whole would have
    // reinstated the expired claim, for the fourth time this pattern has bitten.
    return "I can't buy airtime or electricity yet — that part isn't built. I can show you your balance, your recent transactions, or how a taxi fare splits.";
  }
  // ── THIS SENTENCE HAD EXPIRED, AND THAT IS M10's SECOND CAUSE AGAIN ────────
  //
  // It used to say *"Payouts aren't built — money can come into this ledger and
  // cannot yet leave it."* True when written; false from M3a. `/send` exists,
  // works, and posts a payout journal. A refusal that gives a reason which has
  // stopped being true is still a false statement, and the next person reads it
  // and stops checking.
  //
  // What has NOT changed, and never will, is the part that matters: **the agent
  // cannot move money** (CLAUDE.md #11, ADR-0014). That is a permanent property
  // of this build, not a build state — `respond()` has no write tools and does
  // not import the payment module. So the refusal stands; only its reason is
  // corrected, from "payouts don't exist" to "I am not the thing that does it".
  //
  // It deliberately does NOT tell the user to go and type `/send`. Answering a
  // free-text payment request with a working command is an invitation dressed
  // as a refusal, and this route exists precisely because that user was about
  // to be told money was one tap away.
  return "I can't send money — I have no way to move it, by design, so nothing has been set up and nothing is waiting for you to confirm. What I can do is show you your balance, your recent transactions, or how a taxi fare splits.";
}

/** Total of a wallet artifact's spendable rows. Bigint arithmetic, never float. */
function spendable(artifact: Artifact): bigint {
  if (artifact.type !== 'wallet') return 0n;
  return artifact.balances
    .filter((b) => b.kind === 'WALLET')
    .reduce((total, b) => total + (b.money.amount as bigint), 0n);
}

/**
 * The sentence the user gets when the model cannot be reached.
 *
 * Built from the SAME artifact the model would have been given, so it is never
 * less accurate than the modelled answer — only less warm.
 */
function fallbackProse(intent: Intent, artifact: Artifact | null): string {
  if (!artifact) {
    return intent === 'split'
      ? 'No money has moved yet, so there is no real fare to split. Once a payment settles I can show you exactly where every cent went.'
      : "I can show you your balance, your recent transactions, or how a taxi fare splits. Ask me for any of those and I'll pull it straight from the ledger.";
  }

  if (artifact.type === 'wallet') {
    const total = spendable(artifact);
    return total > 0n
      ? `You have ${formatZAR(total as Minor)} spendable right now. The card beside this breaks down where the rest of the money is sitting.`
      : 'Nothing spendable yet — the card shows where the money that has moved is currently held.';
  }

  if (artifact.type === 'transactions') {
    const n = artifact.items.length;
    return n === 0
      ? "There's nothing in the ledger for that period yet."
      : `Here are your last ${n} transaction${n === 1 ? '' : 's'}, straight from the ledger. Every amount traces back to a journal that sums to zero.`;
  }

  if (artifact.type === 'split-breakdown') {
    return `That ${formatZAR(artifact.fare.amount as Minor)} divides 60 / 25 / 10 / 5 — owner, driver, fuel, insurance. Integer cents, so nothing is ever invented or lost in the rounding.`;
  }

  return 'Here is what the ledger says.';
}

/**
 * What the model is allowed to know about the numbers.
 *
 * Rendered from the artifact, so the model sees exactly the figures the user
 * will see on the card. It is told to use these and no others — but the
 * important part is that even if it ignores that, it cannot change the card.
 */
function grounding(artifact: Artifact | null): string {
  if (!artifact) return 'You have no ledger data for this question. Do not state any amount.';

  const lines: string[] = [];
  if (artifact.type === 'wallet') {
    for (const b of artifact.balances) {
      lines.push(`${b.label}: ${formatZAR(b.money.amount as Minor)}`);
    }
  } else if (artifact.type === 'transactions') {
    for (const t of artifact.items.slice(0, 8)) {
      lines.push(
        `${t.at.slice(0, 10)} ${t.label} ${formatZAR(t.money.amount as Minor)} ${t.status}`,
      );
    }
  } else if (artifact.type === 'split-breakdown') {
    lines.push(`Fare ${formatZAR(artifact.fare.amount as Minor)}`);
    for (const p of artifact.parts) {
      lines.push(`${p.label} ${formatZAR(p.money.amount as Minor)} (${p.bps / 100}%)`);
    }
  }

  return [
    'LEDGER DATA — these figures are already on screen beside your reply.',
    'Use ONLY these numbers. Do not calculate new ones. Do not round them.',
    '',
    ...lines,
  ].join('\n');
}

async function fetchArtifact(intent: Intent): Promise<Artifact | null> {
  if (intent === 'wallet') return readWallet();
  if (intent === 'transactions') return readTransactions();
  if (intent === 'split') return readFareSplit();
  return null;
}

export async function respond(message: string, options: RespondOptions = {}): Promise<AgentTurn> {
  const { intent, matched } = classify(message);

  // WHICH LANGUAGE FAMILY ROUTED THIS, on every turn including `none`.
  //
  // Before this line, a non-English question that matched nothing was logged
  // identically to an English one that matched nothing, so the coverage gap
  // reported as silence. `matched: "none"` climbing while `multi` stays at zero
  // is the shape of a word list that needs a word, and it is now visible in the
  // drain instead of inferable only from a user complaint we will not get.
  //
  // The message itself is NOT logged — three enum values, no content, no PII.
  log('info', 'agent.intent', { intent, matched });

  // Asked to DO something that does not exist. Answer and stop — no ledger read,
  // so there is no card to write misleading prose against, and no model call, so
  // there is nothing to talk into rewording the refusal. This return is the only
  // thing standing between a payment request and an invented receipt, so it is
  // deliberately the shortest path in the function.
  if (intent === 'unbuilt') {
    log('info', 'agent.intent.unbuilt', { matched });
    return { reply: unbuiltProse(message), tool: 'none', modelled: false };
  }

  let artifact: Artifact | null = null;
  try {
    artifact = await fetchArtifact(intent);
  } catch (e) {
    // A ledger read failing must not take the conversation down with it.
    log('error', 'agent.tool.failed', {
      tool: intent,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  const fallback = fallbackProse(intent, artifact);

  let reply = fallback;
  let modelled = false;
  try {
    const client = createAgentClient(options.env ?? process.env);

    // ── NOTHING LEAVES FOR GOOGLE WITH A PHONE NUMBER IN IT (A5-02) ───────────
    //
    // `scrub()` masks a bare 9-15 digit run to its last four. It was written for
    // the log drain and, until the A5 audit, was applied ONLY there — so the
    // logger was careful and the outbound prompt was not, which is the wrong way
    // round: a log line stays on our infrastructure, a prompt goes to a third
    // party and may be retained by them.
    //
    // This is not hypothetical. The transcript behind MISTAKES.md M10 —
    // *"send 0.01 the number is 0761346606"* — put a real South African mobile
    // number in a user message, and it was transmitted verbatim. POPIA s105/106.
    //
    // Applied to the HISTORY too, not just the current turn: the client sends
    // the last 8 messages back with every request, so an unscrubbed number would
    // otherwise be re-transmitted on every subsequent turn of the conversation.
    // The scrubber deliberately spares uuids (see its lookaround), so grounding
    // ids survive.
    const history: AgentMessage[] = [
      { role: 'user', text: `${SYSTEM_PROMPT}\n\n${grounding(artifact)}` },
      ...(options.history ?? []).map((m) => ({ role: m.role, text: scrub(m.text) })),
      { role: 'user', text: scrub(message) },
    ];
    const text = await client.reply(history);
    if (text.trim().length > 0) {
      reply = text.trim();
      modelled = true;
    }
  } catch (e) {
    // Unconfigured, rate-limited, slow, or refusing. The deterministic sentence
    // already in `reply` is correct; the user never sees a failure.
    log('warn', 'agent.model.unavailable', {
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return {
    reply,
    ...(artifact ? { artifact } : {}),
    tool: intent === 'none' ? 'none' : `read_${intent}`,
    modelled,
  };
}
