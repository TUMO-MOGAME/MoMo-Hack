/**
 * Collections — money in (momoAPIs.md §7, docs/11 §2).
 *
 * Taxi fare, electricity, school fees, airtime, stokvel contributions and
 * escrow funding all come through here.
 */

import { callbackUrlFor } from './config';
import { MomoRequestError, upstream } from './errors';
import { toMomoAmount } from './currency';
import {
  type MomoTransport,
  assertExternalId,
  assertReferenceId,
  classify,
  snippet,
} from './client';
import type {
  CollectionsApi,
  RequestToPayBody,
  RequestToPayResult,
  RequestToPayStatus,
} from './types';
import { MOMO_STATUSES, type MomoStatus } from '@/domain/ledger/state-machine';

export function createCollectionsApi(transport: MomoTransport): CollectionsApi {
  return {
    /**
     * `POST /collection/v1_0/requesttopay` (momoAPIs.md §7.1).
     *
     * `202 Accepted`, no body — the transaction is NOT complete. It resolves via
     * the callback (fast, unreliable) or the reconciler (slow, authoritative).
     *
     * `409 Conflict` means MTN already holds this reference id. That is SUCCESS
     * (docs/03 §1.2): the transaction exists upstream. It is returned as an
     * OUTCOME rather than thrown, so no caller can mistake it for a failure and
     * retry with a fresh id — the double-pay bug (A1 §5).
     */
    async requestToPay(referenceId, input): Promise<RequestToPayResult> {
      const cfg = transport.config();
      assertReferenceId(cfg, referenceId);
      assertExternalId(input.externalId);

      const money = toMomoAmount(input.amountMinor, cfg.targetEnvironment);
      const body: RequestToPayBody = {
        amount: money.amount,
        currency: money.currency,
        externalId: input.externalId,
        payer: { partyIdType: 'MSISDN', partyId: input.msisdn },
        payerMessage: input.payerMessage,
        payeeNote: input.payeeNote,
      };

      const callbackUrl = input.callbackUrl ?? callbackUrlFor(cfg, 'collection');
      const response = await transport.send(
        'collection',
        `${cfg.baseUrl}/collection/v1_0/requesttopay`,
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
     * `GET /collection/v1_0/requesttopay/{referenceId}` (momoAPIs.md §7.2).
     *
     * This is the AUTHORITATIVE status. The callback body is never trusted to
     * set a status directly — we take the reference id from it and come here
     * (docs/03 §3.1).
     */
    async getStatus(referenceId): Promise<RequestToPayStatus> {
      const cfg = transport.config();
      assertReferenceId(cfg, referenceId);

      const response = await transport.send(
        'collection',
        `${cfg.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
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
        // A 200 whose body we do not recognise is treated as retryable rather
        // than fatal: the transaction is real, we just could not read it.
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

function pickString(raw: Record<string, unknown>, key: string): Record<string, string> {
  const value = raw[key];
  return typeof value === 'string' ? { [key]: value } : {};
}
