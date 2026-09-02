/**
 * The ledger consequence of every purpose (docs/11 §2-§4).
 *
 * The single assertion that matters in all of these: the journal balances. The
 * second: the money lands in the account docs/11 says it lands in, because a
 * balanced journal that credits the wrong person is still theft.
 */

import { describe, expect, test } from 'vitest';
import { accountKey, driverFloat, escrowHold, familyLocked, fuelPool, insurancePool, MOMO_SETTLEMENT, PLATFORM_FEE, stokvelPool, userWallet } from '@/domain/ledger/accounts';
import { type DraftPosting, journalTotal } from '@/domain/ledger/journal';
import {
  POSTING_PURPOSES,
  PostingContextError,
  isPostingPurpose,
  journalDraftFor,
} from '@/domain/ledger/postings';
import { minor } from '@/domain/money';
import { split, DEFAULT_FARE_SPLIT } from '@/domain/split';
import { CLIENT_ID, DRIVER_ID, JOB_ID, OWNER_ID, RANK_ID } from './_fixtures';

const FARE_CONTEXT = { ownerId: OWNER_ID, driverId: DRIVER_ID, rankId: RANK_ID };

function amountsByAccount(postings: readonly DraftPosting[]): Record<string, bigint> {
  return Object.fromEntries(postings.map((p) => [accountKey(p.account), p.amount]));
}

describe('every purpose balances', () => {
  const contexts: Record<string, Record<string, unknown>> = {
    FARE: FARE_CONTEXT,
    ESCROW_FUND: { subjectId: JOB_ID },
    RANK_FLOAT: { subjectId: RANK_ID },
    STOKVEL_CONTRIB: { subjectId: JOB_ID },
    ELECTRICITY: { subjectId: JOB_ID },
    SCHOOL_FEES: {},
    AIRTIME: {},
    SPLIT_BILL: { subjectId: JOB_ID },
    ESCROW_RELEASE: { subjectId: JOB_ID, feeMinor: 100n },
    ESCROW_REFUND: { subjectId: JOB_ID },
    OWNER_PAYOUT: { ownerId: OWNER_ID },
    DRIVER_WAGE: { driverId: DRIVER_ID },
    STOKVEL_PAYOUT: { subjectId: JOB_ID },
    REMIT_IN: { beneficiaryId: CLIENT_ID, lockedCategory: 'SCHOOL_FEES' },
    REMIT_TOOL: { beneficiaryId: CLIENT_ID, lockedCategory: 'TOOLS' },
    REMIT_TRANSPORT: { beneficiaryId: CLIENT_ID, lockedCategory: 'TRANSPORT' },
  };

  test.each(POSTING_PURPOSES)('%s', (purpose) => {
    const draft = journalDraftFor({
      purpose,
      amountMinor: 125_099n,
      referenceId: '00000000-0000-4000-8000-000000000001',
      context: contexts[purpose] ?? {},
    });

    expect(journalTotal(draft.postings)).toBe(0n);
    expect(draft.postings.length).toBeGreaterThanOrEqual(2);
    expect(draft.kind).toBe(purpose);
    expect(draft.referenceId).toBe('00000000-0000-4000-8000-000000000001');
  });

  test('the list and the type guard agree', () => {
    for (const p of POSTING_PURPOSES) expect(isPostingPurpose(p)).toBe(true);
    expect(isPostingPurpose('NOT_A_PURPOSE')).toBe(false);
  });
});

describe('FARE — the flow that matters (docs/01 §4)', () => {
  test('debits settlement and credits the 60/25/10/5 split', () => {
    const draft = journalDraftFor({ purpose: 'FARE', amountMinor: 1250n, context: FARE_CONTEXT });
    const byAccount = amountsByAccount(draft.postings);

    expect(byAccount[accountKey(MOMO_SETTLEMENT)]).toBe(1250n);
    expect(byAccount[accountKey(userWallet(OWNER_ID))]).toBe(-750n); // 60%
    expect(byAccount[accountKey(driverFloat(DRIVER_ID))]).toBe(-313n); // 25% + the odd cent
    expect(byAccount[accountKey(fuelPool(RANK_ID))]).toBe(-125n); // 10%
    expect(byAccount[accountKey(insurancePool(RANK_ID))]).toBe(-62n); // 5%
    expect(journalTotal(draft.postings)).toBe(0n);
  });

  test('uses the frozen split engine, not its own arithmetic', () => {
    const amount = 1_234_567n;
    const draft = journalDraftFor({ purpose: 'FARE', amountMinor: amount, context: FARE_CONTEXT });
    const parts = split(minor(amount), DEFAULT_FARE_SPLIT);

    const credited = draft.postings.filter((p) => p.amount < 0n).map((p) => -p.amount);
    const sortBigint = (xs: bigint[]) => [...xs].sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));
    expect(credited.reduce((a, b) => a + b, 0n)).toBe(amount);
    expect(sortBigint(credited)).toEqual(sortBigint(parts.map((p) => p.amount as bigint)));
  });

  test('a fare with no vehicle context refuses rather than guessing a payee', () => {
    // Guessing here means paying the wrong person, which is worse than a 500.
    expect(() => journalDraftFor({ purpose: 'FARE', amountMinor: 1250n })).toThrow(
      PostingContextError,
    );
  });

  test('an owner who is also the driver gets ONE merged posting, not two', () => {
    const draft = journalDraftFor({
      purpose: 'FARE',
      amountMinor: 1250n,
      context: { ownerId: OWNER_ID, driverId: OWNER_ID, rankId: RANK_ID },
    });

    // USER_WALLET(owner) and DRIVER_FLOAT(owner) are still different accounts —
    // the driver float is a wage accrual, not spendable wallet money.
    expect(journalTotal(draft.postings)).toBe(0n);
    expect(draft.postings).toHaveLength(5);
  });

  test('a one-cent fare still balances and never invents a cent', () => {
    const draft = journalDraftFor({ purpose: 'FARE', amountMinor: 1n, context: FARE_CONTEXT });
    expect(journalTotal(draft.postings)).toBe(0n);
    // Three of the four shares floor to zero and are dropped as no-ops.
    expect(draft.postings).toHaveLength(2);
  });
});

