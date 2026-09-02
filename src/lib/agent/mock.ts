/**
 * A local, deterministic stand-in for the Groq agent (S7a).
 *
 * WHY THIS EXISTS: the real agent needs an API key, a ledger and a database.
 * This lets the whole chat-to-artifact experience be built, demoed and
 * screenshotted with zero credentials and zero network — the same reasoning
 * behind the MoMo emulator (ADR-0009).
 *
 * It is NOT a fake to be shipped. When `src/app/api/agent/route.ts` lands, this
 * becomes the fixture source for the UI tests.
 *
 * Numbers here stand in for tool-call results. Note that every one carries a
 * `sourceTxnId` or `sourceAccountId` — the provenance rule from docs/13 §3
 * applies to the mock too, so the UI can never be built against unsourced money.
 */

import { minor } from '@/domain/money';
import { DEFAULT_FARE_SPLIT, split } from '@/domain/split';
import type { Artifact, BalanceRow, SourcedMoney, TxnRow } from '@/lib/artifacts/types';

export interface AgentTurn {
  readonly reply: string;
  readonly artifact?: Artifact;
}

const SPLIT_LABELS: Record<string, string> = {
  OWNER: 'Taxi owner',
  DRIVER_FLOAT: 'Driver float',
  FUEL_POOL: 'Fuel & parts pool',
  INSURANCE_POOL: 'Insurance pool',
};

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function fareSplitArtifact(): Artifact {
  const fare = minor(1250n);
  const parts = split(fare, DEFAULT_FARE_SPLIT);
  return {
    id: id('split'),
    title: 'Fare split · Rank 42',
    type: 'split-breakdown',
    route: 'Katlehong → Germiston',
    fare: { amount: fare, sourceTxnId: 'txn_8842' },
    parts: parts.map((p) => ({
      key: p.key,
      label: SPLIT_LABELS[p.key] ?? p.key,
      bps: p.bps,
      money: { amount: p.amount, sourceTxnId: 'txn_8842' },
    })),
  };
}

function walletArtifact(): Artifact {
  return {
    id: id('wallet'),
    title: 'Your money',
    type: 'wallet',
    balances: [
      { label: 'Available', kind: 'WALLET', money: { amount: minor(34000n), sourceAccountId: 'acc_w1' } },
      {
        label: 'Held in escrow',
        kind: 'ESCROW',
        money: { amount: minor(6000n), sourceAccountId: 'acc_e1' },
        note: 'Kombi wash · releases on approval',
      },
      {
        label: 'School fees (locked)',
        kind: 'LOCKED',
        money: { amount: minor(200000n), sourceAccountId: 'acc_l1' },
        note: 'From Sipho, London · school fees only',
      },
    ],
  };
}

function transactionsArtifact(): Artifact {
  return {
    id: id('txns'),
    title: 'This week',
    type: 'transactions',
    caption: 'R340 in, mostly from washes.',
    items: [
      { id: 't1', at: 'Today 07:12', label: 'Kombi wash', counterparty: 'Rank 42', direction: 'IN', money: { amount: minor(6000n), sourceTxnId: 't1' }, status: 'SUCCESSFUL' },
      { id: 't2', at: 'Today 07:40', label: 'Taxi fare', counterparty: 'Katlehong → Germiston', direction: 'OUT', money: { amount: minor(1250n), sourceTxnId: 't2' }, status: 'SUCCESSFUL' },
      { id: 't3', at: 'Yesterday', label: 'Interior clean', counterparty: 'Rank 42', direction: 'IN', money: { amount: minor(4500n), sourceTxnId: 't3' }, status: 'SUCCESSFUL' },
      { id: 't4', at: 'Yesterday', label: 'Electricity', counterparty: 'Meter 0412', direction: 'OUT', money: { amount: minor(10000n), sourceTxnId: 't4' }, status: 'SUCCESSFUL' },
      { id: 't5', at: 'Mon', label: 'Stokvel contribution', counterparty: 'Masakhane', direction: 'OUT', money: { amount: minor(30000n), sourceTxnId: 't5' }, status: 'SUCCESSFUL' },
      { id: 't6', at: 'Mon', label: 'Tyre check ×3', counterparty: 'Rank 42', direction: 'IN', money: { amount: minor(9000n), sourceTxnId: 't6' }, status: 'PENDING' },
    ],
  };
}

