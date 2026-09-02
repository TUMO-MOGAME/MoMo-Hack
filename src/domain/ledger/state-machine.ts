/**
 * The MoMo transaction state machine (momoAPIs.md §12).
 *
 * Pure. No I/O, no env, no database (docs/01 §5). Every transition in the
 * system is decided here and then APPLIED by a guarded UPDATE in
 * `src/server/momo/resolve.ts`. Deciding and applying are deliberately separate:
 * the decision is property-testable in microseconds, and the application is the
 * one place a race can happen.
 *
 *                     +-------------+
 *                     |  INITIATED  |   row written, nothing sent yet
 *                     +------+------+
 *                            | POST returns 202 (or 409 "already accepted")
 *                            v
 *                     +-------------+
 *                     |   CREATED   |   [V] observed against the live sandbox
 *                     +------+------+   2026-09-02. NOT in MTN's documented
 *                            |          vocabulary, but the sandbox emits it.
 *                            v
 *                     +-------------+
 *         +---------->|   PENDING   |<----------+
 *         |           +------+------+           |
 *         |  callback        |     reconciler   |
 *         |  arrives         |     polls        |
 *         +------------------+------------------+
 *                            |
 *         +----------+-------+-------+----------+
 *         v          v               v          v
 *   +-----------+ +--------+ +----------+ +---------+
 *   |SUCCESSFUL | | FAILED | | REJECTED | | TIMEOUT |
 *   +-----------+ +--------+ +----------+ +---------+
 *         |
 *         +--> ledger journal written, in the SAME db transaction
 */

/**
 * Mirrors the `momo_status` enum in 0001_ledger.sql.
 *
 * `CREATED` was added after live verification (momoAPIs.md §10). It is the
 * status MTN reports between accepting the request and starting to process it,
 * and a machine that rejects it mishandles `46733123454` — the one number that
 * actually demonstrates asynchronous resolution, and therefore the demo number.
 */
export const MOMO_STATUSES = [
  'INITIATED',
  'CREATED',
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'REJECTED',
  'TIMEOUT',
] as const;

export type MomoStatus = (typeof MOMO_STATUSES)[number];

/**
 * Terminal states are IMMUTABLE. A late callback contradicting one is logged
 * and discarded, never applied (momoAPIs.md §12 rule 1).
 *
 * `REJECTED` and `TIMEOUT` appear UNREACHABLE in the sandbox — both numbers
 * documented for them return `FAILED` (momoAPIs.md §10). They are still
 * modelled because production may emit them, and they are exercised through the
 * emulator, which is what moves the emulator from demo insurance to a
 * test-coverage requirement (ADR-0009).
 *
 * KNOWN CONFLICT, recorded rather than resolved: momoAPIs.md §12 rule 4 says
 * "TIMEOUT is not terminal for the money, only for the request" — and rates that
 * **[U]**. CLAUDE.md's vocabulary and §12 rule 1 both list TIMEOUT as terminal
 * and immutable. We implement TIMEOUT as ABSORBING, which is the conservative
 * reading: money must not silently move after we told a user it did not. If the
 * portal ever confirms that a TIMEOUT can still settle, the fix is a NEW status
 * (`TIMEOUT_PENDING`) rather than making a terminal state mutable.
 */
export const TERMINAL_STATUSES = ['SUCCESSFUL', 'FAILED', 'REJECTED', 'TIMEOUT'] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/**
 * The statuses a resolver is allowed to claim. Mirrors the guarded UPDATE:
 *
 *     where id = $1 and status in ('INITIATED','CREATED','PENDING')
 */
export const CLAIMABLE_STATUSES = ['INITIATED', 'CREATED', 'PENDING'] as const;

export type ClaimableStatus = (typeof CLAIMABLE_STATUSES)[number];

export function isTerminal(status: MomoStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly MomoStatus[]).includes(status);
}

export function isClaimable(status: MomoStatus): status is ClaimableStatus {
  return (CLAIMABLE_STATUSES as readonly MomoStatus[]).includes(status);
}

/**
 * Everything that can happen to a transaction. Each one corresponds to a real
 * observable event, not to a wish — which is what keeps the machine honest.
 */