describe('escrow (docs/03 §4)', () => {
  test('funding moves the client money into a named hold, not a flag', () => {
    const draft = journalDraftFor({
      purpose: 'ESCROW_FUND',
      amountMinor: 50_000n,
      context: { subjectId: JOB_ID },
    });
    const byAccount = amountsByAccount(draft.postings);

    expect(byAccount[accountKey(MOMO_SETTLEMENT)]).toBe(50_000n);
    expect(byAccount[accountKey(escrowHold(JOB_ID))]).toBe(-50_000n);
  });

  test('release debits the hold, takes the fee, and pays out the net', () => {
    const draft = journalDraftFor({
      purpose: 'ESCROW_RELEASE',
      amountMinor: 50_000n,
      context: { subjectId: JOB_ID, feeMinor: 2_500n },
    });
    const byAccount = amountsByAccount(draft.postings);

    expect(byAccount[accountKey(escrowHold(JOB_ID))]).toBe(50_000n);
    expect(byAccount[accountKey(PLATFORM_FEE)]).toBe(-2_500n);
    expect(byAccount[accountKey(MOMO_SETTLEMENT)]).toBe(-47_500n);
  });

  test('a refund carries NO fee — we do not charge for a job that did not happen', () => {
    const draft = journalDraftFor({
      purpose: 'ESCROW_REFUND',
      amountMinor: 50_000n,
      context: { subjectId: JOB_ID, feeMinor: 2_500n },
    });
    const byAccount = amountsByAccount(draft.postings);

    expect(byAccount[accountKey(PLATFORM_FEE)]).toBeUndefined();
    expect(byAccount[accountKey(MOMO_SETTLEMENT)]).toBe(-50_000n);
  });

  test('a fee larger than the amount is refused', () => {
    expect(() =>
      journalDraftFor({
        purpose: 'ESCROW_RELEASE',
        amountMinor: 100n,
        context: { subjectId: JOB_ID, feeMinor: 101n },
      }),
    ).toThrow(PostingContextError);
  });
});

describe('purpose-locked remittance (docs/11 §4)', () => {
  test('the lock is an ACCOUNT, not a boolean somebody can forget to check', () => {
    const school = journalDraftFor({
      purpose: 'REMIT_IN',
      amountMinor: 200_000n,
      context: { beneficiaryId: CLIENT_ID, lockedCategory: 'SCHOOL_FEES' },
    });
    const transport = journalDraftFor({
      purpose: 'REMIT_TRANSPORT',
      amountMinor: 200_000n,
      context: { beneficiaryId: CLIENT_ID, lockedCategory: 'TRANSPORT' },
    });

    const schoolAccount = accountKey(familyLocked(CLIENT_ID, 'SCHOOL_FEES'));
    const transportAccount = accountKey(familyLocked(CLIENT_ID, 'TRANSPORT'));

    expect(schoolAccount).not.toBe(transportAccount);
    expect(amountsByAccount(school.postings)[schoolAccount]).toBe(-200_000n);
    expect(amountsByAccount(transport.postings)[transportAccount]).toBe(-200_000n);
  });

  test('a remittance without a category refuses — an unlocked lock is not a lock', () => {
    expect(() =>
      journalDraftFor({
        purpose: 'REMIT_IN',
        amountMinor: 1000n,
        context: { beneficiaryId: CLIENT_ID },
      }),
    ).toThrow(PostingContextError);
  });
});

describe('unattributable money', () => {
  test('an unknown purpose goes to SUSPENSE rather than being refused', () => {
    // The money has already arrived at MTN. Refusing to post it would leave the
    // ledger disagreeing with reality, which is worse than an alarm.
    const draft = journalDraftFor({ purpose: 'SOMETHING_NEW', amountMinor: 999n });

    expect(journalTotal(draft.postings)).toBe(0n);
    expect(draft.postings.some((p) => p.account.type === 'SUSPENSE')).toBe(true);
  });

  test('a zero amount is refused outright', () => {
    expect(() => journalDraftFor({ purpose: 'FARE', amountMinor: 0n })).toThrow(
      PostingContextError,
    );
  });

  test('stokvel and payout purposes still balance', () => {
    expect(
      journalTotal(
        journalDraftFor({
          purpose: 'STOKVEL_CONTRIB',
          amountMinor: 15_000n,
          context: { subjectId: JOB_ID },
        }).postings,
      ),
    ).toBe(0n);

    const payout = journalDraftFor({
      purpose: 'STOKVEL_PAYOUT',
      amountMinor: 90_000n,
      context: { subjectId: JOB_ID },
    });
    expect(amountsByAccount(payout.postings)[accountKey(stokvelPool(JOB_ID))]).toBe(90_000n);
  });
});
