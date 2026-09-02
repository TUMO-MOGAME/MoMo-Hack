/**
 * The shape of a journal, and the one invariant that makes it a ledger rather
 * than a list of numbers: it sums to exactly zero.
 *
 * Pure. No I/O, no env, no database (docs/01 §5). `src/server/ledger/journal.ts`
 * is what actually writes one; this file is what decides whether it may.
 */

import { type AccountRef, accountKey } from './accounts';

/** One posting. Positive = debit, negative = credit. Minor units, always. */
export interface DraftPosting {
  readonly account: AccountRef;
  /** Signed, in minor units (cents). Never zero. */
  readonly amount: bigint;
  /** Optional human label, carried into the memo, never into the amount. */
  readonly note?: string;
}

/** A set of postings written atomically. */
export interface JournalDraft {
  /** 'FARE_SPLIT', 'ESCROW_FUND', 'PAYOUT', ... */
  readonly kind: string;
  /** `momo_transaction.id` when the movement was externally driven. */
  readonly referenceId?: string | null;
  readonly memo?: string | null;
  readonly postings: readonly DraftPosting[];
}

export class UnbalancedJournalError extends Error {
  constructor(
    readonly kind: string,
    readonly total: bigint,
  ) {
    super(`journal ${kind} does not balance: ${total}`);
    this.name = 'UnbalancedJournalError';
  }
}

export class InvalidJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJournalError';
  }
}

export function journalTotal(postings: readonly DraftPosting[]): bigint {
  return postings.reduce<bigint>((a, p) => a + p.amount, 0n);
}

/**
 * Every check a journal must pass before a single row is written.
 *
 * The database enforces the balance too (0001_ledger.sql, trigger I1). This is
 * not redundancy for its own sake: the DB check fires at COMMIT, by which point
 * the failure is a Postgres exception in a log. Checking here fails at the call
 * site, with the kind and the total, before any row exists.
 */
export function assertWritable(draft: JournalDraft): void {
  if (!draft.kind.trim()) {
    throw new InvalidJournalError('a journal needs a kind');
  }
  if (draft.postings.length < 2) {
    // "Every value movement is >= 2 postings summing to zero" (CLAUDE.md #2).
    // A single-posting journal is either unbalanced or a no-op; both are bugs.
    throw new InvalidJournalError(
      `journal ${draft.kind} needs at least 2 postings, got ${draft.postings.length}`,
    );
  }
  for (const p of draft.postings) {
    if (p.amount === 0n) {
      throw new InvalidJournalError(
        `journal ${draft.kind} has a zero posting on ${accountKey(p.account)}`,
      );
    }
  }
  const total = journalTotal(draft.postings);
  if (total !== 0n) {
    throw new UnbalancedJournalError(draft.kind, total);
  }
}

/**
 * Collapse repeated references to the same account into one posting.
 *
 * A fare split can legitimately credit the same account twice (an owner who is
 * also the driver). Writing two rows is not wrong, but merging them keeps the
 * overdraft trigger's per-account sum cheap and the console readable. Order is
 * preserved by first appearance, so the result is deterministic.
 */
export function mergePostings(postings: readonly DraftPosting[]): DraftPosting[] {
  const order: string[] = [];
  const byKey = new Map<string, DraftPosting>();

  for (const p of postings) {
    const key = accountKey(p.account);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, { ...existing, amount: existing.amount + p.amount });
    } else {
      order.push(key);
      byKey.set(key, p);
    }
  }

  // A merge can cancel an account to zero (a credit and a debit of equal size).
  // Zero postings are illegal, and dropping them is correct: nothing moved.
  return order
    .map((k) => byKey.get(k))
    .filter((p): p is DraftPosting => p !== undefined && p.amount !== 0n);
}
