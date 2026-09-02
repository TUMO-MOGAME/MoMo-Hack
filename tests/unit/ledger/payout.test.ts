/**
 * ⚠️ MONEY GOING OUT (M3a). The other direction, and the more dangerous one.
 *
 * `tests/unit/agent/pay-command.test.ts` guards the path that ASKS for money.
 * This guards the path that SENDS it, and the difference is the whole reason
 * this file exists separately:
 *
 *   · a collection that misfires asks a human, who declines. Nothing moves.
 *   · a payout that misfires MOVES OUR MONEY. Nobody is asked, nobody can
 *     decline, and the first anyone knows is the balance.
 *
 * So the assertions here are about the dangerous direction: that the caps bind,
 * that a retry cannot mint a second id, that the ledger records the money as
 * LEAVING, and that no number a user types can become a payee or an amount.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
  DEFAULT_PAYOUT_MAX_MINOR,
  PAYOUT_MAX_ENV,
  PayoutBudgetError,
  assertWithinPayoutBudget,
  payoutCapMinor,
} from '@/lib/momo/budget';
import { toPayoutAmount } from '@/lib/momo/currency';
import { journalDraftFor } from '@/domain/ledger/postings';
import {
  DEMO_MAX_PAYOUT_MINOR,
  hasExtraSendArguments,
  parseSendAmount,
  sendDemoPayout,
} from '@/server/momo/demo-payout';
import { initiatePayout } from '@/server/momo/payout';
import { MomoRequestError, upstream } from '@/lib/momo/errors';
import { TEST_MSISDN } from '@/lib/momo/test-msisdns';
import type { CollectionsApi, DisbursementsApi, MomoClient } from '@/lib/momo/types';
import { minor } from '@/domain/money';
import type { MemoryDb } from '@/server/db/memory';
import { db, nextReference, resetReferences } from './_fixtures';

const LIVE = 'mtnsouthafrica';

let memory: MemoryDb;
beforeEach(() => {
  resetReferences();
  memory = db();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the payout cap is tighter than the collection cap', () => {
  test('the default is R0.10, a tenth of the inbound ceiling', () => {
    expect(DEFAULT_PAYOUT_MAX_MINOR).toBe(10n);
    expect(payoutCapMinor({})).toBe(10n);
  });

  test('a live payout over the cap is refused, naming the reason', () => {
    expect(() => assertWithinPayoutBudget(11n, LIVE, {})).toThrow(PayoutBudgetError);
    // The message has to explain WHY this cap is lower than the other one, or
    // the first person to hit it just raises it.
    expect(() => assertWithinPayoutBudget(11n, LIVE, {})).toThrow(/no second human/i);
  });

  test('exactly at the cap is allowed — an off-by-one here is a broken demo', () => {
    expect(() => assertWithinPayoutBudget(10n, LIVE, {})).not.toThrow();
  });

  test('sandbox is exempt, because sandbox money is not real', () => {
    expect(() => assertWithinPayoutBudget(1_250n, 'sandbox', {})).not.toThrow();
  });

  test('an unknown environment is treated as LIVE, not as sandbox', () => {
    // The cautious default: guessing "probably sandbox" and being wrong costs
    // real money. A typo in MOMO_TARGET_ENVIRONMENT must fail closed.
    expect(() => assertWithinPayoutBudget(500n, 'sandbx', {})).toThrow(PayoutBudgetError);
    expect(() => assertWithinPayoutBudget(500n, undefined, {})).toThrow(PayoutBudgetError);
  });

  test('a malformed cap falls back to the default and is never read as "no limit"', () => {
    for (const raw of ['', 'abc', '0', '-50', '  ']) {
      expect(payoutCapMinor({ [PAYOUT_MAX_ENV]: raw })).toBe(DEFAULT_PAYOUT_MAX_MINOR);
    }
  });

  test('toPayoutAmount enforces the PAYOUT cap, not merely the live one', () => {
    // ⚠️ THE DISCRIMINATING CASE, and the reason this test exists.
    //
    // R0.50 is UNDER the R1.00 general live cap and OVER the R0.10 payout cap.
    // Every other assertion in this block uses an amount above both, so all of
    // them pass whether or not `toPayoutAmount` calls the payout guard at all —
    // deleting that call broke nothing until this case was added.
    //
    // A test that cannot distinguish the thing it is named after is decoration.
    expect(() => toPayoutAmount(50n, LIVE)).toThrow(PayoutBudgetError);
    // And it is genuinely the payout guard talking, not the live one.
    expect(() => toPayoutAmount(50n, LIVE)).toThrow(/no second human/i);
  });

  test('BOTH caps apply — the payout cap never widens the general live cap', () => {
    // Raising only the payout cap must still leave the R1.00 live cap binding.
    // Otherwise "raise the payout cap" quietly becomes "remove the budget guard".
    expect(() => toPayoutAmount(500n, LIVE)).toThrow();
  });

  test('a live payout inside both caps produces the wire amount', () => {
    expect(toPayoutAmount(10n, LIVE).amount).toBe('0.10');
  });

  test('a zero or negative payout is not a payout', () => {
    expect(() => toPayoutAmount(0n, 'sandbox')).toThrow(RangeError);
    expect(() => minor(-10n)).toThrow(RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the ledger records a payout as money LEAVING', () => {
  test('DEMO_PAYOUT debits SUSPENSE and credits MOMO_SETTLEMENT', () => {
    const draft = journalDraftFor({
      purpose: 'DEMO_PAYOUT',
      amountMinor: 10n,
      referenceId: 'ref-1',
    });

    const settlement = draft.postings.find((p) => p.account.type === 'MOMO_SETTLEMENT');
    const suspense = draft.postings.find((p) => p.account.type === 'SUSPENSE');

    // Money OUT: the source is debited (+), MOMO_SETTLEMENT is credited (−).
    // If these signs ever invert, the ledger claims we RECEIVED a payout.
    expect(suspense?.amount).toBe(10n);
    expect(settlement?.amount).toBe(-10n);
    expect(draft.postings.reduce((sum, p) => sum + p.amount, 0n)).toBe(0n);
  });

  test('it needs no posting context at all — the M6b trap, one direction over', () => {
    // Every other payout purpose requires an id the reconciler does not have.
    // `required()` throws INSIDE the resolve transaction, which on a payout
    // means the money has already left and no journal can ever be written.
    expect(() => journalDraftFor({ purpose: 'DEMO_PAYOUT', amountMinor: 10n })).not.toThrow();
    expect(() => journalDraftFor({ purpose: 'OWNER_PAYOUT', amountMinor: 10n })).toThrow(/ownerId/);
    expect(() => journalDraftFor({ purpose: 'ESCROW_RELEASE', amountMinor: 10n })).toThrow(
      /subjectId/,
    );
  });

  test('a collection and a payout of the same amount cancel to zero', () => {
    // The demo story, asserted: AIRTIME parks money in SUSPENSE on the way in,
    // DEMO_PAYOUT draws it back out, and SUSPENSE returns to where docs/02 §2
    // says it must end the day.
    const inbound = journalDraftFor({ purpose: 'AIRTIME', amountMinor: 10n });
    const outbound = journalDraftFor({ purpose: 'DEMO_PAYOUT', amountMinor: 10n });

    const net = [...inbound.postings, ...outbound.postings]
      .filter((p) => p.account.type === 'SUSPENSE')
      .reduce((sum, p) => sum + p.amount, 0n);

    expect(net).toBe(0n);
  });

  describe('an UNKNOWN purpose must still go the right way', () => {
    // The bug this guards: before M3a every purpose reaching the SUSPENSE
    // fallback was a COLLECTION, so the fallback hard-coded money coming IN. A
    // disbursement with an unrecognised purpose would have recorded money we
    // SENT as money we RECEIVED — a journal that BALANCES PERFECTLY, so no
    // database trigger and no invariant test would catch it, leaving
    // MOMO_SETTLEMENT wrong by twice the amount.
    test('direction OUT credits MOMO_SETTLEMENT', () => {
      const draft = journalDraftFor({
        purpose: 'SOMETHING_WE_HAVE_NOT_BUILT',
        amountMinor: 10n,
        direction: 'OUT',
      });
      expect(draft.postings.find((p) => p.account.type === 'MOMO_SETTLEMENT')?.amount).toBe(-10n);
    });

    test('direction IN debits it — the previous behaviour, unchanged', () => {
      const draft = journalDraftFor({
        purpose: 'SOMETHING_WE_HAVE_NOT_BUILT',
        amountMinor: 10n,
        direction: 'IN',
      });
      expect(draft.postings.find((p) => p.account.type === 'MOMO_SETTLEMENT')?.amount).toBe(10n);
    });

    test('omitting direction defaults to IN, so no collection changed', () => {
      const draft = journalDraftFor({ purpose: 'SOMETHING_WE_HAVE_NOT_BUILT', amountMinor: 10n });
      expect(draft.postings.find((p) => p.account.type === 'MOMO_SETTLEMENT')?.amount).toBe(10n);
    });

    test('both directions balance', () => {
      for (const direction of ['IN', 'OUT'] as const) {
        const draft = journalDraftFor({ purpose: 'UNKNOWN', amountMinor: 33n, direction });
        expect(draft.postings.reduce((s, p) => s + p.amount, 0n)).toBe(0n);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

function fakeClient(transfer: DisbursementsApi['transfer']): MomoClient & { sent: string[] } {
  const sent: string[] = [];
  const collections: CollectionsApi = {
    async requestToPay() {
      throw new Error('a payout path called requestToPay() — that is the wrong direction');
    },
    async getStatus() {
      throw new Error('a payout path called getStatus() — that is the wrong direction');
    },
  };
  const disbursements: DisbursementsApi = {
    async transfer(referenceId, input) {
      sent.push(referenceId);
      return transfer(referenceId, input);
    },
    async getTransferStatus() {
      throw new MomoRequestError('HTTP', upstream(404, false), 'not found');
    },
  };
  return { mode: 'emulator', collections, disbursements, sent };
}

const PAYOUT = {
  amountMinor: 10n,
  msisdn: TEST_MSISDN.ASYNC_SUCCESS,
  externalId: 'payout-test-1',
  purpose: 'DEMO_PAYOUT',
  payerMessage: 'MoMo Kasi payout',
  payeeNote: 'Test',
};

describe('initiatePayout — one id, minted once, persisted first', () => {
  test('the row exists in INITIATED before a packet leaves', async () => {
    let statusAtSendTime: string | undefined;
    const client = fakeClient(async (referenceId) => {
      statusAtSendTime = memory.transaction_(referenceId)?.status;
      return { outcome: 'ACCEPTED', referenceId };
    });

    await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(statusAtSendTime).toBe('INITIATED');
  });

  test('the id we persist is the id we transmit, byte for byte', async () => {
    const client = fakeClient(async (referenceId) => ({ outcome: 'ACCEPTED', referenceId }));

    const result = await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(client.sent).toEqual([result.transactionId]);
  });

  test('the row is recorded as a DISBURSEMENT, which is what routes everything else', async () => {
    // Not bookkeeping: the reconciler reads `product` to decide which MTN
    // endpoint to poll, and resolve.ts reads it to decide which DIRECTION to
    // post. A COLLECTION here would poll the wrong URL and post backwards.
    const client = fakeClient(async (referenceId) => ({ outcome: 'ACCEPTED', referenceId }));

    const result = await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(memory.transaction_(result.transactionId)?.product).toBe('DISBURSEMENT');
  });

  test('409 is SUCCESS, and is never retried with a fresh id', async () => {
    // On the way in, a fresh id double-CHARGES. On the way out it double-PAYS,
    // out of our own float, with nobody to notice.
    const client = fakeClient(async (referenceId) => ({
      outcome: 'ALREADY_ACCEPTED',
      referenceId,
    }));

    const result = await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(result.status).toBe('CREATED');
    expect(client.sent).toHaveLength(1);
  });

  test('a timeout leaves it PENDING, never FAILED — the transfer may have landed', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('TIMEOUT', upstream(408, true), 'timed out');
    });

    const result = await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(result.status).toBe('PENDING');
  });

  test('a retryable failure leaves it INITIATED so the reconciler re-sends the SAME id', async () => {
    const client = fakeClient(async () => {
      throw new MomoRequestError('HTTP', upstream(500, true), 'upstream');
    });

    const result = await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(result.status).toBe('INITIATED');
  });

  test('no journal is written on the initiate path — money has not moved yet', async () => {
    const client = fakeClient(async (referenceId) => ({ outcome: 'ACCEPTED', referenceId }));

    await initiatePayout({ db: memory, client, uuid: nextReference }, PAYOUT);

    expect(memory.journalCount()).toBe(0);
    expect(memory.ledgerSum()).toBe(0n);
  });

  test('the audit body carries a MASKED payee, keyed `payee` not `payer`', async () => {
    // The memory adapter does not retain `requestBody`, so the body is captured
    // at the port instead. That is the right place anyway: this asserts what
    // `initiatePayout` HANDS to the database, which is the thing POPIA s105/106
    // is about, rather than what one adapter chooses to keep.
    let body: Record<string, unknown> | undefined;
    const capturing = {
      ...memory,
      transaction: (fn: (tx: never) => unknown) =>
        memory.transaction(async (tx) => {
          const spied = {
            ...tx,
            insertTransaction: (input: { requestBody?: Record<string, unknown> }) => {
              if (input.requestBody) body = input.requestBody;
              return (
                tx as unknown as { insertTransaction: (i: unknown) => unknown }
              ).insertTransaction(input);
            },
          };
          return (fn as unknown as (t: unknown) => unknown)(spied);
        }),
    } as unknown as MemoryDb;

    const client = fakeClient(async (referenceId) => ({ outcome: 'ACCEPTED', referenceId }));
    const result = await initiatePayout({ db: capturing, client, uuid: nextReference }, PAYOUT);

    // The COLUMN keeps the real number — the reconciler needs it to re-send.
    expect(memory.transaction_(result.transactionId)?.counterparty).toBe(TEST_MSISDN.ASYNC_SUCCESS);
    // Everything kept for the audit trail carries the masked form instead.
    expect(String(body?.payee)).toMatch(/^••••/);
    // `payee`, not `payer`: reading a row back, the direction the money went
    // must be unambiguous.
    expect(body).not.toHaveProperty('payer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('nothing a user types can become an amount or a payee', () => {
  test.each([
    ['/send 0.10', 10n],
    ['/send R0.10', 10n],
    ['/send 1', 100n],
    ['/send 0.50', 50n],
  ])('%j → %s minor units', (text, expected) => {
    expect(parseSendAmount(text.replace(/^\/send/i, ''))).toBe(expected);
  });

  test.each(['/send', '/send abc', '/send -1', '/send 0.001'])('%j has no amount', (text) => {
    expect(parseSendAmount(text.replace(/^\/send/i, ''))).toBeNull();
  });

  test.each(['/send 0.1 0767221345', '/send 0.10 300', '/send 0.10 to 0761234567', '/send 5 5'])(
    '%j is refused outright, not resolved to one of its numbers',
    (text) => {
      // The real bug this mirrors: a user typed `/pay 0.2 0767221345` and the
      // first parser matched the PHONE NUMBER as the amount. On a payout, that
      // pays out the phone number.
      const args = text.replace(/^\/send/i, '');
      expect(hasExtraSendArguments(args)).toBe(true);
    },
  );

  test('with no MOMO_DEMO_MSISDN there is nobody to pay, and it refuses', async () => {
    const result = await sendDemoPayout(minor(10n), 'test', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no payee number/i);
  });

  test('the payout ceiling at this surface is lower than the collection one', async () => {
    const result = await sendDemoPayout(minor(DEMO_MAX_PAYOUT_MINOR + 1n), 'test', {
      MOMO_DEMO_MSISDN: '27000000000',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ceiling/i);
  });

  test('there is no parameter through which a typed number could arrive', () => {
    // The shape of the API is the actual control: `sendDemoPayout` takes an
    // amount, a channel and an env bag. There is no destination argument.
    expect(sendDemoPayout.length).toBeLessThanOrEqual(3);
  });
});
