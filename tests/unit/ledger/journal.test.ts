/**
 * The journal invariant and the account chart (docs/02 §2, §3.3).
 */

import { describe, expect, test } from 'vitest';
import {
  ACCOUNT_TYPES,
  accountKey,
  allowsNegative,
  escrowHold,
  isDebitNormal,
  MOMO_SETTLEMENT,
  sameAccount,
  userWallet,
} from '@/domain/ledger/accounts';
import {
  InvalidJournalError,
  UnbalancedJournalError,
  assertWritable,
  journalTotal,
  mergePostings,
} from '@/domain/ledger/journal';
import { OWNER_ID, JOB_ID } from './_fixtures';

describe('chart of accounts', () => {
  test('has the eleven types from docs/02 §2, and only those', () => {
    expect([...ACCOUNT_TYPES]).toEqual([
      'MOMO_SETTLEMENT',
      'USER_WALLET',
      'ESCROW_HOLD',
      'STOKVEL_POOL',
      'FAMILY_LOCKED',
      'FUEL_POOL',
      'INSURANCE_POOL',
      'DRIVER_FLOAT',
      'PLATFORM_FEE',
      'ROUNDING',
      'SUSPENSE',
    ]);
  });

  test('MOMO_SETTLEMENT is the only debit-normal account', () => {
    // It is the money we hold at MTN, the system's one external door. This must
    // stay in step with `account_is_debit_normal()` in 0001_ledger.sql; if the
    // two ever disagree, the overdraft trigger checks the wrong direction.
    const debitNormal = ACCOUNT_TYPES.filter(isDebitNormal);
    expect(debitNormal).toEqual(['MOMO_SETTLEMENT']);
  });

  test('only the three book-keeping accounts may cross their normal balance', () => {
    const negatives = ACCOUNT_TYPES.filter(allowsNegative);
    expect(negatives).toEqual(['PLATFORM_FEE', 'ROUNDING', 'SUSPENSE']);
  });

  test('the natural key distinguishes accounts of the same type', () => {
    expect(sameAccount(userWallet(OWNER_ID), userWallet(OWNER_ID))).toBe(true);
    expect(sameAccount(userWallet(OWNER_ID), userWallet(JOB_ID))).toBe(false);
    expect(accountKey(MOMO_SETTLEMENT)).toBe('MOMO_SETTLEMENT:-:-:ZAR');
  });

  test('an escrow account is scoped to its job — that IS the hold', () => {
    // Spendable balance excludes holds by construction: escrow lives in a
    // different account, so it is simply not in the USER_WALLET sum. There is
    // no available_balance arithmetic to get wrong (docs/02 §3.4).
    expect(sameAccount(escrowHold(JOB_ID), userWallet(JOB_ID))).toBe(false);
  });
});

describe('assertWritable', () => {
  const A = userWallet(OWNER_ID);

  test('accepts a balanced journal', () => {
    expect(() =>
      assertWritable({
        kind: 'TEST',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1250n },
          { account: A, amount: -1250n },
        ],
      }),
    ).not.toThrow();
  });

  test('refuses one that does not sum to zero', () => {
    expect(() =>
      assertWritable({
        kind: 'FARE',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1250n },
          { account: A, amount: -1249n },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
  });

  test('the error names the kind and the exact drift', () => {
    try {
      assertWritable({
        kind: 'FARE',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1250n },
          { account: A, amount: -1249n },
        ],
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnbalancedJournalError);
      expect((e as UnbalancedJournalError).total).toBe(1n);
      expect((e as Error).message).toContain('FARE');
    }
  });

  test('refuses a single-posting journal even when it sums to zero', () => {
    // CLAUDE.md #2: every value movement is >= 2 postings. A one-row journal is
    // either unbalanced or a no-op, and both are bugs.
    expect(() =>
      assertWritable({ kind: 'TEST', postings: [{ account: A, amount: 0n }] }),
    ).toThrow(InvalidJournalError);
  });

  test('refuses a zero posting', () => {
    expect(() =>
      assertWritable({
        kind: 'TEST',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 100n },
          { account: A, amount: -100n },
          { account: escrowHold(JOB_ID), amount: 0n },
        ],
      }),
    ).toThrow(InvalidJournalError);
  });

  test('refuses a journal with no kind', () => {
    expect(() =>
      assertWritable({
        kind: '  ',
        postings: [
          { account: MOMO_SETTLEMENT, amount: 1n },
          { account: A, amount: -1n },
        ],
      }),
    ).toThrow(InvalidJournalError);
  });
});

describe('mergePostings', () => {
  test('collapses repeated accounts, preserving first-appearance order', () => {
    const merged = mergePostings([
      { account: MOMO_SETTLEMENT, amount: 1000n },
      { account: userWallet(OWNER_ID), amount: -600n },
      { account: MOMO_SETTLEMENT, amount: 250n },
      { account: userWallet(OWNER_ID), amount: -650n },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]?.amount).toBe(1250n);
    expect(merged[1]?.amount).toBe(-1250n);
  });

  test('drops an account that cancels to zero — nothing moved there', () => {
    const merged = mergePostings([
      { account: MOMO_SETTLEMENT, amount: 500n },
      { account: userWallet(OWNER_ID), amount: -500n },
      { account: userWallet(OWNER_ID), amount: 500n },
      { account: escrowHold(JOB_ID), amount: -500n },
    ]);

    expect(merged.map((p) => accountKey(p.account))).toEqual([
      accountKey(MOMO_SETTLEMENT),
      accountKey(escrowHold(JOB_ID)),
    ]);
  });

  test('never changes the total', () => {
    const postings = [
      { account: MOMO_SETTLEMENT, amount: 1250n },
      { account: userWallet(OWNER_ID), amount: -750n },
      { account: userWallet(OWNER_ID), amount: -500n },
    ];
    expect(journalTotal(mergePostings(postings))).toBe(journalTotal(postings));
  });
});
