/**
 * The concurrency heart of the system (docs/04 §4).
 *
 * A webhook replay, a reconciler tick and a manual retry can all land on the
 * same transaction at the same moment. Exactly one of them may post the ledger.
 *
 * This suite runs against the in-memory `MoneyDb`, whose `claimTransition` is a
 * SYNCHRONOUS check-and-set with no await between the read and the write —
 * which is precisely the exclusion Postgres gives us with `for update` plus
 * `WHERE id = $1 AND status IN (...)` on a single row. Every OTHER operation in
 * that store yields to the microtask queue, so the resolvers genuinely
 * interleave; without that this would prove nothing.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { MOMO_SETTLEMENT, escrowHold } from '@/domain/ledger/accounts';
import { resolveTransaction } from '@/server/momo/resolve';
import type { MemoryDb } from '@/server/db/memory';
import { JOB_ID, db, nextReference, resetReferences, seedPending } from './_fixtures';

let memory: MemoryDb;

beforeEach(() => {
  resetReferences();
  memory = db();
});

describe('N parallel resolvers', () => {
  test('ten concurrent resolvers produce EXACTLY ONE journal', async () => {
    const id = seedPending(memory, { amountMinor: 1250n });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      ),
    );

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(memory.journalsFor(id)).toBe(1);
    expect(memory.journalCount()).toBe(1);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.accountBalance(escrowHold(JOB_ID))).toBe(-1250n);
  });

  test('the nine losers report success, not an error', async () => {
    // "Zero rows updated means someone else won the race — that is success, not
    // an error" (momoAPIs.md §12 rule 2). If a loser threw, every replayed
    // webhook would 500 and MTN would keep retrying it.
    const id = seedPending(memory);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      ),
    );

    const winner = results.find((r) => r.applied);
    const losers = results.filter((r) => !r.applied);

    expect(losers).toHaveLength(9);
    for (const loser of losers) {
      expect(loser.status).toBe('SUCCESSFUL');
      expect(loser.reason).toBe('ALREADY_RESOLVED');
      // A loser reports the journal id once the winner has attached it. In
      // Postgres it ALWAYS will, because `for update` makes the loser block
      // until the winner commits. The in-memory double has no such isolation,
      // so a loser that overtook the winner mid-transaction legitimately sees
      // none yet — the assertion is "never a DIFFERENT journal", which is the
      // property that actually matters.
      if (loser.journalId !== undefined) expect(loser.journalId).toBe(winner?.journalId);
    }
  });

  test('exactly one outbox row — a webhook replayed ten times sends one message', async () => {
    const id = seedPending(memory);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      ),
    );

    expect(memory.outbox()).toHaveLength(1);
  });

  test('concurrent CONTRADICTORY observations still produce one outcome', async () => {
    // The nastiest real case: a late FAILED callback racing a SUCCESSFUL poll.
    const id = seedPending(memory);

    const results = await Promise.all([
      resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      resolveTransaction({ db: memory }, { referenceId: id, observed: 'FAILED' }),
      resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      resolveTransaction({ db: memory }, { referenceId: id, observed: 'TIMEOUT' }),
    ]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);

    const final = memory.transaction_(id)?.status;
    // Whichever won, the books agree with the row: a journal iff SUCCESSFUL.
    expect(memory.journalsFor(id)).toBe(final === 'SUCCESSFUL' ? 1 : 0);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('fifty concurrent fares leave the ledger summing to zero', async () => {
    // The load test in docs/04 §8 asserts correctness, not latency. This is its
    // in-process cousin: 50 independent transactions, all resolved at once.
    const ids = Array.from({ length: 50 }, () => seedPending(memory, { id: nextReference() }));

    await Promise.all(
      ids.flatMap((id) => [
        resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
        resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
      ]),
    );

    expect(memory.journalCount()).toBe(50);
    expect(memory.outbox()).toHaveLength(50);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.accountBalance(MOMO_SETTLEMENT)).toBe(50n * 1250n);
    for (const id of ids) expect(memory.journalsFor(id)).toBe(1);
  });
});

describe('journal_id is write-once', () => {
  test('a second attach on the same transaction is refused', async () => {
    const id = seedPending(memory);

    await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' });
    const journalId = memory.transaction_(id)?.journalId;
    expect(journalId).toBeDefined();

    const attachedAgain = await memory.transaction((tx) => tx.attachJournal(id, 'other-journal'));

    expect(attachedAgain).toBe(false);
    expect(memory.transaction_(id)?.journalId).toBe(journalId);
  });
});
