/**
 * THE FIRST PRODUCTION CODE PATH THAT CAN START A PAYMENT.
 *
 * Until now `initiateCollection` had exactly four callers and all four were
 * tests. No deployed route could move a cent. That changes here, so the
 * constraints are written down rather than assumed.
 *
 * ── WHY THIS DOES NOT BREAK CLAUDE.md #11 ────────────────────────────────────
 *
 * *"The AI agent can never move money."* It still cannot. `respond()` — the
 * agent — has no write tools and does not import this module. **This is reached
 * only from an explicit `/pay` COMMAND**, on either channel, parsed by a regex.
 * A model never decides to call it, never chooses the amount, and never chooses
 * the payee. The command is a human instruction, not a generated one.
 *
 * ── AND WHY A `requesttopay` IS THE RIGHT SHAPE FOR ADR-0014 ─────────────────
 *
 * ADR-0014 requires a human physical action before money moves. A collection
 * does not move money — **it asks**. MTN pushes a prompt to the payer's own
 * handset and the payer types their own PIN into MTN's own app. That PIN never
 * enters our system, our logs, or a model's context, which is precisely what
 * ADR-0017 spends two pages arguing for.
 *
 * So the authorisation is stronger here than a tap in our own UI would be: it
 * happens on a device we do not control, in an app we did not write, with a
 * secret we never see. The worst a misfire achieves is that somebody receives a
 * payment request they can decline.
 *
 * ── THE PAYEE IS CONFIGURATION, NEVER INPUT. THIS IS THE IMPORTANT ONE. ──────
 *
 * The number comes from the environment — `MOMO_PAY_PAYEES`, falling back to
 * `MOMO_DEMO_MSISDN` — and **never** from the message.
 *
 * A person may now SELECT which configured phone to ask, by label or by the
 * last four digits the bot itself shows them. They still cannot SUPPLY one:
 * `resolvePayee` (`lib/momo/payees.ts`) returns null for anything not already
 * in the environment, and `pay-replies.ts` refuses before reaching this module.
 * This function is handed a number its caller RESOLVED, never one it was given.
 *
 * The obvious implementation — read the number out of "/pay 0.20 to 0761234567"
 * — turns a public chatbot into a machine for pushing unsolicited payment
 * prompts to any South African phone, over MTN's real network, from an
 * anonymous web form. That is harassment infrastructure, and it is two lines of
 * code away at all times. Hence: one configured number, ours, and a hard refusal
 * when it is unset.
 *
 * If this ever needs to charge a real user, the number comes from an
 * authenticated session (M9a) — not from a string somebody typed.
 */

import { formatZAR, parseMinor, type Minor } from '@/domain/money';
import { DEFAULT_FARE_SPLIT, split } from '@/domain/split';
import { isDeterministic, maskMsisdn } from '@/lib/momo/test-msisdns';
import type { Payee } from '@/lib/momo/payees';
import { getMomoClient, readMomoMode } from '@/lib/momo';
import { readMomoConfig } from '@/lib/momo/config';
import { getMoneyDb } from '@/server/db';
import { getPool } from '@/server/db/connection';
import { ensureMoneyDb } from '@/server/db/bootstrap';
import { initiateCollection } from '@/server/momo/initiate';
import { reconcile } from '@/server/momo/reconcile';
import { log } from '@/server/log';

/**
 * A ceiling on top of the budget guard, not instead of it.
 *
 * `assertWithinLiveBudget` already refuses anything over `MOMO_LIVE_MAX_MINOR`
 * (R1.00) against a live environment, and that is the control that protects the
 * ~R10 budget. This second, lower bound exists because THIS path is reachable
 * from a chat message by anyone who can reach the bot, and defence in depth at
 * a new attack surface is cheap. Sandbox is uncapped by the budget guard; this
 * still applies there, because a demo does not need R500 either.
 */
export const DEMO_MAX_MINOR = 500n;

