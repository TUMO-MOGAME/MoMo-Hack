/**
 * Disbursements — money OUT (momoAPIs.md §8, docs/11 §3, M3a).
 *
 * Gig payouts, escrow release, and the 60/25/10/5 revenue split. This is the
 * half of the pitch where youth get *paid*, and until now it did not exist —
 * which is why the agent has to refuse every "send money" request
 * (`MISTAKES.md` M10).
 *
 * ── HOW A TRANSFER DIFFERS FROM A COLLECTION, AND WHY IT IS TREATED HARDER ───
 *
 * The request bodies are one field apart: `payer` becomes `payee`. The RISK is
 * not one field apart.
 *
 * A `requesttopay` **asks**. MTN pushes a prompt to a handset, a human reads it,
 * and nothing moves until they type a PIN we never see. A misfire is somebody
 * receiving a request they decline — annoying, reversible by ignoring it.
 *
 * A `transfer` **pays**. There is no prompt, no PIN, no decline. We say pay and
 * MTN pays, out of our own float, to a number we chose. There is no second
 * human anywhere in that sentence, so every control has to sit on our side of
 * the wire:
 *
 *   · `toPayoutAmount` enforces BOTH the R1.00 live cap and the tighter R0.10
 *     payout cap, at the single chokepoint every outbound amount passes through;
 *   · the reference id is our persisted row id, never freshly minted here, so a
 *     retry is deduped by MTN into a 409 rather than paying twice;
 *   · a 409 is an OUTCOME, not an error, for exactly that reason.
 *
 * ── WHAT IS MEASURED, AND WHAT IS NOT ────────────────────────────────────────
 *
 * `transfer` and its status GET were verified against the **sandbox** on
 * 2026-09-03 — `202 Accepted`, then a `200` whose body is pinned in
 * `TransferStatus`. CLAUDE.md #9 satisfied: nothing here is coded from memory.
 *
 * **On PRODUCTION this endpoint returns `403 Forbidden` and always has.** A
 * deliberately malformed body returns the same 403, so the gateway never reads
 * our request at all — the refusal is authorization, above MoMo. Collections
 * POSTs succeed on the same credentials in the same breath. So this module is
 * correct and currently unusable on `mtnsouthafrica`; see momoAPIs.md §8a. That
 * is MTN's gate, not a gap here, and the code is ready for the moment it opens.
 */

import { callbackUrlFor } from './config';
import { MomoRequestError, upstream } from './errors';
import { toPayoutAmount } from './currency';
import {
  type MomoTransport,
  assertExternalId,
  assertReferenceId,
  classify,
  snippet,
} from './client';
import type { DisbursementsApi, TransferBody, TransferResult, TransferStatus } from './types';
import { MOMO_STATUSES, type MomoStatus } from '@/domain/ledger/state-machine';

export function createDisbursementsApi(transport: MomoTransport): DisbursementsApi {
  return {
    /**
     * `POST /disbursement/v1_0/transfer` — **[V] MEASURED 2026-09-03 (sandbox)**.
     *
     * `202 Accepted`, no body. The payout is NOT complete: it resolves through
     * the callback or the reconciler exactly like a collection does.
     *
     * `409 Conflict` means MTN already holds this reference id — SUCCESS, and
     * returned as an outcome so that no caller can read it as a failure and
     * retry with a fresh id. On the way IN that bug double-charges someone. On
     * the way OUT it double-PAYS them, out of our float, and there is nobody to
     * decline it.
     */
    async transfer(referenceId, input): Promise<TransferResult> {
      const cfg = transport.config();
      assertReferenceId(cfg, referenceId);
      assertExternalId(input.externalId);

      // THE PAYOUT CHOKEPOINT. Both caps, and there is no other way to build
      // the amount that goes on the wire.
      const money = toPayoutAmount(input.amountMinor, cfg.targetEnvironment);
      const body: TransferBody = {
        amount: money.amount,
        currency: money.currency,
        externalId: input.externalId,
        payee: { partyIdType: 'MSISDN', partyId: input.msisdn },
        payerMessage: input.payerMessage,
        payeeNote: input.payeeNote,
      };

      const callbackUrl = input.callbackUrl ?? callbackUrlFor(cfg, 'disbursement');
      const response = await transport.send(
        'disbursement',
        `${cfg.baseUrl}/disbursement/v1_0/transfer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // OUR persisted momo_transaction.id. Never freshly generated here.
            'X-Reference-Id': referenceId,
            ...(callbackUrl ? { 'X-Callback-Url': callbackUrl } : {}),
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 202) return { outcome: 'ACCEPTED', referenceId };
      if (response.status === 409) return { outcome: 'ALREADY_ACCEPTED', referenceId };

      throw new MomoRequestError(
        'HTTP',
        upstream(response.status, classify(response.status).retryable),
        snippet(await transport.text(response)),
      );
    },

    /**
     * `GET /disbursement/v1_0/transfer/{referenceId}` — **[V] MEASURED 2026-09-03**.
     *
     * The AUTHORITATIVE status, for the same reason as collections: a callback
     * body is never trusted to set a status directly (docs/03 §3.1).
     */
    async getTransferStatus(referenceId): Promise<TransferStatus> {
      const cfg = transport.config();
      assertReferenceId(cfg, referenceId);

      const response = await transport.send(
        'disbursement',
        `${cfg.baseUrl}/disbursement/v1_0/transfer/${referenceId}`,
        { method: 'GET', headers: {} },
      );

      if (!response.ok) {
        throw new MomoRequestError(
          'HTTP',
          upstream(response.status, classify(response.status).retryable),
          snippet(await transport.text(response)),
        );
      }

      const raw = await transport.json<Record<string, unknown>>(response);
      const status = raw.status;
      if (typeof status !== 'string' || !isMomoStatus(status)) {
        // A 200 we cannot read is retryable, not fatal — the payout is real,
        // we just could not tell what happened to it. For money going out,
        // "unknown" must never collapse into "failed": that is how a payout
        // gets sent twice.
        throw new MomoRequestError(
          'MALFORMED',
          upstream(response.status, true),
          `unrecognised status: ${String(status)}`,
        );
      }

      return {
        referenceId,
        status,
        ...pickString(raw, 'financialTransactionId'),
        ...pickString(raw, 'externalId'),
        ...pickString(raw, 'amount'),
        ...pickString(raw, 'currency'),
        ...pickString(raw, 'reason'),
        raw,
      };
    },
  };
}

function isMomoStatus(value: string): value is MomoStatus {
  return (MOMO_STATUSES as readonly string[]).includes(value);
}

/**
 * Copy a field only when it is genuinely a string.
 *
 * MTN omits `financialTransactionId` until a transfer settles and omits
 * `reason` unless it failed. Spreading `{ key: undefined }` would write the key
 * with an undefined value, which `exactOptionalPropertyTypes` rejects and which
 * would also make "absent" and "present but unknown" indistinguishable.
 */
function pickString(raw: Record<string, unknown>, key: string): Record<string, string> {
  const value = raw[key];
  return typeof value === 'string' ? { [key]: value } : {};
}
