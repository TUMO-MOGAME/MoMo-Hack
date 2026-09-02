/**
 * ⚠️ THE SINGLE RESOLVER.
 *
 * MoMo is asynchronous and we assume the callback is a bonus, not a guarantee,
 * so there are two independent paths that learn a transaction's fate
 * (docs/03 §3):
 *
 *   Path A — the callback. Fast, unreliable, and UNTRUSTED: it contributes a
 *            reference id and nothing else.
 *   Path B — the reconciler, every 5 minutes on GitHub Actions. Slow, reliable,
 *            authoritative.
 *
 * Both call THIS function. There is exactly one implementation of "resolve a
 * transaction", and it is safe to call any number of times, from any number of
 * callers, concurrently.
 *
 * The whole concurrency story is one statement:
 *
 *     update momo_transaction set status = $2, ...
 *      where id = $1 and status in ('INITIATED','CREATED','PENDING')
 *
 * Zero rows updated means someone else already resolved it. That is SUCCESS,
 * not an error (momoAPIs.md §12 rule 2). The ledger postings are written in the
 * SAME database transaction as the transition into SUCCESSFUL, and nowhere else
 * in the codebase.
 */

import { type PostingContext, journalDraftFor } from '@/domain/ledger/postings';
import {
  type MomoStatus,
  claimableFor,
  isTerminal,
  postsLedger,
  targetForObserved,
} from '@/domain/ledger/state-machine';
import { AppException } from '@/lib/errors';
import { maskMsisdn } from '@/lib/momo/test-msisdns';
import { writeJournal } from '@/server/ledger/journal';
import type { MomoTransactionRow, MoneyDb, MoneyTx } from '@/server/db/types';

export interface ResolveInput {
  /** `momo_transaction.id` — which is also the `X-Reference-Id`. */
  readonly referenceId: string;
  /**
   * The AUTHORITATIVE status, read from MoMo by us. Never taken from a callback
   * body: a forged callback must not be able to mark anything paid (docs/03 §3.1).
   */
  readonly observed: MomoStatus;
  /** The raw response, stored in `last_response` for the audit trail. */
  readonly response?: unknown;
}

export interface ResolveDeps {
  readonly db: MoneyDb;
  /**
   * Supplies the accounts a purpose needs (owner, driver, rank, beneficiary).
   * Defaults to the transaction's own `subject_id`, which is all the
   * escrow/stokvel/remittance purposes need. The fare split needs the vehicle,
   * so the fare route passes a richer resolver (M6b).
   */
  readonly contextFor?: (txn: MomoTransactionRow) => Promise<PostingContext> | PostingContext;
  readonly now?: () => Date;
}

export interface ResolveResult {
  /** True only for the caller that WON the guarded transition. */
  readonly applied: boolean;
  /** The status the transaction now holds. */
  readonly status: MomoStatus;
  readonly journalId?: string;
  /** Why nothing was applied. Present only when `applied` is false. */
  readonly reason?: 'ALREADY_RESOLVED' | 'NOT_FOUND' | 'NO_CHANGE';
}

/**
 * Resolve one transaction. Idempotent, concurrency-safe, and the only place
 * that turns a MoMo status into money in the ledger.
 */
export async function resolveTransaction(
  deps: ResolveDeps,
  input: ResolveInput,
): Promise<ResolveResult> {
  const now = deps.now ?? (() => new Date());

  // Decide the target status with the PURE state machine, before touching the
  // database. An observed status means the same thing whatever claimable state
  // the row is in, so this needs no prior read — and a read-then-write here
  // would be the race that A1 §4 grades High.
  const target = targetForObserved(input.observed);

  return deps.db.transaction(async (tx) => {
    const claim = await tx.claimTransition({
      id: input.referenceId,
      // Terminal statuses are absorbing, so they are simply not in the guard.
      // A late callback contradicting one updates zero rows and is discarded.
      from: claimableFor(target),
      to: target,
      ...(input.response !== undefined ? { response: input.response } : {}),
      at: now(),
    });

    if (!claim) {
      // Someone else won, or the row was already terminal, or the target is the
      // status it already holds. All three are fine. Return what is on the row.
      const current = await tx.getTransaction(input.referenceId);
      if (!current) return { applied: false, status: target, reason: 'NOT_FOUND' as const };
      return {
        applied: false,
        status: current.status,
        ...(current.journalId ? { journalId: current.journalId } : {}),
        reason: isTerminal(current.status) ? ('ALREADY_RESOLVED' as const) : ('NO_CHANGE' as const),
      };
    }

    if (!postsLedger(claim.previousStatus, target)) {
      // FAILED, REJECTED, TIMEOUT, INITIATED -> CREATED and CREATED -> PENDING
      // all land here. No money moved, so no journal. The row records what
      // happened and the reconciler carries on.
      return { applied: true, status: target };
    }

    const journalId = await postSuccessfulJournal(tx, claim.row, deps);
    return { applied: true, status: target, journalId };
  });
}

/**
 * Write the ledger for a transaction that has just become SUCCESSFUL.
 *
 * Everything here runs inside the caller's transaction, which is the point: the
 * journal, the `journal_id` back-reference and the outbox notification either
 * all commit with the status change, or none of them do.
 */
async function postSuccessfulJournal(
  tx: MoneyTx,
  row: MomoTransactionRow,
  deps: ResolveDeps,
): Promise<string> {
  const context = deps.contextFor
    ? await deps.contextFor(row)
    : ({ subjectId: row.subjectId } satisfies PostingContext);

  const draft = journalDraftFor({
    purpose: row.purpose,
    amountMinor: row.amountMinor,
    referenceId: row.id,
    context,
    // The row already knows which way the money went; before M3a nothing asked
    // it. Without this, a DISBURSEMENT with an unrecognised purpose posts
    // through the SUSPENSE fallback as money coming IN — a journal that
    // balances perfectly and leaves MOMO_SETTLEMENT wrong by twice the amount.
    direction: row.product === 'DISBURSEMENT' ? 'OUT' : 'IN',
  });

  const written = await writeJournal(tx, draft);

  const attached = await tx.attachJournal(row.id, written.journalId);
  if (!attached) {
    // We won the status claim but lost the journal attach. That should be
    // impossible — both are in this transaction. Refusing to commit is the only
    // safe answer: a second journal for one transaction is a double-posting.
    throw new AppException({
      kind: 'CONFLICT',
      message: `momo_transaction ${row.id} already has a journal`,
    });
  }

  // Side effects go through the OUTBOX, never inline. This is exactly why a
  // webhook replayed five times sends one message: the row is written once,
  // inside the guarded transition that only one caller wins (docs/02 §3.8).
  if (row.initiatedBy) {
    await tx.enqueueOutbox({
      channel: 'PUSH',
      recipient: row.initiatedBy,
      payload: {
        event: 'PAYMENT_SUCCESSFUL',
        transactionId: row.id,
        journalId: written.journalId,
        purpose: row.purpose,
        // bigint is not JSON-serialisable, and this is minor units, so a string
        // is the only lossless carrier. Never a float.
        amountMinor: row.amountMinor.toString(),
        // POPIA s105/106: masked, always. `maskMsisdn` is the frozen helper.
        counterparty: maskMsisdn(row.counterparty),
      },
    });
  }

  return written.journalId;
}