export type DemoPayResult =
  | {
      readonly ok: true;
      readonly transactionId: string;
      readonly status: string;
      readonly amountMinor: Minor;
      readonly masked: string;
      /**
       * True when the payer is one of MTN's sandbox fixtures, whose outcome is
       * decided by the number itself — `46733123454` goes CREATED → SUCCESSFUL
       * on its own in about 25 seconds.
       *
       * It exists because the reply was telling people to check a phone that
       * cannot ring: no prompt is pushed for a fixture, nobody is asked for a
       * PIN, and "approve it on your handset" is an instruction that can never
       * be followed. Carried on the result rather than re-derived in the reply,
       * so the sentence and the transaction agree by construction.
       */
      readonly resolvesItself: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Parse the amount from "/pay 0.20", "/pay R0.20".
 *
 * ── EXACTLY ONE TOKEN, AND THAT IS THE POINT ─────────────────────────────────
 *
 * The first version anchored to the END of the string — `(\d+...)\s*$` — so
 * `/pay 0.20 0767221345` matched the **phone number** and cheerfully reported
 * *"R7 672 213.45 is over the R5.00 demo ceiling."* A real user typed exactly
 * that, because "pay this amount to this number" is the obvious thing to type.
 *
 * The ceiling caught it. **That was luck, not design.** `/pay 0.20 300` would
 * have parsed as R3.00 and charged it — a user who wrote an amount and a
 * reference would be billed the reference. Any parser that silently picks one
 * number out of several is a parser that will eventually pick the wrong one.
 *
 * So: one token, nothing after it. A second token is a REFUSAL, not something
 * to interpret — and the refusal explains why, because the user is trying to do
 * something reasonable that this build does not support (the payee is
 * configuration, never input; see the header).
 *
 * Returns `null` for "no usable amount"; the caller turns that into a sentence.
 */
export function parsePayAmount(text: string): Minor | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  // The whole remainder must be ONE amount. `^…$` with no room for a second
  // token is what makes "0.20 0767221345" fail instead of resolving to one of
  // the two numbers.
  // ── `[.,]`, AND IT IS NOT COSMETIC (docs/12 §2a) ──────────────────────────
  //
  // South Africa writes the decimal separator as a COMMA. It is the SI
  // convention, it is what Afrikaans uses, and it is what an Android numeric
  // keypad set to af-ZA or zu-ZA puts under the thumb. So `/pay 0,20` — a
  // correctly written twenty cents — parsed as null and was answered with
  // "Tell me how much — like /pay 0.20", which tells a user who did type an
  // amount that they did not.
  //
  // This is the language audit reaching the MONEY path. The prompt layer was
  // taught eleven languages; the parser underneath it read one number format,
  // and it failed closed and politely — the failure mode nobody reports.
  //
  // NO AMBIGUITY IS INTRODUCED. A comma used as a THOUSANDS separator always
  // has exactly three digits after it, and this pattern allows at most two, so
  // "1,250" still returns null and still gets the hint. "1,25" means R1.25
  // under either reading. Liberal in what we accept; formatZAR stays
  // conservative in what we emit, because "R12.50" is the form the ledger, the
  // cards and every test in this repo already speak — LANGUAGE_DIRECTIVE pins
  // it as domain vocabulary that must not be translated or reformatted.
  const m = /^r?\s*(\d{1,6}(?:[.,]\d{1,2})?)$/i.exec(trimmed);
  if (!m?.[1]) return null;

  try {
    // `parseMinor` is the domain parser and speaks one canonical format. It is
    // deliberately NOT taught about commas — normalise at the edge instead, so
    // the money core keeps exactly one way to spell an amount.
    return parseMinor(m[1].replace(',', '.'));
  } catch {
    return null;
  }
}

/** True when the user supplied something beyond the amount — usually a payee. */
export function hasExtraArguments(text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length > 2;
}

/**
 * Split `/pay`'s arguments into the amount and an optional payee selector.
 *
 * ── WHY THE AMOUNT COMES FROM TOKEN ONE AND NOWHERE ELSE ─────────────────────
 *
 * A real user typed `/pay 0.2 0767221345` — "pay this much to this number", the
 * obvious thing to type — and the first parser anchored to the END of the
 * string, matched the PHONE NUMBER, and reported *"R7 672 213.45 is over the
 * ceiling"*. The ceiling caught it, which was luck: `/pay 0.20 300` would have
 * parsed as R3.00 and charged it.
 *
 * The fix then was to refuse any second token outright. Now that a second token
 * is MEANINGFUL — it selects which configured phone to ask — that guarantee has
 * to come from somewhere else, so it comes from here: the amount is taken from
 * token one and nothing else is ever offered to `parsePayAmount`, which keeps
 * its `^…$` anchors. A payee can never be read as money no matter what it looks
 * like, because the money parser never sees it.
 */
export function splitPayArgs(text: string): { amount: string; selector: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return { amount: tokens[0] ?? '', selector: tokens[1] ?? '' };
}

/**
 * Ask the configured demo handset to pay us.
 *
 * Returns a discriminated result rather than throwing, because both callers are
 * user-facing and every refusal here has a sentence a person should read.
 */
