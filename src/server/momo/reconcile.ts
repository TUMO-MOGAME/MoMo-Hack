/**
 * The reconciler — path B, the authoritative one (docs/03 §3).
 *
 * GitHub Actions hits `/api/cron/reconcile` every five minutes (ADR-0006).
 * The callback is a latency optimisation; THIS is what makes the system
 * correct. If MTN never calls us back, everything still resolves within five
 * minutes.
 *
 * Three jobs, in order of how much they can cost us:
 *   1. Re-SEND an `INITIATED` row older than 60s — the original POST may never
 *      have landed. Same id, always. A new id here would double-pay.
 *   2. POLL a `PENDING` row and resolve it through the one resolver.
 *   3. ABANDON anything still unresolved after 24h, as TIMEOUT.
 *
 * Scheduled workflows are best-effort and can be delayed under load. That costs
 * latency, not correctness, because every step here is idempotent.
 */

import { claimableFor, transition } from '@/domain/ledger/state-machine';
import { isMomoRequestError } from '@/lib/momo/errors';
import { maskMsisdn } from '@/lib/momo/test-msisdns';
import type { MomoClient } from '@/lib/momo/types';
import { log } from '@/server/log';
import type { MomoTransactionRow, MoneyDb } from '@/server/db/types';
import { type ResolveDeps, resolveTransaction } from './resolve';

export interface ReconcileOptions {
  /** Rows per tick. 50 keeps a tick well inside the 10s function budget. */
  readonly limit?: number;
  /** An INITIATED row older than this is re-sent (docs/03 §3). */
  readonly resendAfterMs?: number;
  /** Anything unresolved after this becomes TIMEOUT. */
  readonly abandonAfterMs?: number;
}

export interface ReconcileDeps extends ResolveDeps {
  readonly db: MoneyDb;
  readonly client: MomoClient;
}

export interface ReconcileReport {
  readonly examined: number;
  readonly resent: number;
  readonly resolved: number;
  readonly abandoned: number;
  readonly skipped: number;
  readonly errors: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export async function reconcile(
  deps: ReconcileDeps,
  options: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const now = deps.now ?? (() => new Date());
  const limit = options.limit ?? 50;
  const resendAfterMs = options.resendAfterMs ?? MINUTE;
  const abandonAfterMs = options.abandonAfterMs ?? 24 * HOUR;

  const at = now();
  // Look back further than the abandon window so the sweep in step 3 can
  // actually see the rows it is meant to close.
  const since = new Date(at.getTime() - 2 * abandonAfterMs);

  const rows = await deps.db.transaction((tx) => tx.listUnresolved({ limit, since }));

  let resent = 0;
  let resolved = 0;
  let abandoned = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const ageMs = at.getTime() - row.createdAt.getTime();

    try {
      if (ageMs >= abandonAfterMs) {
        if (await abandon(deps, row, at)) abandoned++;
        else skipped++;
        continue;
      }

      if (row.status === 'INITIATED') {
        if (ageMs < resendAfterMs) {
          // Too young. The initiating request may still be in flight; polling or
          // re-sending now would race it for nothing.
          skipped++;
          continue;
        }
        if (await resend(deps, row)) resent++;
        else skipped++;
        continue;
      }

      const status = await deps.client.collections.getStatus(row.id);
      const result = await resolveTransaction(deps, {
        referenceId: row.id,
        observed: status.status,
        response: status.raw,
      });
      if (result.applied) resolved++;
      else skipped++;
    } catch (e) {
      errors++;
      log('warn', 'reconcile.row.failed', {
        correlation_id: row.id,
        status: row.status,
        purpose: row.purpose,
        counterparty: maskMsisdn(row.counterparty),
        upstream_status: isMomoRequestError(e) ? e.status : undefined,
        error: e instanceof Error ? e.message : 'unknown',
      });
      // One bad row must never stop the tick. The next tick tries again.
    }
  }

  const report: ReconcileReport = {
    examined: rows.length,
    resent,
    resolved,
    abandoned,
    skipped,
    errors,
  };
  log('info', 'reconcile.tick', { ...report });
  return report;
}

/**
 * Re-send an INITIATED row. THE SAME `X-Reference-Id`, always.
 *
 * If the original POST did land, MTN answers 409 and the client reports
 * ALREADY_ACCEPTED — which is why re-sending is safe rather than reckless.
 */
async function resend(deps: ReconcileDeps, row: MomoTransactionRow): Promise<boolean> {
  const now = deps.now ?? (() => new Date());

  await deps.db.transaction((tx) => tx.bumpAttempt(row.id));

  const result = await deps.client.collections.requestToPay(row.id, {
    amountMinor: row.amountMinor,
    msisdn: row.counterparty,
    externalId: row.externalId,
    payerMessage: 'MoMo Kasi',
    payeeNote: row.purpose,
  });

  const target = transition('INITIATED', {
    type: result.outcome === 'ALREADY_ACCEPTED' ? 'ALREADY_ACCEPTED' : 'ACCEPTED',
  });

  log('info', 'reconcile.resent', {
    correlation_id: row.id,
    outcome: result.outcome,
    attempt: row.attemptCount + 1,
  });

  return deps.db.transaction(async (tx) => {
    const claim = await tx.claimTransition({
      id: row.id,
      from: claimableFor(target),
      to: target,
      at: now(),
    });
    return claim !== null;
  });
}

/** Close out a transaction MTN never resolved. TIMEOUT, through the same guard. */
async function abandon(deps: ReconcileDeps, row: MomoTransactionRow, at: Date): Promise<boolean> {
  const result = await resolveTransaction(
    { ...deps, now: () => at },
    { referenceId: row.id, observed: 'TIMEOUT' },
  );
  if (result.applied) {
    log('warn', 'reconcile.abandoned', {
      correlation_id: row.id,
      purpose: row.purpose,
      age_hours: Math.round((at.getTime() - row.createdAt.getTime()) / HOUR),
    });
  }
  return result.applied;
}
