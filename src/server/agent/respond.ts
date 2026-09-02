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
const ROUTES: readonly { intent: Intent; test: RegExp }[] = [
  {
    intent: 'unbuilt',
    // `\d+`, not `\d`: the trailing `\b` cannot follow a single digit inside a
    // longer number, so `save R2|00` failed to match "save R200 a month" and
    // that request fell through to the generic fallback. Caught by the test.
    test: /\b(send|sending|transfer|pay|paying|payout|withdraw|cash ?out|eft|deposit|top ?up|buy|purchase|schedule|automate|remind|save (?:me |up )?r?\d+)\b/i,
  },
  {
    intent: 'split',
    // `60` was here as shorthand for the 60/25/10/5 ratio, and it matched any
    // bare "R60" — so "did I get my R60" asked for a fare breakdown. It now
    // only matches as part of a written ratio.
    test: /\b(split|fare|taxi|divide|breakdown|60\s*[/:]\s*25|where did.*(go|money))\b/i,
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
  },
  {
    intent: 'wallet',
    test: /\b(balances?|wallets?|how much|money|afford|have|left)\b/i,
  },
];

function classify(message: string): Intent {
  return ROUTES.find((r) => r.test.test(message))?.intent ?? 'none';
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
 */
function unbuiltProse(message: string): string {
  if (
    /\b(schedule|automate|remind|every (month|week|day)|save (?:me |up )?r?\d)\b/i.test(message)
  ) {
    return "I can't set up anything that runs on its own yet — scheduled and recurring payments aren't built. What I can do right now is show you your balance, your recent transactions, or how a taxi fare splits.";
  }
  if (/\b(buy|purchase|top ?up|airtime|electricity|data)\b/i.test(message)) {
    return "I can't buy airtime or electricity yet — that part isn't built. Money can come into this ledger, but nothing can go out of it yet. I can show you your balance, your recent transactions, or how a taxi fare splits.";
  }
  return "I can't send money to anyone yet, so nothing has been set up and nothing is waiting for you to confirm. Payouts aren't built — money can come into this ledger and cannot yet leave it. What I can do is show you your balance, your recent transactions, or how a taxi fare splits.";
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
  const intent = classify(message);

  // Asked to DO something that does not exist. Answer and stop — no ledger read,
  // so there is no card to write misleading prose against, and no model call, so
  // there is nothing to talk into rewording the refusal. This return is the only
  // thing standing between a payment request and an invented receipt, so it is
  // deliberately the shortest path in the function.
  if (intent === 'unbuilt') {
    log('info', 'agent.intent.unbuilt', {});
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