export type MomoEvent =
  /**
   * The POST returned `202 Accepted` (momoAPIs.md §7.1). MTN now holds the
   * request, and the next status it reports is `CREATED`.
   */
  | { readonly type: 'ACCEPTED' }
  /**
   * The POST returned `409 Conflict`. MTN already has this reference id, so the
   * transaction EXISTS upstream. This is success, not failure (docs/03 §1.2),
   * and it is verified behaviour: posting the same X-Reference-Id twice returns
   * 202 then 409 (momoAPIs.md §10). Never retry with a fresh id — that is the
   * double-pay bug.
   */
  | { readonly type: 'ALREADY_ACCEPTED' }
  /**
   * Our own HTTP call timed out (`AbortSignal.timeout(6000)`, docs/03 §1.3).
   * The request may well have landed upstream, so this is PENDING, never
   * FAILED. PENDING rather than CREATED because we have no positive evidence
   * MTN accepted it — only a suspicion — and both are polled identically.
   */
  | { readonly type: 'SEND_TIMEOUT' }
  /**
   * 429, 5xx or a network error. Retryable, but NOT in this request. The row
   * stays INITIATED and the reconciler re-sends it after 60s (docs/03 §3).
   */
  | { readonly type: 'SEND_RETRYABLE' }
  /** 400, 403 or 404 — MTN will never accept this request. Non-retryable. */
  | { readonly type: 'SEND_REJECTED' }
  /** An authoritative status read back from MoMo (callback or reconciler). */
  | { readonly type: 'OBSERVED'; readonly status: MomoStatus }
  /** The reconciler gave up after the 24h window (docs/03 §3 path B). */
  | { readonly type: 'ABANDONED' };

/**
 * What an authoritative status read means for our row.
 *
 * MTN can report `INITIATED` back at us; if it knows about the reference at all
 * then the request landed, which is exactly what PENDING means. Everything else
 * is taken at face value — including `CREATED`, which we would otherwise have
 * had no name for.
 */
export function targetForObserved(status: MomoStatus): MomoStatus {
  return status === 'INITIATED' ? 'PENDING' : status;
}

/**
 * Decide the next status. TOTAL and PURE: every (state, event) pair has an
 * answer, and the same pair always gives the same answer.
 *
 * The single most important line in this file is the first one: a terminal
 * state absorbs every event. Property P4 in docs/04 §3 exists to hold it.
 */
export function transition(current: MomoStatus, event: MomoEvent): MomoStatus {
  if (isTerminal(current)) return current;

  switch (event.type) {
    case 'ACCEPTED':
    case 'ALREADY_ACCEPTED':
      // Positive evidence that MTN holds the request. CREATED is what it
      // reports next, verified against the live sandbox (momoAPIs.md §10).
      // Never move BACKWARDS out of PENDING, which is further along.
      return current === 'INITIATED' ? 'CREATED' : current;

    case 'SEND_TIMEOUT':
      // No evidence either way, so the row lands in PENDING and gets polled.
      // Never FAILED: the request may well have settled (docs/03 §1.3).
      return 'PENDING';

    case 'SEND_RETRYABLE':
      // Deliberately stays put. `INITIATED` is what tells the reconciler to
      // re-SEND rather than to poll; a row that never left must not be polled
      // forever for a status that will never exist.
      return current;

    case 'SEND_REJECTED':
      // Only meaningful before the request landed. Once MTN holds it, a local
      // send error cannot fail the payment.
      return current === 'INITIATED' ? 'FAILED' : current;

    case 'OBSERVED':
      return targetForObserved(event.status);

    case 'ABANDONED':
      return 'TIMEOUT';
  }
}

/** Fold a whole sequence of events. Used by the property tests. */
export function reduce(start: MomoStatus, events: readonly MomoEvent[]): MomoStatus {
  return events.reduce(transition, start);
}

/**
 * Is this transition allowed to be applied at all?
 *
 * A resolver may only move a transaction OUT of a claimable state, never into
 * `INITIATED` (nothing un-sends a request), and never backwards from PENDING to
 * CREATED (that would churn the row for no information).
 */
export function canApply(from: MomoStatus, to: MomoStatus): boolean {
  if (from === to) return false;
  if (!isClaimable(from)) return false;
  if (to === 'INITIATED') return false;
  if (to === 'CREATED' && from !== 'INITIATED') return false;
  return true;
}

/**
 * The statuses a claim may transition OUT of, for a given target.
 *
 * This is the `IN (...)` list of the guarded UPDATE, derived rather than
 * hand-written so the SQL and the machine cannot drift apart.
 */
export function claimableFor(target: MomoStatus): readonly MomoStatus[] {
  return CLAIMABLE_STATUSES.filter((from) => canApply(from, target));
}

/**
 * Does this transition write the ledger?
 *
 * The answer is "only on the way into SUCCESSFUL, from a non-terminal state" —
 * and this function is the only place in the codebase that answers it
 * (CLAUDE.md #2, docs/01 §6 rule 4, A1 §3).
 */
export function postsLedger(from: MomoStatus, to: MomoStatus): boolean {
  return to === 'SUCCESSFUL' && isClaimable(from);
}
