/**
 * The MoMo boundary types.
 *
 * `src/lib/momo/**` is the only place in the codebase that speaks HTTP to MTN.
 * It NEVER touches the database (docs/01 §5) — it returns values, and callers
 * persist them. Every function takes an explicit `referenceId`, because the
 * caller must have persisted that id BEFORE a packet leaves (docs/03 §2).
 *
 * API facts live in `momoAPIs.md`. Nothing here is coded from memory.
 */

import type { MomoStatus } from '@/domain/ledger/state-machine';

/**
 * The URL path segment, and the token-cache key. There are THREE subscriptions
 * and therefore three token caches — a single MOMO_SUBSCRIPTION_KEY is a bug
 * waiting to happen (momoAPIs.md §3).
 */
export const MOMO_PRODUCTS = ['collection', 'disbursement', 'remittance'] as const;

export type MomoProduct = (typeof MOMO_PRODUCTS)[number];

/** Mirrors the `momo_product` enum in 0001_ledger.sql. */
export type MomoProductEnum = 'COLLECTION' | 'DISBURSEMENT' | 'REMITTANCE';

export function productPath(product: MomoProductEnum): MomoProduct {
  return product.toLowerCase() as MomoProduct;
}

export type MomoMode = 'sandbox' | 'emulator';

/** `POST /{product}/token/` (momoAPIs.md §5). */
export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  /** Seconds. 3600 in sandbox; we refresh at 80% of it. */
  readonly expires_in: number;
}

/** `POST /collection/v1_0/requesttopay` body (momoAPIs.md §7.1). */
export interface RequestToPayBody {
  /** Decimal STRING, e.g. "12.50". Never a number — see `currency.ts`. */
  readonly amount: string;
  readonly currency: string;
  /** Our human-readable ref. Must not contain spaces (momoAPIs.md §6). */
  readonly externalId: string;
  readonly payer: { readonly partyIdType: 'MSISDN'; readonly partyId: string };
  readonly payerMessage: string;
  readonly payeeNote: string;
}

export interface RequestToPayInput {
  /** ZAR minor units. The currency relabel happens in `currency.ts` and nowhere else. */
  readonly amountMinor: bigint;
  readonly msisdn: string;
  readonly externalId: string;
  readonly payerMessage: string;
  readonly payeeNote: string;
  /** Optional per-request callback. Must live under `MOMO_CALLBACK_HOST`. */
  readonly callbackUrl?: string;
}

/**
 * What a `requesttopay` POST actually told us.
 *
 * `ALREADY_ACCEPTED` is a 409 from MTN, which means "I already have this
 * reference id". That is SUCCESS — the transaction exists upstream (docs/03
 * §1.2). It is modelled as an outcome rather than an error precisely so no
 * caller can mistake it for a failure and retry with a fresh id.
 */
export type RequestToPayOutcome = 'ACCEPTED' | 'ALREADY_ACCEPTED';

export interface RequestToPayResult {
  readonly outcome: RequestToPayOutcome;
  readonly referenceId: string;
}

/** `GET /collection/v1_0/requesttopay/{referenceId}` (momoAPIs.md §7.2). */
export interface RequestToPayStatus {
  readonly referenceId: string;
  readonly status: MomoStatus;
  readonly financialTransactionId?: string;
  readonly externalId?: string;
  readonly amount?: string;
  readonly currency?: string;
  readonly reason?: string;
  /** The untouched body, stored in `momo_transaction.last_response`. */
  readonly raw: unknown;
}

export interface CollectionsApi {
  requestToPay(referenceId: string, input: RequestToPayInput): Promise<RequestToPayResult>;
  getStatus(referenceId: string): Promise<RequestToPayStatus>;
}

/**
 * The interface the emulator implements identically (ADR-0009). If the sandbox
 * dies ninety seconds before we present, `MOMO_MODE=emulator` swaps the whole
 * thing at runtime with no redeploy.
 */
export interface MomoClient {
  readonly mode: MomoMode;
  readonly collections: CollectionsApi;
}
