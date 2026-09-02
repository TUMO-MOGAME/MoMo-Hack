/**
 * Starting a payout — money OUT (M3a, docs/03 §2 applied in reverse).
 *
 * Deliberately the same shape as `initiate.ts`, because the property that makes
 * collections safe is the property that makes payouts safe:
 *
 *     our primary key IS MTN's idempotency key
 *
 * `momo_transaction.id` is a uuid v4 we generate, PERSIST, and then send as
 * `X-Reference-Id`. A retry reuses the row and the id, so MTN dedupes it into a
 * 409, which we read as success.
 *
 * ── WHY THIS FILE IS NOT `initiate.ts` WITH A FLAG ───────────────────────────
 *
 * It would be a shorter diff and a worse idea. A flag has a default, and a
 * default on a function that can either ask for money or send it is a bug
 * waiting for a caller who omits an argument. Two functions cannot be confused
 * by omission, and the grep for "what in this codebase can send money" returns
 * exactly this file.
 *
 * ── WHAT IS DIFFERENT, AND IT IS ALL ABOUT THERE BEING NO SECOND HUMAN ───────
 *
 * A collection ASKS: MTN prompts a handset and nothing moves without a PIN we
 * never see. A payout PAYS: no prompt, no PIN, no decline. So:
 *
 *   · the amount passes the tighter payout cap (`toPayoutAmount`, R0.10 live);
 *   · a `SEND_RETRYABLE` failure leaves the row INITIATED for the reconciler to
 *     re-send with the same id — never a new one, because a new id on a payout
 *     is not a double-charge, it is a double-PAYMENT out of our own float;
 *   · the payee is whatever the caller passes, and every caller in this build
 *     takes it from configuration. There is no path from user input to here.
 */

import {
  type MomoEvent,
  type MomoStatus,
  claimableFor,
  transition,
} from '@/domain/ledger/state-machine';
import { eventForSendFailure } from '@/lib/momo/errors';
import { maskMsisdn } from '@/lib/momo/test-msisdns';
import type { MomoClient } from '@/lib/momo/types';
import { log } from '@/server/log';
import type { MoneyDb } from '@/server/db/types';

export interface InitiatePayoutInput {
  readonly amountMinor: bigint;
  /** The PAYEE. International format, no `+` (momoAPIs.md §9a). */
  readonly msisdn: string;
  /** Human-readable, no spaces (momoAPIs.md §6). Unique across the system. */
  readonly externalId: string;
  /** 'ESCROW_RELEASE', 'OWNER_PAYOUT', 'DEMO_PAYOUT', ... (docs/11 §3). */
  readonly purpose: string;
  readonly subjectId?: string | null;
  readonly initiatedBy?: string | null;
  readonly payerMessage: string;
  readonly payeeNote: string;
}

export interface PayoutDeps {
  readonly db: MoneyDb;
  readonly client: MomoClient;
  /** Injected only so a failing test can replay the exact id. Never for retries. */
  readonly uuid?: () => string;
  readonly now?: () => Date;
}

export interface PayoutResult {
  readonly transactionId: string;
  readonly status: MomoStatus;
}

export async function initiatePayout(
  deps: PayoutDeps,
  input: InitiatePayoutInput,
): Promise<PayoutResult> {
  const now = deps.now ?? (() => new Date());
  const id = (deps.uuid ?? (() => crypto.randomUUID()))();

  // ── 1. Durable first. Nothing leaves this process before this commits. ────
  //
  // `product: 'DISBURSEMENT'` is load-bearing beyond bookkeeping: the
  // reconciler reads it to decide which MTN endpoint to poll, and `resolve.ts`
  // reads it to decide which DIRECTION to post the journal.
  await deps.db.transaction(async (tx) => {
    await tx.insertTransaction({
      id,
      product: 'DISBURSEMENT',
      amountMinor: input.amountMinor,
      counterparty: input.msisdn,
      externalId: input.externalId,
      purpose: input.purpose,
      subjectId: input.subjectId ?? null,
      initiatedBy: input.initiatedBy ?? null,
      requestBody: {
        amountMinor: input.amountMinor.toString(),
        externalId: input.externalId,
        purpose: input.purpose,
        // POPIA s105/106 — the column keeps the real number for reconciliation,
        // the audit body keeps a masked one. `payee`, not `payer`: reading this
        // row back, the direction must be unambiguous.
        payee: maskMsisdn(input.msisdn),
      },
    });
    await tx.bumpAttempt(id);
  });

  // ── 2. Fire. ONE attempt. No retry loop lives in a request. ───────────────
  const event = await send(deps, id, input);

  // ── 3. Record what the attempt told us, through the same guarded update. ──
  const target = transition('INITIATED', event);
  if (target !== 'INITIATED') {
    await deps.db.transaction(async (tx) => {
      await tx.claimTransition({ id, from: claimableFor(target), to: target, at: now() });
    });
  }

  return { transactionId: id, status: target };
}

async function send(deps: PayoutDeps, id: string, input: InitiatePayoutInput): Promise<MomoEvent> {
  try {
    const result = await deps.client.disbursements.transfer(id, {
      amountMinor: input.amountMinor,
      msisdn: input.msisdn,
      externalId: input.externalId,
      payerMessage: input.payerMessage,
      payeeNote: input.payeeNote,
    });

    log('info', 'momo.transfer.sent', {
      correlation_id: id,
      outcome: result.outcome,
      purpose: input.purpose,
      payee: maskMsisdn(input.msisdn),
    });

    return result.outcome === 'ALREADY_ACCEPTED'
      ? { type: 'ALREADY_ACCEPTED' }
      : { type: 'ACCEPTED' };
  } catch (e) {
    const event = eventForSendFailure(e);
    log('warn', 'momo.transfer.failed', {
      correlation_id: id,
      event: event.type,
      purpose: input.purpose,
      payee: maskMsisdn(input.msisdn),
      error: e instanceof Error ? e.message : 'unknown',
    });
    return event;
  }
}
