/**
 * Journal builders — the ledger consequence of every purpose in
 * `docs/11-API-USAGE-MAP.md` §2-§4.
 *
 * Pure. No I/O, no env, no database (docs/01 §5). These functions take an
 * amount and a resolved context and return a `JournalDraft`; they never look
 * anything up. That is what lets `tests/property/ledger` generate forty random
 * operations and assert the ledger still sums to zero in under a second.
 *
 * Sign convention throughout: positive = debit, negative = credit.
 * Money in  -> MOMO_SETTLEMENT is DEBITED (+), the destination is CREDITED (-).
 * Money out -> the source is DEBITED (+), MOMO_SETTLEMENT is CREDITED (-).
 */

import { minor, type Minor } from '../money';
import { DEFAULT_FARE_SPLIT, type SplitComponent, split } from '../split';
import {
  type AccountRef,
  MOMO_SETTLEMENT,
  PLATFORM_FEE,
  SUSPENSE,
  driverFloat,
  escrowHold,
  familyLocked,
  fuelPool,
  insurancePool,
  stokvelPool,
  userWallet,
} from './accounts';
import { type DraftPosting, type JournalDraft, assertWritable, mergePostings } from './journal';

/** Every `momo_transaction.purpose` the money engine knows how to post. */
export const POSTING_PURPOSES = [
  // Collections — money in (docs/11 §2)
  'FARE',
  'ESCROW_FUND',
  'STOKVEL_CONTRIB',
  'ELECTRICITY',
  'SCHOOL_FEES',
  'AIRTIME',
  'SPLIT_BILL',
  'RANK_FLOAT',
  // Disbursements — money out (docs/11 §3)
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'OWNER_PAYOUT',
  'DRIVER_WAGE',
  'STOKVEL_PAYOUT',
  // Remittances — money in (docs/11 §4)
  'REMIT_IN',
  'REMIT_TOOL',
  'REMIT_TRANSPORT',
] as const;

export type PostingPurpose = (typeof POSTING_PURPOSES)[number];

export function isPostingPurpose(value: string): value is PostingPurpose {
  return (POSTING_PURPOSES as readonly string[]).includes(value);
}

export class PostingContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingContextError';
  }
}

/**
 * Everything a purpose might need that is NOT on the transaction row itself.
 *
 * The server resolves these (from the vehicle, the job, the stokvel) before
 * calling in. Every field is optional; a builder that needs one and does not
 * get it throws `PostingContextError` rather than guessing, because guessing
 * here means paying the wrong person.
 */
export interface PostingContext {
  /** Taxi owner, `profile.id`. */
  readonly ownerId?: string | null;
  /** Driver on shift, `profile.id`. */
  readonly driverId?: string | null;
  /** The rank whose fuel and insurance pools this fare feeds. */
  readonly rankId?: string | null;
  /** Job / stokvel run / bill — whatever `momo_transaction.subject_id` points at. */
  readonly subjectId?: string | null;
  /** Beneficiary of a remittance, `profile.id`. */
  readonly beneficiaryId?: string | null;
  /** The category a FAMILY_LOCKED wallet may be spent on. */
  readonly lockedCategory?: string | null;
  /** Platform fee, minor units. Deducted on payout, never on collection. */
  readonly feeMinor?: bigint;
  /** The versioned rule that applied. Defaults to the 60/25/10/5 seed. */
  readonly splitComponents?: readonly SplitComponent[];
}

export interface PostingInput {
  readonly purpose: string;
  readonly amountMinor: bigint;
  /** `momo_transaction.id`. Carried onto the journal for reconciliation. */
  readonly referenceId?: string | null;
  readonly context?: PostingContext;
}

function required(value: string | null | undefined, what: string, purpose: string): string {
  if (!value) {
    throw new PostingContextError(`${purpose} needs ${what} in its posting context`);
  }
  return value;
}

/** Money in: MOMO_SETTLEMENT is debited, `destination` is credited. */
function collectInto(destination: AccountRef, amount: bigint): DraftPosting[] {
  return [
    { account: MOMO_SETTLEMENT, amount },
    { account: destination, amount: -amount },
  ];
}

/** Money out: `source` is debited, MOMO_SETTLEMENT is credited. */
function payOutOf(source: AccountRef, amount: bigint, feeMinor: bigint): DraftPosting[] {
  if (feeMinor < 0n) {
    throw new PostingContextError(`fee cannot be negative: ${feeMinor}`);
  }
  if (feeMinor > amount) {
    throw new PostingContextError(`fee ${feeMinor} exceeds amount ${amount}`);
  }
  const net = amount - feeMinor;
  const postings: DraftPosting[] = [{ account: source, amount, note: 'gross' }];
  if (feeMinor > 0n) {
    postings.push({ account: PLATFORM_FEE, amount: -feeMinor, note: 'platform fee' });
  }
  if (net > 0n) {
    postings.push({ account: MOMO_SETTLEMENT, amount: -net, note: 'paid out' });
  }
  return postings;
}

/**
 * The taxi fare — the flow that matters (docs/01 §4).
 *
 * MOMO_SETTLEMENT is debited the whole fare, then `src/domain/split.ts` divides
 * it 6000/2500/1000/500 bps and each share is credited to its own account. The
 * split is exact by construction, so the journal balances by construction; the
 * ROUNDING account is a safety net that should stay empty.
 */
