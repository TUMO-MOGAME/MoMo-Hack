/**
 * Shared fixtures for the ledger suite. Not a `.test.ts`, so vitest skips it.
 *
 * Every MSISDN here comes from `src/lib/momo/test-msisdns.ts`. Any other number
 * ALWAYS returns SUCCESSFUL in the sandbox, so a test written with a made-up
 * number is a test that cannot fail (momoAPIs.md §10, docs/04 §6).
 */

import { createMemoryDb, type MemoryDb } from '@/server/db/memory';
import type { NewMomoTransaction } from '@/server/db/types';
import { TEST_MSISDN } from '@/lib/momo/test-msisdns';

export const OWNER_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const DRIVER_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
export const RANK_ID = 'cccccccc-3333-4333-8333-cccccccccccc';
export const JOB_ID = 'dddddddd-4444-4444-8444-dddddddddddd';
export const CLIENT_ID = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

let counter = 0;

/** A UUID v4 shaped id, deterministic per test run so failures are replayable. */
export function nextReference(): string {
  counter++;
  const tail = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${tail}`;
}

export function resetReferences(): void {
  counter = 0;
}

/**
 * A memory db. Pass `now` whenever the test fakes time: `createdAt` is
 * stamped by the STORE, so a store on the real clock and a reconciler on a
 * fake one disagree about every age, and the row is silently skipped.
 */
export function db(now?: () => Date): MemoryDb {
  return createMemoryDb(now ? { now } : {});
}

export function collection(overrides: Partial<NewMomoTransaction> = {}): NewMomoTransaction {
  const id = overrides.id ?? nextReference();
  return {
    id,
    product: 'COLLECTION',
    amountMinor: 1250n,
    counterparty: TEST_MSISDN.ASYNC_SUCCESS,
    externalId: `fare-${id.slice(-6)}`,
    purpose: 'ESCROW_FUND',
    subjectId: JOB_ID,
    initiatedBy: CLIENT_ID,
    ...overrides,
  };
}

/** Seed a PENDING collection, the state a resolver actually finds in the wild. */
export function seedPending(
  memory: MemoryDb,
  overrides: Partial<NewMomoTransaction> = {},
): string {
  const row = collection(overrides);
  memory.seedTransaction({ ...row, status: 'PENDING' });
  return row.id;
}
