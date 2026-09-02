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
import { log } from '@/server/log';
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

type Intent = 'wallet' | 'transactions' | 'split' | 'none';

/**
 * Deterministic routing. Order matters — the first match wins, so the more
 * specific patterns come first.
 */
const ROUTES: readonly { intent: Intent; test: RegExp }[] = [
  { intent: 'split', test: /\b(split|fare|taxi|divide|60|breakdown|where did.*(go|money))\b/i },
  {
    intent: 'transactions',
    test: /\b(transaction|spent|spend|history|activity|statement|last month|three months|3 months|recent)\b/i,
  },
  { intent: 'wallet', test: /\b(balance|wallet|how much|money|afford|have|left)\b/i },
];

function classify(message: string): Intent {
  return ROUTES.find((r) => r.test.test(message))?.intent ?? 'none';
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
    const history: AgentMessage[] = [
      { role: 'user', text: `${SYSTEM_PROMPT}\n\n${grounding(artifact)}` },
      ...(options.history ?? []),
      { role: 'user', text: message },
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
