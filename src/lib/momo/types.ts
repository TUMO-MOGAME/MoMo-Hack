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
 * `POST /disbursement/v1_0/transfer` body — **[V] MEASURED 2026-09-03**.
 *
 * Identical to `RequestToPayBody` except that `payer` becomes `payee`, which is
 * the entire difference between asking for money and sending it. Verified by a
 * `202 Accepted` against the sandbox with exactly these fields; momoAPIs.md §8.
 *
 * The two bodies are deliberately NOT unified into one generic type. They are
 * one field apart today and that field is the direction money travels — the
 * kind of similarity worth keeping visible rather than abstracting away.
 */
export interface TransferBody {
  /** Decimal STRING, e.g. "0.10". Never a number — see `currency.ts`. */
  readonly amount: string;
  readonly currency: string;
  readonly externalId: string;
  readonly payee: { readonly partyIdType: 'MSISDN'; readonly partyId: string };
  readonly payerMessage: string;
  readonly payeeNote: string;
}

export interface TransferInput {
  /** ZAR minor units. Passes the PAYOUT cap, which is tighter than the inbound one. */
  readonly amountMinor: bigint;
  readonly msisdn: string;
  readonly externalId: string;
  readonly payerMessage: string;
  readonly payeeNote: string;
  readonly callbackUrl?: string;
}

/** Same 202/409 reasoning as a collection — see `RequestToPayOutcome`. */
export type TransferOutcome = 'ACCEPTED' | 'ALREADY_ACCEPTED';

export interface TransferResult {
  readonly outcome: TransferOutcome;
  readonly referenceId: string;
}

/**
 * `GET /disbursement/v1_0/transfer/{referenceId}` — **[V] MEASURED 2026-09-03**.
 *
 * The measured body, from the sandbox (currency label elided — the containment
 * rule in `tests/contract/currency.test.ts` allows the sandbox label in exactly
 * one file, and that file is `currency.ts`):
 *
 * ```json
 * {"amount":"12.5","currency":"<label>","externalId":"payout-…",
 *  "payee":{"partyIdType":"MSISDN","partyId":"46733123453"},
 *  "payerMessage":"…","payeeNote":"…","status":"PENDING"}
 * ```
 *
 * Note `"12.5"`, not `"12.50"` — MTN normalises the decimal it echoes back.
 * Anything comparing this to what we sent must compare MONEY, not strings.
 */
export interface TransferStatus {
  readonly referenceId: string;
  readonly status: MomoStatus;
  readonly financialTransactionId?: string;
  readonly externalId?: string;
  readonly amount?: string;
  readonly currency?: string;
  readonly reason?: string;
  readonly raw: unknown;
}

export interface DisbursementsApi {
  transfer(referenceId: string, input: TransferInput): Promise<TransferResult>;
  getTransferStatus(referenceId: string): Promise<TransferStatus>;
}

/**
 * The interface the emulator implements identically (ADR-0009). If the sandbox
 * dies ninety seconds before we present, `MOMO_MODE=emulator` swaps the whole
 * thing at runtime with no redeploy.
 */
export interface MomoClient {
  readonly mode: MomoMode;
  readonly collections: CollectionsApi;
  readonly disbursements: DisbursementsApi;
}
