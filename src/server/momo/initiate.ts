/**
 * Starting a collection — the canonical money-moving shape (docs/03 §2).
 *
 * Note what is ABSENT: no waiting, no polling, no ledger write. Under 10s,
 * always. Resolution happens out of band, in `resolve.ts`.
 *
 * THE ONE PROPERTY THAT MATTERS HERE:
 *
 *     our primary key IS MTN's idempotency key
 *
 * `momo_transaction.id` is a uuid v4 that we generate, PERSIST, and then send as
 * `X-Reference-Id`. Every consequence follows from that:
 *
 *   1. The row exists in INITIATED before a packet leaves.
 *   2. A retry of the same logical operation reuses the same row and the same
 *      id, so MTN dedupes it.
 *   3. A 409 means "I already have this" — exactly what we want to hear.
 *   4. There is NO scenario where a network failure causes a second payment,
 *      because a second payment would need a second uuid, and only the caller
 *      that created the row has one.
 *
 * A freshly generated id on a retry is a **Critical** finding (A1 §5). There is
 * exactly one `randomUUID()` call in this file and it happens before the insert.
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

export interface InitiateCollectionInput {
  readonly amountMinor: bigint;
  readonly msisdn: string;
  /** Human-readable, no spaces (momoAPIs.md §6). Unique across the system. */
  readonly externalId: string;
  /** 'FARE', 'ESCROW_FUND', 'STOKVEL_CONTRIB', ... (docs/11 §2). */
  readonly purpose: string;
  readonly subjectId?: string | null;
  readonly initiatedBy?: string | null;
  readonly payerMessage: string;
  readonly payeeNote: string;
}

export interface InitiateDeps {
  readonly db: MoneyDb;
  readonly client: MomoClient;
  /** Injected only so a failing test can replay the exact id. Never for retries. */
  readonly uuid?: () => string;
  readonly now?: () => Date;
}

export interface InitiateResult {
  /** The client subscribes to Realtime on this (docs/03 §2). */
  readonly transactionId: string;
  readonly status: MomoStatus;
}

export async function initiateCollection(
  deps: InitiateDeps,
  input: InitiateCollectionInput,
): Promise<InitiateResult> {
  const now = deps.now ?? (() => new Date());
  const id = (deps.uuid ?? (() => crypto.randomUUID()))();

  // ── 1. Durable first. Nothing leaves this process before this commits. ────
  await deps.db.transaction(async (tx) => {
    await tx.insertTransaction({
      id,
      product: 'COLLECTION',
      amountMinor: input.amountMinor,
      counterparty: input.msisdn,
      externalId: input.externalId,
      purpose: input.purpose,
      subjectId: input.subjectId ?? null,
      initiatedBy: input.initiatedBy ?? null,
      // The MSISDN is stored (we need it to reconcile) but the body we keep for
      // the audit trail carries a masked one — POPIA s105/106 (docs/14 §5).
      requestBody: {
        amountMinor: input.amountMinor.toString(),
        externalId: input.externalId,
        purpose: input.purpose,
        payer: maskMsisdn(input.msisdn),
      },
    });
    await tx.bumpAttempt(id);
  });

  // ── 2. Fire. ONE attempt. No retry loop lives in a request. ───────────────
  const event = await send(deps, id, input);

  // ── 3. Record what the attempt told us, through the same guarded update the
  //       resolver uses. Even here there is no read-then-write.
  const target = transition('INITIATED', event);
  if (target !== 'INITIATED') {
    await deps.db.transaction(async (tx) => {
      await tx.claimTransition({ id, from: claimableFor(target), to: target, at: now() });
    });
  }

  return { transactionId: id, status: target };
}

async function send(
  deps: InitiateDeps,
  id: string,
  input: InitiateCollectionInput,
): Promise<MomoEvent> {
  try {
    const result = await deps.client.collections.requestToPay(id, {
      amountMinor: input.amountMinor,
      msisdn: input.msisdn,
      externalId: input.externalId,
      payerMessage: input.payerMessage,
      payeeNote: input.payeeNote,
    });

    log('info', 'momo.requesttopay.sent', {
      correlation_id: id,
      outcome: result.outcome,
      purpose: input.purpose,
      payer: maskMsisdn(input.msisdn),
    });

    // A 409 arrives as ALREADY_ACCEPTED, never as an exception, so there is no
    // path where it is mistaken for a failure and retried with a new id.
    return result.outcome === 'ALREADY_ACCEPTED'
      ? { type: 'ALREADY_ACCEPTED' }
      : { type: 'ACCEPTED' };
  } catch (e) {
    const event = eventForSendFailure(e);
    log('warn', 'momo.requesttopay.failed', {
      correlation_id: id,
      event: event.type,
      purpose: input.purpose,
      payer: maskMsisdn(input.msisdn),
      error: e instanceof Error ? e.message : 'unknown',
    });
    // SEND_RETRYABLE leaves the row INITIATED on purpose: the reconciler
    // re-SENDS it with the same id after 60s (docs/03 §3 path B).
    return event;
  }
}