export async function requestDemoPayment(
  amountMinor: Minor,
  initiatedBy: string,
  env: Record<string, string | undefined> = process.env,
  /**
   * Which configured phone to ask. A `Payee`, NOT a string.
   *
   * The type is branded (`lib/momo/payees.ts`), and only `parsePayees` and
   * `resolvePayee` can mint one — both of which read the environment. So
   * `requestDemoPayment(amount, channel, env, whateverTheUserTyped)` does not
   * compile, and "the payee came from configuration" is enforced by the type
   * checker rather than promised in a comment.
   *
   * This replaced a hard structural guarantee (there was no parameter at all)
   * and the swap was made deliberately, with the trade written down: a user may
   * now SELECT from the operator's list, and still cannot SUPPLY a number.
   */
  payee?: Payee,
): Promise<DemoPayResult> {
  const msisdn = (payee?.msisdn ?? env.MOMO_DEMO_MSISDN)?.trim();
  if (!msisdn) {
    return { ok: false, reason: 'No payer number is configured, so there is nobody to ask.' };
  }

  if (amountMinor <= 0n) {
    return { ok: false, reason: 'That amount is not a payment.' };
  }
  if (amountMinor > DEMO_MAX_MINOR) {
    return {
      ok: false,
      reason: `${formatZAR(amountMinor)} is over the ${formatZAR(DEMO_MAX_MINOR as Minor)} demo ceiling. This is real money.`,
    };
  }

  // Bind the adapter in THIS instance — serverless isolates every route, and
  // MISTAKES.md M8 is the story of forgetting it.
  ensureMoneyDb();

  const config = readMomoConfig(env);
  const live = config.targetEnvironment !== 'sandbox';

  // Announce it before it happens, at the level a human reads. If this line is
  // in the drain and the payment is not, we know exactly where it stopped.
  log('warn', 'demo.pay.initiating', {
    amount: formatZAR(amountMinor),
    payer: maskMsisdn(msisdn),
    environment: config.targetEnvironment,
    live,
    mode: readMomoMode(env),
    initiatedBy,
  });

  const started = await initiateCollection(
    { db: getMoneyDb(), client: getMomoClient({ env }) },
    {
      amountMinor,
      msisdn,
      // Unique per attempt and human-readable (momoAPIs.md §6). Never reused —
      // the IDEMPOTENCY key is `X-Reference-Id`, which `initiateCollection`
      // derives from the persisted row id, and that is the one that must not
      // change on a retry.
      externalId: `kasi-${initiatedBy}-${Date.now()}`,
      // ⚠️ AIRTIME, NOT FARE, AND THIS IS NOT A PLACEHOLDER — READ BEFORE CHANGING.
      //
      // `FARE` would take the money and never post it. `journalDraftFor` routes
      // FARE to `fareSplitPostings`, which calls `required(context.ownerId)`,
      // `required(context.driverId)` and `required(context.rankId)` — and the
      // deployed reconciler's default context is `{ subjectId }` and nothing
      // else. `required()` THROWS on a missing id, inside `postSuccessfulJournal`,
      // inside the resolve transaction. So the collection would succeed at MTN,
      // the payer's money would leave their wallet, and every reconcile tick
      // afterwards would throw and count `errors: 1` forever. Real money
      // collected, no journal, no balance, stuck.
      //
      // `momo_transaction` has one `subject_id` column and nowhere to carry the
      // other three ids. Closing it properly needs a jsonb column, a
      // forward-only migration, and a resolver that reads it (M6b).
      //
      // AIRTIME is the purpose the walking skeleton proved end to end:
      // MOMO_SETTLEMENT +x / SUSPENSE −x, sums to zero, resolves with the
      // default context. The split is shown BESIDE this as a pure function —
      // `split()` needs no database and is property-tested — which is what
      // STATUS.md §"The split: show it, do not wire it" already decided.
      purpose: 'AIRTIME',
      payerMessage: 'MoMo Kasi',
      payeeNote: `Collected via ${initiatedBy}`,
      // NULL, not the channel name. `momo_transaction.initiated_by` is a
      // **uuid** — it is the user who started this, and there is no auth yet
      // (M9a), so there is no such user. Passing "web" here threw
      // `invalid input syntax for type uuid` from Postgres, which the reply
      // path turned into a friendly sentence and, until the catch was made to
      // log, into no evidence at all.
      //
      // The channel is not lost: it is in `externalId`, in `payeeNote`, and on
      // both log lines. When auth lands this becomes the real user id.
      initiatedBy: null,
    },
  );

  log('warn', 'demo.pay.initiated', {
    correlation_id: started.transactionId,
    status: started.status,
    amount: formatZAR(amountMinor),
  });

  return {
    ok: true,
    transactionId: started.transactionId,
    status: started.status,
    amountMinor,
    masked: maskMsisdn(msisdn),
    // Decided by the NUMBER, not by the environment name. A sandbox fixture
    // settles itself; any other number means MTN pushes a prompt to a handset.
    resolvesItself: isDeterministic(msisdn),
  };
}

