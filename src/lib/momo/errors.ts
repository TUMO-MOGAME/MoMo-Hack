/**
 * MoMo failure taxonomy.
 *
 * `src/lib/momo/**` never throws raw (docs/01 §5) — every failure becomes an
 * `AppError`. `MomoRequestError` is an `AppException` that additionally carries
 * WHY, because "the socket timed out" and "MTN said 400" produce different
 * state-machine events and only one of them is recoverable.
 */

import { AppException, type AppError } from '@/lib/errors';
import type { MomoEvent } from '@/domain/ledger/state-machine';

export type MomoFailure =
  /** Our own `AbortSignal.timeout` fired. The request may still have landed. */
  | 'TIMEOUT'
  /** DNS, TLS, connection reset — it never reached MTN, or we cannot tell. */
  | 'NETWORK'
  /** MTN answered with a status we treat as a failure. */
  | 'HTTP'
  /** MTN answered 200 with a body we cannot parse or do not recognise. */
  | 'MALFORMED';

export class MomoRequestError extends AppException {
  constructor(
    readonly failure: MomoFailure,
    error: AppError,
    /** Response body, truncated. Never contains a key or token; see `client.ts`. */
    readonly detail?: string,
  ) {
    super(error);
    this.name = 'MomoRequestError';
  }

  /** The HTTP status, when there was one. */
  get status(): number | undefined {
    return this.error.kind === 'UPSTREAM' ? this.error.status : undefined;
  }

  get retryable(): boolean {
    return this.error.kind === 'UPSTREAM' && this.error.retryable;
  }
}

export function isMomoRequestError(e: unknown): e is MomoRequestError {
  return e instanceof MomoRequestError;
}

export function upstream(status: number | undefined, retryable: boolean): AppError {
  return { kind: 'UPSTREAM', provider: 'momo', retryable, ...(status ? { status } : {}) };
}

/**
 * Map an outbound-call failure onto a state-machine event (docs/03 §1.2).
 *
 * This is the table from the docs, in code, in one place:
 *
 *   timeout                      -> SEND_TIMEOUT   -> PENDING (may have landed)
 *   429 / 5xx / network          -> SEND_RETRYABLE -> stays INITIATED, reconciler re-sends
 *   400 / 401 / 403 / 404        -> SEND_REJECTED  -> FAILED
 *   malformed 200                -> SEND_RETRYABLE -> reconciler polls again
 *
 * Note what is NOT here: nothing maps a send failure to a NEW reference id.
 * A fresh id on a retry double-pays; it is the worst bug available (A1 §5).
 */
export function eventForSendFailure(e: unknown): MomoEvent {
  if (!isMomoRequestError(e)) return { type: 'SEND_RETRYABLE' };

  switch (e.failure) {
    case 'TIMEOUT':
      return { type: 'SEND_TIMEOUT' };
    case 'NETWORK':
    case 'MALFORMED':
      return { type: 'SEND_RETRYABLE' };
    case 'HTTP':
      return e.retryable ? { type: 'SEND_RETRYABLE' } : { type: 'SEND_REJECTED' };
  }
}