export function fareSplitPostings(amount: Minor, context: PostingContext): DraftPosting[] {
  const components = context.splitComponents ?? DEFAULT_FARE_SPLIT;
  const parts = split(amount, components);

  const credits = parts.map((part) => ({
    account: splitAccountFor(part.key, context),
    amount: -part.amount,
    note: part.key,
  }));

  return [{ account: MOMO_SETTLEMENT, amount: amount as bigint }, ...credits];
}

/**
 * Map a split component key to a real account.
 *
 * `DEFAULT_FARE_SPLIT` uses 'OWNER' for the owner's spendable wallet; the DB's
 * `split_component.account_type` uses the enum name. Both are accepted so a
 * versioned rule loaded from Postgres drops straight in.
 */
export function splitAccountFor(key: string, context: PostingContext): AccountRef {
  switch (key) {
    case 'OWNER':
    case 'USER_WALLET':
      return userWallet(required(context.ownerId, 'ownerId', 'FARE'));
    case 'DRIVER_FLOAT':
      return driverFloat(required(context.driverId, 'driverId', 'FARE'));
    case 'FUEL_POOL':
      return fuelPool(required(context.rankId, 'rankId', 'FARE'));
    case 'INSURANCE_POOL':
      return insurancePool(required(context.rankId, 'rankId', 'FARE'));
    case 'PLATFORM_FEE':
      return PLATFORM_FEE;
    default:
      throw new PostingContextError(`no account mapping for split component "${key}"`);
  }
}

/**
 * Build the journal for a transaction that has just been observed SUCCESSFUL.
 *
 * Called from exactly one place: `src/server/momo/resolve.ts`, inside the
 * guarded transition, in the same database transaction (A1 §3).
 */
export function journalDraftFor(input: PostingInput): JournalDraft {
  const amount = minor(input.amountMinor);
  if (amount === 0n) {
    throw new PostingContextError('cannot post a zero-amount transaction');
  }

  const ctx = input.context ?? {};
  const fee = ctx.feeMinor ?? 0n;
  const postings = buildPostings(input.purpose, amount, ctx, fee);

  const draft: JournalDraft = {
    kind: input.purpose,
    referenceId: input.referenceId ?? null,
    memo: null,
    postings: mergePostings(postings),
  };

  // Belt and braces. The database refuses an unbalanced journal too, but
  // failing here names the purpose and the drift.
  assertWritable(draft);
  return draft;
}

function buildPostings(
  purpose: string,
  amount: Minor,
  ctx: PostingContext,
  fee: bigint,
): DraftPosting[] {
  switch (purpose) {
    // ── Collections — money in ──────────────────────────────────────────────
    case 'FARE':
      return fareSplitPostings(amount, ctx);

    case 'ESCROW_FUND':
      // The client's money leaves at FUNDING, not at approval. That is what
      // makes the worker willing to start (docs/03 §4).
      return collectInto(escrowHold(required(ctx.subjectId, 'subjectId', purpose)), amount);

    case 'RANK_FLOAT':
      return collectInto(escrowHold(required(ctx.subjectId, 'subjectId', purpose)), amount);

    case 'STOKVEL_CONTRIB':
      return collectInto(stokvelPool(required(ctx.subjectId, 'subjectId', purpose)), amount);

    case 'ELECTRICITY':
    case 'SCHOOL_FEES':
    case 'AIRTIME':
    case 'SPLIT_BILL':
      // Money we have taken but not yet delivered a product for. It sits in
      // SUSPENSE, named and owned, until the token / receipt / bill settles.
      // SUSPENSE must be zero at end of day (docs/02 §2) — that reconciliation
      // is what proves nothing was quietly kept.
      return collectInto({ ...SUSPENSE, subjectId: ctx.subjectId ?? null }, amount);

    // ── Remittances — money in ──────────────────────────────────────────────
    case 'REMIT_IN':
    case 'REMIT_TOOL':
    case 'REMIT_TRANSPORT':
      return collectInto(
        familyLocked(
          required(ctx.beneficiaryId, 'beneficiaryId', purpose),
          required(ctx.lockedCategory, 'lockedCategory', purpose),
        ),
        amount,
      );

    // ── Disbursements — money out ───────────────────────────────────────────
    case 'ESCROW_RELEASE':
      return payOutOf(escrowHold(required(ctx.subjectId, 'subjectId', purpose)), amount, fee);

    case 'ESCROW_REFUND':
      // A refund carries no fee. The client gets back exactly what they put in;
      // charging for a job that did not happen is how you lose a market.
      return payOutOf(escrowHold(required(ctx.subjectId, 'subjectId', purpose)), amount, 0n);

    case 'OWNER_PAYOUT':
      return payOutOf(userWallet(required(ctx.ownerId, 'ownerId', purpose)), amount, fee);

    case 'DRIVER_WAGE':
      return payOutOf(driverFloat(required(ctx.driverId, 'driverId', purpose)), amount, fee);

    case 'STOKVEL_PAYOUT':
      return payOutOf(stokvelPool(required(ctx.subjectId, 'subjectId', purpose)), amount, fee);

    default:
      // An unknown purpose is NOT an error we can afford to throw on: the money
      // has already arrived at MTN, and refusing to post it would leave the
      // ledger disagreeing with reality. It goes to SUSPENSE with the reference
      // attached, and end-of-day reconciliation surfaces it as an alarm.
      return collectInto({ ...SUSPENSE, subjectId: ctx.subjectId ?? null }, amount);
  }
}