function stokvelArtifact(): Artifact {
  return {
    id: id('stokvel'),
    title: 'Masakhane Grocery Stokvel',
    type: 'stokvel',
    cadence: 'R300 every Monday',
    pool: { amount: minor(270000n), sourceAccountId: 'acc_s1' },
    target: { amount: minor(360000n), sourceAccountId: 'acc_s1' },
    members: [
      { name: 'MaDlamini', paid: true, next: false },
      { name: 'Nomsa', paid: true, next: false },
      { name: 'Thabo', paid: true, next: false },
      { name: 'Zanele', paid: true, next: true },
      { name: 'Sibusiso', paid: false, next: false },
      { name: 'Lerato', paid: false, next: false },
    ],
  };
}

function jobsArtifact(): Artifact {
  return {
    id: id('jobs'),
    title: 'Jobs near you',
    type: 'job-list',
    jobs: [
      { id: 'j1', title: 'Wash kombi', where: 'Rank 42 · 400m', money: { amount: minor(6000n), sourceAccountId: 'acc_j1' }, state: 'OPEN' },
      { id: 'j2', title: 'Interior sanitise ×2', where: 'Rank 42 · 400m', money: { amount: minor(9000n), sourceAccountId: 'acc_j2' }, state: 'OPEN' },
      { id: 'j3', title: 'Queue marshalling, 3h', where: 'Rank 12 · 1.2km', money: { amount: minor(12000n), sourceAccountId: 'acc_j3' }, state: 'OPEN' },
      { id: 'j4', title: 'Yard maintenance', where: 'Katlehong ext 4', money: { amount: minor(25000n), sourceAccountId: 'acc_j4' }, state: 'OPEN' },
    ],
  };
}

function confirmArtifact(): Artifact {
  return {
    id: id('confirm'),
    title: 'Confirm payment',
    type: 'confirm',
    action: {
      kind: 'PAYMENT',
      money: { amount: minor(4500n), sourceAccountId: 'acc_w1' },
      payeeLabel: 'Nomsa M.',
      payeeMasked: '•••• 4821',
      purpose: 'Kombi wash · Rank 42',
      fromLabel: 'Your wallet',
      fromBalance: { amount: minor(34000n), sourceAccountId: 'acc_w1' },
      signature: 'demo-signature-not-valid',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    },
  };
}

function trustArtifact(): Artifact {
  return {
    id: id('trust'),
    title: 'Ubuntu Trust Score',
    type: 'trust-score',
    score: 62,
    completed: 14,
    factors: [
      { label: '10 jobs completed', met: true },
      { label: 'No disputes in 30 days', met: true },
      { label: 'Photo proof on every job', met: true },
      { label: '25 jobs completed — unlocks tool lease', met: false },
    ],
  };
}

interface Rule {
  readonly test: RegExp;
  readonly turn: () => AgentTurn;
}

const RULES: readonly Rule[] = [
  {
    test: /\b(balance|money|wallet|how much do i have|ngingakanani)\b/i,
    turn: () => ({
      reply: "You have R340 ready to spend. There's R60 held in escrow for the kombi wash — that lands the moment the client approves.",
      artifact: walletArtifact(),
    }),
  },
  {
    test: /\b(split|fare|taxi|kombi fare|where did my money go)\b/i,
    turn: () => ({
      reply: 'That R12.50 fare split four ways the second it landed. Here it is, cent for cent.',
      artifact: fareSplitArtifact(),
    }),
  },
  {
    test: /\b(stokvel|umgalelo|society|group|chippa)\b/i,
    turn: () => ({
      reply: 'Masakhane is at R2 700 of R3 600. Zanele collects this round. Two people still owe — want me to nudge them?',
      artifact: stokvelArtifact(),
    }),
  },
  {
    test: /\b(job|work|gig|earn|sebenza|umsebenzi)\b/i,
    turn: () => ({
      reply: "Four jobs near you right now. The kombi wash at Rank 42 pays R60 and it's a four-minute walk.",
      artifact: jobsArtifact(),
    }),
  },
  {
    test: /\b(pay|send|khokha|transfer)\b/i,
    turn: () => ({
      reply: "Ready when you are. Check it and tap confirm — I can't move money on my own.",
      artifact: confirmArtifact(),
    }),
  },
  {
    test: /\b(trust|score|rating|reputation)\b/i,
    turn: () => ({
      reply: "You're on 62. Eleven more jobs and the pressure-washer lease unlocks.",
      artifact: trustArtifact(),
    }),
  },
  {
    test: /\b(week|history|activity|transactions|spent)\b/i,
    turn: () => ({
      reply: 'R340 in this week, mostly washes. R413.50 out — the stokvel and electricity are the big ones.',
      artifact: transactionsArtifact(),
    }),
  },
];