export interface DemoStatus {
  /** 'COLLECTION' or 'DISBURSEMENT' — which way the money went. */
  readonly product: string;
  readonly status: string;
  readonly amountMinor: Minor;
  readonly settled: boolean;
  /** A terminal state never changes again — waiting for it is pointless. */
  readonly terminal: boolean;
  /** MTN's own `reason` from the last response, when it gave one. */
  readonly reason: string | null;
  readonly journalId: string | null;
  /** The split of THIS amount, for the reply. Pure function, no database. */
  readonly parts: readonly { readonly label: string; readonly amountMinor: Minor }[];
}

/**
 * Resolve whatever is pending, then report on one transaction.
 *
 * ── WHY THIS COMMAND EXISTS AT ALL ───────────────────────────────────────────
 *
 * Because **nothing runs the reconciler on a timer** (F8, ADR-0006). In sandbox
 * the fixture MSISDN auto-resolves and a tick is a formality; against a real
 * handset the payer might take thirty seconds to find their PIN, and a Vercel
 * Hobby function dies at ten. So the bot cannot wait, and there is no scheduler
 * to catch it afterwards.
 *
 * `/status` is therefore the human standing in for the cron job. It is honest
 * about that rather than pretending the pipeline is autonomous — and when F8
 * lands, this command becomes a convenience instead of a necessity.
 */
export async function demoStatus(transactionId?: string): Promise<DemoStatus | null> {
  ensureMoneyDb();
  const db = getMoneyDb();

  // Ask MTN about anything still open. This is the same `reconcile` the cron
  // route runs, with the same deps — not a second, divergent path.
  const report = await reconcile({ db, client: getMomoClient() });
  log('info', 'demo.status.reconciled', { ...report });

  // Named id when we have one; otherwise the newest row, which during a demo is
  // always the one just created.
  //
  // Straight to the pool rather than through `MoneyDb`, and that is deliberate:
  // `MoneyDb` exposes only `transaction()` — every read lives on `MoneyTx`,
  // inside a write transaction. Opening one to answer "what happened?" would
  // take row locks for a status message. This is a read, so it reads.
  const COLUMNS = `id, product::text as product, status::text as status,
                   amount_minor::text as amount_minor, journal_id, last_response`;
  const { rows } = await getPool().query(
    transactionId
      ? `select ${COLUMNS} from momo_transaction where id = $1::uuid`
      : `select ${COLUMNS} from momo_transaction order by created_at desc limit 1`,
    transactionId ? [transactionId] : [],
  );

  const r = rows[0];
  if (!r) return null;

  const amountMinor = BigInt(String(r.amount_minor)) as Minor;
  const row = {
    // Which WAY the money went. `/status` says very different things about a
    // collection and a payout, and without this it told a payout to "check
    // your phone" — a prompt that is never coming, because a transfer has no
    // PIN step. Describing something that will never happen is MISTAKES.md
    // M10's failure in miniature.
    product: String(r.product),
    status: String(r.status),
    journalId: r.journal_id ? String(r.journal_id) : null,
  };

  // MTN puts the failure cause in `reason` on the body it returns for a
  // resolved-but-failed collection. It is the difference between "it did not
  // work" and "that number has no wallet", and only one of those is useful.
  const response = r.last_response as { reason?: unknown } | null;
  const reason = typeof response?.reason === 'string' ? response.reason : null;
  const parts = split(amountMinor, DEFAULT_FARE_SPLIT).map((p) => ({
    label: SPLIT_LABEL[p.key] ?? p.key,
    amountMinor: p.amount as Minor,
  }));

  return {
    product: row.product,
    status: row.status,
    amountMinor,
    settled: row.status === 'SUCCESSFUL',
    // CLAUDE.md's vocabulary: SUCCESSFUL, FAILED, REJECTED and TIMEOUT are
    // terminal and immutable once set. Anything else can still change.
    terminal: ['SUCCESSFUL', 'FAILED', 'REJECTED', 'TIMEOUT'].includes(row.status),
    reason,
    journalId: row.journalId ?? null,
    parts,
  };
}

const SPLIT_LABEL: Record<string, string> = {
  OWNER: 'Taxi owner',
  DRIVER_FLOAT: 'Driver float',
  FUEL_POOL: 'Rank fuel',
  INSURANCE_POOL: 'Rank insurance',
};
