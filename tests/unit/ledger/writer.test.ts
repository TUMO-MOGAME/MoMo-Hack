/**
 * The single ledger writer (`src/server/ledger/journal.ts`).
 *
 * These run against the in-memory `MoneyDb`, which reproduces the four database
 * invariants from 0001_ledger.sql. The equivalent suite against a real Postgres
 * is M1a's `+int` level and is owed once F4/F5 land (STATUS.md).
 */

import { describe, expect, test } from 'vitest';
import { MOMO_SETTLEMENT, escrowHold, userWallet } from '@/domain/ledger/accounts';
import { UnbalancedJournalError } from '@/domain/ledger/journal';
import { describeJournal, writeJournal } from '@/server/ledger/journal';
import { db, JOB_ID, OWNER_ID } from './_fixtures';

describe('writeJournal', () => {
  test('writes a balanced journal and leaves the ledger summing to zero', async () => {
    const memory = db();

    const result = await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'ESCROW_FUND',
        referenceId: '00000000-0000-4000-8000-000000000001',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 50_000n },
          { account: escrowHold(JOB_ID), amount: -50_000n },
        ],
      }),
    );

    expect(result.entries).toBe(2);
    expect(result.total).toBe(0n);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.journalCount()).toBe(1);
    expect(memory.accountBalance(escrowHold(JOB_ID))).toBe(-50_000n);
  });

  test('refuses an unbalanced journal BEFORE writing a single row', async () => {
    const memory = db();

    await expect(
      memory.transaction((tx) =>
        writeJournal(tx, {
          kind: 'FARE',
          postings: [
            { account: MOMO_SETTLEMENT, amount: 1250n },
            { account: userWallet(OWNER_ID), amount: -1000n },
          ],
        }),
      ),
    ).rejects.toThrow(UnbalancedJournalError);

    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('reuses one account row for repeated references to the same account', async () => {
    const memory = db();

    await memory.transaction(async (tx) => {
      await writeJournal(tx, {
        kind: 'A',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 100n },
          { account: userWallet(OWNER_ID), amount: -100n },
        ],
      });
      await writeJournal(tx, {
        kind: 'B',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 200n },
          { account: userWallet(OWNER_ID), amount: -200n },
        ],
      });
    });

    expect(memory.accountBalance(userWallet(OWNER_ID))).toBe(-300n);
    expect(memory.accountBalance(MOMO_SETTLEMENT)).toBe(300n);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('merges duplicate postings so the same account gets one row', async () => {
    const memory = db();

    const result = await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'FARE',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1250n },
          { account: userWallet(OWNER_ID), amount: -750n },
          { account: userWallet(OWNER_ID), amount: -500n },
        ],
      }),
    );

    expect(result.entries).toBe(2);
    expect(memory.accountBalance(userWallet(OWNER_ID))).toBe(-1250n);
  });

  test('a rollback removes the journal AND its postings — no orphans', async () => {
    const memory = db();

    await expect(
      memory.transaction(async (tx) => {
        await writeJournal(tx, {
          kind: 'GOOD',
          postings: [
            { account: MOMO_SETTLEMENT, amount: 100n },
            { account: userWallet(OWNER_ID), amount: -100n },
          ],
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
    expect(memory.accountBalance(userWallet(OWNER_ID))).toBe(0n);
  });
});

describe('the overdraft invariant (I3)', () => {
  test('a credit-normal account cannot be paid out beyond what was funded', async () => {
    const memory = db();

    // Fund R500 into escrow...
    await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'ESCROW_FUND',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 50_000n },
          { account: escrowHold(JOB_ID), amount: -50_000n },
        ],
      }),
    );

    // ...then try to release R600 out of it.
    await expect(
      memory.transaction((tx) =>
        writeJournal(tx, {
          kind: 'ESCROW_RELEASE',
          postings: [
            { account: escrowHold(JOB_ID), amount: 60_000n },
            { account: MOMO_SETTLEMENT, amount: -60_000n },
          ],
        }),
      ),
    ).rejects.toThrow(/overdrawn/);

    expect(memory.accountBalance(escrowHold(JOB_ID))).toBe(-50_000n);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('MOMO_SETTLEMENT is debit-normal — we cannot disburse money we do not hold', async () => {
    const memory = db();

    // This is the case the version printed in docs/02 §3.3 gets backwards: it
    // checks `bal > 0` for every account, which would reject the very first
    // collection. The direction has to follow the account's normal balance.
    await expect(
      memory.transaction((tx) =>
        writeJournal(tx, {
          kind: 'OWNER_PAYOUT',
          postings: [
            { account: userWallet(OWNER_ID), amount: 10_000n },
            { account: MOMO_SETTLEMENT, amount: -10_000n },
          ],
        }),
      ),
    ).rejects.toThrow(/overdrawn/);
  });

  test('a collection into MOMO_SETTLEMENT is fine — the positive side is its normal balance', async () => {
    const memory = db();

    await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'FARE',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1250n },
          { account: userWallet(OWNER_ID), amount: -1250n },
        ],
      }),
    );

    expect(memory.accountBalance(MOMO_SETTLEMENT)).toBe(1250n);
  });

  test('PLATFORM_FEE, ROUNDING and SUSPENSE are allowed to cross', async () => {
    const memory = db();

    await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'ELECTRICITY',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 10_000n },
          { account: { type: 'SUSPENSE' }, amount: -10_000n },
        ],
      }),
    );

    // Then clear the suspense out again the other way.
    await memory.transaction((tx) =>
      writeJournal(tx, {
        kind: 'ELECTRICITY_SETTLED',
        postings: [
          { account: { type: 'SUSPENSE' }, amount: 20_000n },
          { account: { type: 'PLATFORM_FEE' }, amount: -20_000n },
        ],
      }),
    );

    // SUSPENSE at +10000 would be an alarm in production (A5 §1) but is not a
    // constraint violation — which is exactly the distinction we want.
    expect(memory.accountBalance({ type: 'SUSPENSE' })).toBe(10_000n);
    expect(memory.ledgerSum()).toBe(0n);
  });
});

describe('describeJournal', () => {
  test('names account types and amounts, never a person', () => {
    const line = describeJournal({
      kind: 'ESCROW_FUND',
      postings: [
        { account: MOMO_SETTLEMENT, amount: 50_000n },
        { account: escrowHold(JOB_ID), amount: -50_000n },
      ],
    });

    expect(line).toContain('ESCROW_FUND');
    expect(line).toContain('50000');
    expect(line).not.toMatch(/\+?\d{11}/); // no MSISDN-shaped run
  });
});
