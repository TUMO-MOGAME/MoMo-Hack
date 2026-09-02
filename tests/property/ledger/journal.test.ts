/**
 * P3 and P6 from docs/04 §3 — the ledger properties.
 *
 * P3: any sequence of domain operations leaves the ledger summing to zero.
 * P6: no account that forbids it ever goes negative.
 *
 * These run a randomly generated sequence of REAL money operations through the
 * real journal builders and the real single writer, against the in-memory
 * `MoneyDb`. Rejected operations roll back, which means the property also
 * covers the failure path — the one a hand-written test always forgets.
 *
 * "Any function that touches money gets a property test before it gets a unit
 * test. Examples prove a case works; properties prove the category works."
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { ACCOUNT_TYPES, type AccountType, allowsNegative, isDebitNormal } from '@/domain/ledger/accounts';
import { journalTotal } from '@/domain/ledger/journal';
import { POSTING_PURPOSES, journalDraftFor } from '@/domain/ledger/postings';
import { createMemoryDb } from '@/server/db/memory';
import { writeJournal } from '@/server/ledger/journal';
import { resolveTransaction } from '@/server/momo/resolve';
import { TERMINAL_STATUSES, type MomoStatus } from '@/domain/ledger/state-machine';

const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DRIVER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const RANK = 'cccccccc-3333-4333-8333-cccccccccccc';
const SUBJECT = 'dddddddd-4444-4444-8444-dddddddddddd';
const PAYER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

const CONTEXT = {
  ownerId: OWNER,
  driverId: DRIVER,
  rankId: RANK,
  subjectId: SUBJECT,
  beneficiaryId: PAYER,
  lockedCategory: 'SCHOOL_FEES',
};

interface Operation {
  readonly purpose: string;
  readonly amountMinor: bigint;
  readonly outcome: MomoStatus;
}

const arbOperation: fc.Arbitrary<Operation> = fc.record({
  purpose: fc.constantFrom(...POSTING_PURPOSES),
  amountMinor: fc.bigInt({ min: 1n, max: 10_000_000n }),
  outcome: fc.constantFrom<MomoStatus>(...TERMINAL_STATUSES, 'PENDING', 'CREATED'),
});

let sequence = 0;
function reference(): string {
  sequence++;
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

describe('P3 — any sequence of operations leaves the ledger balanced', () => {
  test('through the full resolve path, including rollbacks', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOperation, { maxLength: 40 }), async (operations) => {
        const memory = createMemoryDb({ interleave: false });

        for (const op of operations) {
          const id = reference();
          memory.seedTransaction({
            id,
            product: 'COLLECTION',
            status: 'PENDING',
            amountMinor: op.amountMinor,
            counterparty: '46733123454',
            externalId: `ext-${id}`,
            purpose: op.purpose,
            subjectId: SUBJECT,
            initiatedBy: PAYER,
          });

          // An operation may legitimately be refused — an overdraft, a fee
          // larger than the amount, a missing context. A refusal must roll back
          // cleanly and leave the books exactly as they were.
          await resolveTransaction(
            { db: memory, contextFor: () => CONTEXT },
            { referenceId: id, observed: op.outcome },
          ).catch(() => undefined);

          // THE INVARIANT, checked after EVERY step, not just at the end.
          expect(memory.ledgerSum()).toBe(0n);
        }

        expect(memory.ledgerSum()).toBe(0n);
      }),
      { numRuns: 150 },
    );
  });

  test('every journal a builder produces sums to exactly zero', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...POSTING_PURPOSES),
        fc.bigInt({ min: 1n, max: 100_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1000n }),
        (purpose, amountMinor, fee) => {
          const draft = journalDraftFor({
            purpose,
            amountMinor,
            context: { ...CONTEXT, feeMinor: fee <= amountMinor ? fee : 0n },
          });

          expect(journalTotal(draft.postings)).toBe(0n);
          expect(draft.postings.every((p) => p.amount !== 0n)).toBe(true);
          expect(draft.postings.length).toBeGreaterThanOrEqual(2);
        },
      ),
      { numRuns: 5000 },
    );
  });

  test('a fare never creates or destroys a cent, at any amount', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 100_000_000_000n }), (amountMinor) => {
        const draft = journalDraftFor({ purpose: 'FARE', amountMinor, context: CONTEXT });

        const debited = draft.postings
          .filter((p) => p.amount > 0n)
          .reduce<bigint>((a, p) => a + p.amount, 0n);
        const credited = draft.postings
          .filter((p) => p.amount < 0n)
          .reduce<bigint>((a, p) => a - p.amount, 0n);

        expect(debited).toBe(amountMinor);
        expect(credited).toBe(amountMinor);
      }),
      { numRuns: 5000 },
    );
  });
});

describe('P6 — a guarded account never goes negative', () => {
  test('an overdraft is refused and rolled back, whatever the sequence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            fund: fc.bigInt({ min: 1n, max: 100_000n }),
            release: fc.bigInt({ min: 1n, max: 200_000n }),
          }),
          { maxLength: 20 },
        ),
        async (steps) => {
          const memory = createMemoryDb({ interleave: false });
          let held = 0n;

          for (const step of steps) {
            await memory
              .transaction((tx) =>
                writeJournal(tx, {
                  kind: 'ESCROW_FUND',
                  postings: [
                    { account: { type: 'MOMO_SETTLEMENT' }, amount: step.fund },
                    { account: { type: 'ESCROW_HOLD', subjectId: SUBJECT }, amount: -step.fund },
                  ],
                }),
              )
              .then(() => {
                held += step.fund;
              })
              .catch(() => undefined);

            await memory
              .transaction((tx) =>
                writeJournal(tx, {
                  kind: 'ESCROW_RELEASE',
                  postings: [
                    { account: { type: 'ESCROW_HOLD', subjectId: SUBJECT }, amount: step.release },
                    { account: { type: 'MOMO_SETTLEMENT' }, amount: -step.release },
                  ],
                }),
              )
              .then(() => {
                held -= step.release;
              })
              .catch(() => undefined);

            // The hold is credit-normal: its balance is at or below zero, and
            // its magnitude is exactly what remains funded.
            expect(memory.accountBalance({ type: 'ESCROW_HOLD', subjectId: SUBJECT })).toBe(-held);
            expect(held).toBeGreaterThanOrEqual(0n);
            expect(memory.ledgerSum()).toBe(0n);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  test('MOMO_SETTLEMENT can never be disbursed below zero', async () => {
    const memory = createMemoryDb({ interleave: false });

    await expect(
      memory.transaction((tx) =>
        writeJournal(tx, {
          kind: 'OWNER_PAYOUT',
          postings: [
            { account: { type: 'USER_WALLET', ownerId: OWNER }, amount: 1n },
            { account: { type: 'MOMO_SETTLEMENT' }, amount: -1n },
          ],
        }),
      ),
    ).rejects.toThrow(/overdrawn/);

    expect(memory.ledgerSum()).toBe(0n);
  });
});

describe('the chart of accounts is internally consistent', () => {
  test('exactly one account type is debit-normal', () => {
    expect(ACCOUNT_TYPES.filter(isDebitNormal)).toEqual(['MOMO_SETTLEMENT']);
  });

  test('an account that allows negatives is never also custodial', () => {
    // The three that may cross their normal balance are book-keeping accounts.
    // No user's money sits in them, so a transient sign flip loses nobody a cent.
    const permissive = ACCOUNT_TYPES.filter(allowsNegative);
    const custodial: AccountType[] = [
      'USER_WALLET',
      'ESCROW_HOLD',
      'STOKVEL_POOL',
      'FAMILY_LOCKED',
      'FUEL_POOL',
      'INSURANCE_POOL',
      'DRIVER_FLOAT',
    ];

    for (const type of custodial) expect(permissive).not.toContain(type);
  });
});
