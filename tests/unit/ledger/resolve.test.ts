/**
 * The single resolver (`src/server/momo/resolve.ts`).
 *
 * The behaviours here are the ones a replayed webhook, a late callback and a
 * racing reconciler all depend on. Chaos drills (Q6) exercise the same paths
 * through the HTTP edge; these pin the semantics.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { escrowHold, MOMO_SETTLEMENT } from '@/domain/ledger/accounts';
import { resolveTransaction } from '@/server/momo/resolve';
import { db, JOB_ID, resetReferences, seedPending } from './_fixtures';
import type { MemoryDb } from '@/server/db/memory';

let memory: MemoryDb;

beforeEach(() => {
  resetReferences();
  memory = db();
});

describe('a successful resolution', () => {
  test('writes the journal, sets journal_id, and enqueues exactly one outbox row', async () => {
    const id = seedPending(memory, { amountMinor: 50_000n });

    const result = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' });

    expect(result.applied).toBe(true);
    expect(result.status).toBe('SUCCESSFUL');
    expect(result.journalId).toBeDefined();

    expect(memory.transaction_(id)?.journalId).toBe(result.journalId);
    expect(memory.transaction_(id)?.resolvedAt).not.toBeNull();
    expect(memory.journalsFor(id)).toBe(1);
    expect(memory.outbox()).toHaveLength(1);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.accountBalance(escrowHold(JOB_ID))).toBe(-50_000n);
    expect(memory.accountBalance(MOMO_SETTLEMENT)).toBe(50_000n);
  });

  test('the outbox payload carries a MASKED msisdn and a string amount', async () => {
    const id = seedPending(memory, { amountMinor: 1250n });

    await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' });

    const payload = memory.outbox()[0]?.payload;
    // POPIA s105/106 — an MSISDN never leaves in full.
    expect(payload?.counterparty).toBe('•••• 3454');
    // bigint is not JSON-serialisable and a float would lose cents.
    expect(payload?.amountMinor).toBe('1250');
  });

  test('resolving five times produces ONE journal and ONE outbox row', async () => {
    // The replayed-webhook case, straight out of docs/04 §4.
    const id = seedPending(memory);

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }));
    }

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(memory.journalsFor(id)).toBe(1);
    expect(memory.outbox()).toHaveLength(1);
    expect(memory.ledgerSum()).toBe(0n);
  });
});

describe('a failed resolution', () => {
  test.each(['FAILED', 'REJECTED', 'TIMEOUT'] as const)('%s writes NO journal', async (status) => {
    const id = seedPending(memory);

    const result = await resolveTransaction({ db: memory }, { referenceId: id, observed: status });

    expect(result.applied).toBe(true);
    expect(result.status).toBe(status);
    expect(result.journalId).toBeUndefined();
    expect(memory.journalCount()).toBe(0);
    expect(memory.outbox()).toHaveLength(0);
    expect(memory.transaction_(id)?.journalId).toBeNull();
  });
});

describe('terminal states are absorbing', () => {
  test('a late callback contradicting SUCCESSFUL is discarded, never applied', async () => {
    const id = seedPending(memory);
    await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' });

    const late = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'FAILED' });

    expect(late.applied).toBe(false);
    expect(late.reason).toBe('ALREADY_RESOLVED');
    expect(late.status).toBe('SUCCESSFUL');
    expect(memory.transaction_(id)?.status).toBe('SUCCESSFUL');
    expect(memory.journalsFor(id)).toBe(1);
  });

  test('a late SUCCESSFUL after a FAILED does not create money', async () => {
    const id = seedPending(memory);
    await resolveTransaction({ db: memory }, { referenceId: id, observed: 'FAILED' });

    const late = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' });

    expect(late.applied).toBe(false);
    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
  });
});

describe('non-terminal observations', () => {
  test('INITIATED -> PENDING is claimable', async () => {
    const id = seedPending(memory, {}, );
    memory.seedTransaction({ ...memory.transaction_(id)!, status: 'INITIATED' });

    const result = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'PENDING' });

    expect(result.applied).toBe(true);
    expect(memory.transaction_(id)?.status).toBe('PENDING');
    expect(memory.transaction_(id)?.resolvedAt).toBeNull();
  });

  test('PENDING -> PENDING changes nothing, and is not an error', async () => {
    // A status poll that says "still pending" must not look like a resolution.
    const id = seedPending(memory);

    const result = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'PENDING' });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('NO_CHANGE');
    expect(memory.transaction_(id)?.resolvedAt).toBeNull();
  });

  test('MTN reporting INITIATED back at us means the request landed -> PENDING', async () => {
    const id = seedPending(memory);
    memory.seedTransaction({ ...memory.transaction_(id)!, status: 'INITIATED' });

    const result = await resolveTransaction({ db: memory }, { referenceId: id, observed: 'INITIATED' });

    expect(result.status).toBe('PENDING');
    expect(memory.transaction_(id)?.status).toBe('PENDING');
  });
});

describe('unknown references', () => {
  test('are reported, never created', async () => {
    const result = await resolveTransaction(
      { db: memory },
      { referenceId: '00000000-0000-4000-8000-ffffffffffff', observed: 'SUCCESSFUL' },
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('NOT_FOUND');
    expect(memory.journalCount()).toBe(0);
  });
});

describe('posting context', () => {
  test('a custom resolver supplies the accounts a fare needs', async () => {
    const id = seedPending(memory, { purpose: 'FARE', amountMinor: 1250n });

    const result = await resolveTransaction(
      {
        db: memory,
        contextFor: () => ({
          ownerId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          driverId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
          rankId: 'cccccccc-3333-4333-8333-cccccccccccc',
        }),
      },
      { referenceId: id, observed: 'SUCCESSFUL' },
    );

    expect(result.applied).toBe(true);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.accountBalance(MOMO_SETTLEMENT)).toBe(1250n);
  });

  test('a fare with NO context rolls the whole transition back', async () => {
    const id = seedPending(memory, { purpose: 'FARE', amountMinor: 1250n });

    await expect(
      resolveTransaction({ db: memory }, { referenceId: id, observed: 'SUCCESSFUL' }),
    ).rejects.toThrow(/posting context/);

    // The status change and the journal commit together or not at all: the row
    // must still be resolvable on the next reconciler tick.
    expect(memory.transaction_(id)?.status).toBe('PENDING');
    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
  });
});