const FALLBACK: AgentTurn = {
  reply:
    "I can help with your money, finding work, your stokvel, or paying a bill. Try \"how much do I have\", \"find me work\", or \"where did my fare go\".",
};

/** Deterministic. Same input, same turn — which is what makes it testable. */
export function mockAgent(input: string): AgentTurn {
  const rule = RULES.find((r) => r.test.test(input));
  return rule ? rule.turn() : FALLBACK;
}

export const SUGGESTIONS: readonly string[] = [
  'How much do I have?',
  'Find me work today',
  'Where did my fare go?',
  'How is the stokvel doing?',
];


/* ── ambient context ─────────────────────────────────────────────────────────
   What the context rail shows. The chat is still the spine of this app, so
   nothing here navigates anywhere — every row opens an ARTIFACT, which is the
   same vocabulary a chip in the conversation uses. It is a persistent answer to
   "what do I have, what do I owe, what just happened", not a second menu.
   ────────────────────────────────────────────────────────────────────────── */

/** The next thing this person owes. The retention mechanic, made visible. */
export interface NextObligation {
  readonly label: string;
  readonly detail: string;
  readonly money: SourcedMoney;
  /** Fixed, not computed from `Date.now()` — a clock in the render tree is a
   *  hydration mismatch waiting to happen, and this is a mock. */
  readonly dueInDays: number;
  readonly artifact: Artifact;
}

export interface RecentEntry {
  readonly id: string;
  readonly label: string;
  readonly at: string;
  readonly direction: TxnRow['direction'];
  readonly status: TxnRow['status'];
  readonly money: SourcedMoney;
  /** Tapping the row reopens the full artifact — no re-prompting, no LLM call. */
  readonly artifact: Artifact;
}

export interface KasiContext {
  readonly balances: readonly BalanceRow[];
  /** The full wallet view the position block opens. */
  readonly wallet: Artifact;
  readonly next: NextObligation;
  readonly recent: readonly RecentEntry[];
  /** Fare captures waiting for signal (docs/00 §6a). Never a hidden failure. */
  readonly queued: number;
}

/**
 * Deterministic, like `mockAgent`. Every amount carries provenance, so the rail
 * is held to the same rule as an artifact (CLAUDE.md #14, ADR-0013).
 *
 * Fresh artifacts per call so the ids differ, exactly as a real tool call would
 * produce them.
 */
export function contextSnapshot(): KasiContext {
  const wallet = walletArtifact();
  const activity = transactionsArtifact();
  const stokvel = stokvelArtifact();

  return {
    balances: wallet.type === 'wallet' ? wallet.balances : [],
    wallet,
    next: {
      label: 'Masakhane stokvel',
      detail: 'R300 every Monday',
      money: { amount: minor(30000n), sourceAccountId: 'acc_s1' },
      dueInDays: 3,
      artifact: stokvel,
    },
    recent: [
      {
        id: 'r1',
        label: 'Kombi wash',
        at: 'Today 07:12',
        direction: 'IN',
        status: 'SUCCESSFUL',
        money: { amount: minor(6000n), sourceTxnId: 't1' },
        artifact: activity,
      },
      {
        id: 'r2',
        label: 'Taxi fare',
        at: 'Today 07:40',
        direction: 'OUT',
        status: 'SUCCESSFUL',
        money: { amount: minor(1250n), sourceTxnId: 't2' },
        artifact: activity,
      },
      {
        id: 'r3',
        label: 'Tyre check ×3',
        at: 'Mon',
        direction: 'IN',
        status: 'PENDING',
        money: { amount: minor(9000n), sourceTxnId: 't6' },
        artifact: activity,
      },
      {
        id: 'r4',
        label: 'Electricity',
        at: 'Yesterday',
        direction: 'OUT',
        status: 'SUCCESSFUL',
        money: { amount: minor(10000n), sourceTxnId: 't4' },
        artifact: activity,
      },
    ],
    queued: 0,
  };
}
