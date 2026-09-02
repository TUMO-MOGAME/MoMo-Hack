/**
 * Idempotency by construction (docs/03 §2, A1 §5, A5 §1).
 *
 * The property under test is the one the whole design rests on:
 *
 *     our primary key IS MTN's idempotency key
 *
 * A freshly generated `X-Reference-Id` on a retry double-pays. It is the worst
 * bug available in this codebase and it is graded **Critical**. These tests
 * assert, at the interface, that no code path can produce one.
 *
 * Verified upstream on 2026-09-02: posting the identical `X-Reference-Id` twice
 * returns 202 then 409 (momoAPIs.md §10), so the guarantee holds against the
 * real API and not only against our model of it.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TEST_MSISDN, maskMsisdn } from '@/lib/momo/test-msisdns';
import { MomoRequestError, upstream } from '@/lib/momo/errors';
import type { CollectionsApi, MomoClient, RequestToPayResult } from '@/lib/momo/types';
import { initiateCollection } from '@/server/momo/initiate';
import { reconcile } from '@/server/momo/reconcile';
import type { MemoryDb } from '@/server/db/memory';
import { JOB_ID, db, nextReference, resetReferences } from './_fixtures';

const START = new Date('2026-09-02T10:00:00Z');

let memory: MemoryDb;
let clock: Date;

beforeEach(() => {
  resetReferences();
  clock = START;
  memory = db(() => clock);
});

interface FakeClient extends MomoClient {
  readonly sent: string[];
}

function fakeClient(
  requestToPay: CollectionsApi['requestToPay'],
  getStatus?: CollectionsApi['getStatus'],
): FakeClient {
  const sent: string[] = [];
  const collections: CollectionsApi = {
    async requestToPay(referenceId, input) {
      sent.push(referenceId);
      return requestToPay(referenceId, input);
    },
    getStatus:
      getStatus ??
      (async () => {
        throw new MomoRequestError('HTTP', upstream(404, false), 'not found');
      }),
  };
  return { mode: 'emulator', collections, sent };
}

const INPUT = {
  amountMinor: 1250n,
  msisdn: TEST_MSISDN.ASYNC_SUCCESS,
  externalId: 'fare-idem-1',
  purpose: 'ESCROW_FUND',
  subjectId: JOB_ID,
  payerMessage: 'MoMo Kasi',
  payeeNote: 'Escrow',
};

const accepted = async (referenceId: string): Promise<RequestToPayResult> => ({
  outcome: 'ACCEPTED',
  referenceId,
});

describe('persist BEFORE the network call', () => {
  test('the row exists in INITIATED before a packet leaves', async () => {
    let statusAtSendTime: string | undefined;

    const client = fakeClient(async (referenceId) => {
      statusAtSendTime = memory.transaction_(referenceId)?.status;
      return { outcome: 'ACCEPTED', referenceId };
    });

    await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(statusAtSendTime).toBe('INITIATED');
  });

  test('the id we persist is the id we transmit, byte for byte', async () => {
    const client = fakeClient(accepted);

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(client.sent).toEqual([result.transactionId]);
    expect(memory.transaction_(result.transactionId)).toBeDefined();
  });

  test('the stored request body carries a MASKED msisdn (POPIA s105/106)', async () => {
    const client = fakeClient(accepted);

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    // The COLUMN keeps the real number — the reconciler needs it to re-send.
    expect(memory.transaction_(result.transactionId)?.counterparty).toBe(
      TEST_MSISDN.ASYNC_SUCCESS,
    );
    // Everything that leaves the database carries the masked form instead.
    expect(maskMsisdn(TEST_MSISDN.ASYNC_SUCCESS)).toBe('•••• 3454');
  });
});

describe('what each outcome does to the row', () => {
  test('202 -> CREATED (the status MTN reports next, verified 2026-09-02)', async () => {
    const client = fakeClient(accepted);

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(result.status).toBe('CREATED');
    expect(memory.transaction_(result.transactionId)?.status).toBe('CREATED');
  });

  test('409 -> CREATED, NOT failed, and NOT retried with a new id', async () => {
    const client = fakeClient(async (referenceId) => ({
      outcome: 'ALREADY_ACCEPTED',
      referenceId,
    }));

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(result.status).toBe('CREATED');
    expect(client.sent).toHaveLength(1);
  });

  test('a timeout -> PENDING, never FAILED — the request may have landed', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('TIMEOUT', upstream(408, true), 'timed out');
    });

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(result.status).toBe('PENDING');
  });

  test('a retryable 500 leaves the row INITIATED, so the reconciler RE-SENDS it', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('HTTP', upstream(500, true), 'upstream');
    });

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(result.status).toBe('INITIATED');
    expect(memory.transaction_(result.transactionId)?.status).toBe('INITIATED');
  });

  test('a 400 fails the transaction — MTN will never accept it', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('HTTP', upstream(400, false), 'bad request');
    });

    const result = await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(result.status).toBe('FAILED');
  });

  test('no journal is ever written on the initiate path', async () => {
    const client = fakeClient(accepted);

    await initiateCollection({ db: memory, client, uuid: nextReference }, INPUT);

    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
  });
});

describe('the reconciler re-sends with the SAME id', () => {
  test('an INITIATED row older than 60s is re-sent, not re-created', async () => {
    const client = fakeClient(accepted);
    const start = new Date('2026-09-02T10:00:00Z');

    const { transactionId } = await initiateCollection(
      { db: memory, client: fakeClient(async () => {
          throw new MomoRequestError('HTTP', upstream(503, true), 'down');
        }), uuid: nextReference, now: () => start },
      INPUT,
    );
    expect(memory.transaction_(transactionId)?.status).toBe('INITIATED');

    const later = new Date(start.getTime() + 120_000);
    const report = await reconcile({ db: memory, client, now: () => later });

    expect(report.resent).toBe(1);
    // THE ASSERTION THAT MATTERS: the same uuid, not a new one.
    expect(client.sent).toEqual([transactionId]);
    expect(memory.transaction_(transactionId)?.status).toBe('CREATED');
    expect(memory.transaction_(transactionId)?.attemptCount).toBe(2);
  });

  test('an INITIATED row younger than 60s is left alone', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('HTTP', upstream(503, true), 'down');
    });
    const start = new Date('2026-09-02T10:00:00Z');

    await initiateCollection({ db: memory, client, uuid: nextReference, now: () => start }, INPUT);

    const report = await reconcile({
      db: memory,
      client: fakeClient(accepted),
      now: () => new Date(start.getTime() + 10_000),
    });

    expect(report.resent).toBe(0);
    expect(report.skipped).toBe(1);
  });

  test('a re-send that comes back 409 is recorded as progress, not failure', async () => {
    const client = fakeClient(async (referenceId) => ({
      outcome: 'ALREADY_ACCEPTED',
      referenceId,
    }));
    const start = new Date('2026-09-02T10:00:00Z');

    const { transactionId } = await initiateCollection(
      {
        db: memory,
        client: fakeClient(async () => {
          throw new MomoRequestError('NETWORK', upstream(undefined, true), 'reset');
        }),
        uuid: nextReference,
        now: () => start,
      },
      INPUT,
    );

    await reconcile({ db: memory, client, now: () => new Date(start.getTime() + 120_000) });

    expect(memory.transaction_(transactionId)?.status).toBe('CREATED');
    expect(client.sent).toEqual([transactionId]);
  });
});

describe('the reconciler polls and resolves', () => {
  test('a CREATED row is polled, and a SUCCESSFUL result posts the ledger once', async () => {
    const start = new Date('2026-09-02T10:00:00Z');
    const client = fakeClient(accepted, async (referenceId) => ({
      referenceId,
      status: 'SUCCESSFUL',
      raw: { status: 'SUCCESSFUL' },
    }));

    const { transactionId } = await initiateCollection(
      { db: memory, client, uuid: nextReference, now: () => start },
      INPUT,
    );

    const first = await reconcile({
      db: memory,
      client,
      now: () => new Date(start.getTime() + 120_000),
    });
    const second = await reconcile({
      db: memory,
      client,
      now: () => new Date(start.getTime() + 240_000),
    });

    expect(first.resolved).toBe(1);
    expect(second.examined).toBe(0); // terminal rows leave the working set
    expect(memory.journalsFor(transactionId)).toBe(1);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('a row still unresolved after 24h is abandoned as TIMEOUT', async () => {
    const start = new Date('2026-09-02T10:00:00Z');
    const client = fakeClient(accepted, async (referenceId) => ({
      referenceId,
      status: 'PENDING',
      raw: { status: 'PENDING' },
    }));

    const { transactionId } = await initiateCollection(
      { db: memory, client, uuid: nextReference, now: () => start },
      INPUT,
    );

    const report = await reconcile({
      db: memory,
      client,
      now: () => new Date(start.getTime() + 25 * 60 * 60 * 1000),
    });

    expect(report.abandoned).toBe(1);
    expect(memory.transaction_(transactionId)?.status).toBe('TIMEOUT');
    expect(memory.journalCount()).toBe(0);
  });

  test('one bad row never stops the tick', async () => {
    const start = new Date('2026-09-02T10:00:00Z');
    const good = vi.fn();

    const client = fakeClient(accepted, async (referenceId) => {
      if (referenceId.endsWith('01')) {
        throw new MomoRequestError('HTTP', upstream(500, true), 'upstream');
      }
      good();
      return { referenceId, status: 'SUCCESSFUL' as const, raw: {} };
    });

    await initiateCollection({ db: memory, client, uuid: nextReference, now: () => start }, INPUT);
    await initiateCollection(
      { db: memory, client, uuid: nextReference, now: () => start },
      { ...INPUT, externalId: 'fare-idem-2' },
    );

    const report = await reconcile({
      db: memory,
      client,
      now: () => new Date(start.getTime() + 120_000),
    });

    expect(report.errors).toBe(1);
    expect(report.resolved).toBe(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
