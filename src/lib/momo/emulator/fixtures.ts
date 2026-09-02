/**
 * Emulator response fixtures.
 *
 * ⚠️ PROVENANCE, STATED HONESTLY: docs/03 §5 specifies that these are captured
 * from the real sandbox by `npm run momo:record`, so the emulator replays REAL
 * behaviour rather than our guess at it. That recorder does not exist yet (it
 * needs a `package.json` script, and `package.json` is frozen for this
 * workstream), and no sandbox credentials have been provisioned (STATUS.md F9).
 *
 * So these bodies are TRANSCRIBED FROM momoAPIs.md §7.2 — the documented
 * example response — not recorded. They are structurally right and were never
 * observed. Tracked in STATUS.md as debt against D1.
 *
 * Nothing here is used to decide an outcome; outcomes come from the test MSISDN
 * table (`src/lib/momo/test-msisdns.ts`). These are only the surrounding shape.
 */

import type { MomoStatus } from '@/domain/ledger/state-machine';

export interface StatusFixtureInput {
  readonly referenceId: string;
  readonly status: MomoStatus;
  readonly amount: string;
  readonly currency: string;
  readonly externalId: string;
  readonly msisdn: string;
  readonly payerMessage: string;
  readonly payeeNote: string;
}

/**
 * The `GET /collection/v1_0/requesttopay/{referenceId}` body (momoAPIs.md §7.2).
 *
 * `financialTransactionId` is only present once MTN has actually moved money,
 * so it appears on SUCCESSFUL and on nothing else — reproducing that is the
 * difference between an emulator that catches bugs and one that hides them.
 */
export function requestToPayStatusBody(input: StatusFixtureInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    externalId: input.externalId,
    amount: input.amount,
    currency: input.currency,
    payer: { partyIdType: 'MSISDN', partyId: input.msisdn },
    payerMessage: input.payerMessage,
    payeeNote: input.payeeNote,
    status: input.status,
  };

  if (input.status === 'SUCCESSFUL') {
    body.financialTransactionId = deterministicFinancialId(input.referenceId);
  }
  if (input.status === 'FAILED' || input.status === 'REJECTED') {
    body.reason = input.status === 'REJECTED' ? 'APPROVAL_REJECTED' : 'INTERNAL_PROCESSING_ERROR';
  }

  return body;
}

/**
 * A stable pseudo-`financialTransactionId`. Derived from the reference id so a
 * replayed demo produces the same number twice, which matters when the ledger
 * console is on a projector.
 */
export function deterministicFinancialId(referenceId: string): string {
  let hash = 0;
  for (const ch of referenceId) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000_007;
  }
  return String(1_000_000_000 + (hash % 1_000_000_000));
}
