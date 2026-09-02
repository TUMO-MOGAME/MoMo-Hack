/**
 * `/send` — THE FIRST PRODUCTION CODE PATH THAT CAN PAY MONEY OUT (M3a).
 *
 * The sibling of `demo-collect.ts`, and everything that file says about
 * CLAUDE.md #11 holds here identically: the agent has no write tools, does not
 * import this module, and cannot reach it. `/send` is a COMMAND, parsed by a
 * regex, typed by a human.
 *
 * ── BUT ADR-0014 IS WEAKER HERE, AND THAT MUST BE SAID OUT LOUD ──────────────
 *
 * `demo-collect.ts` can argue that a `requesttopay` is a *stronger* human
 * authorisation than a tap in our own UI, because the payer approves on their
 * own handset with a PIN we never see. **A transfer has no such second human.**
 * Nobody approves it. We say pay, MTN pays.
 *
 * So the only authorisation is the person typing `/send`, and every control has
 * to sit on our side of the wire:
 *
 *   1. the Telegram allowlist (M5d) — only configured chats reach this at all;
 *   2. the payee is CONFIGURATION, never input — one number, ours;
 *   3. `toPayoutAmount` enforces the R0.10 live payout cap on top of the R1.00
 *      general cap;
 *   4. `DEMO_MAX_PAYOUT_MINOR` below, a third ceiling at this surface;
 *   5. the ledger is written only when MTN says SUCCESSFUL, never optimistically.
 *
 * ── WHAT THIS DOES ON PRODUCTION TODAY: NOTHING, AND IT SAYS SO ──────────────
 *
 * Measured 2026-09-03: `POST /disbursement/v1_0/transfer` returns **403
 * Forbidden** on `mtnsouthafrica`, before the request body is read — a
 * deliberately malformed body returns the same 403. Disbursement *reads* work,
 * collections POSTs work. The refusal is MTN's authorization gate, above the
 * MoMo service, and no change to this file can affect it (momoAPIs.md §8a).
 *
 * The reply path turns that 403 into a sentence that says what it is, rather
 * than a generic failure — because "we are not permitted to pay out yet" and
 * "the payment failed" are very different things to tell a person waiting for
 * their money.
 */

import { formatZAR, parseMinor, type Minor } from '@/domain/money';
import { maskMsisdn } from '@/lib/momo/test-msisdns';
import { getMomoClient, readMomoMode } from '@/lib/momo';
import { readMomoConfig } from '@/lib/momo/config';
import { getMoneyDb } from '@/server/db';
import { ensureMoneyDb } from '@/server/db/bootstrap';
import { initiatePayout } from '@/server/momo/payout';
import { log } from '@/server/log';

/**
 * The demo ceiling for a PAYOUT — a tenth of the collection ceiling.
 *
 * `DEMO_MAX_MINOR` is R5.00 for collections, which is safe because a collection
 * asks and a human can decline. Nobody declines a transfer. R0.50 is enough to
 * show a payout landing and small enough that being wrong about all of this
 * costs less than a taxi fare.
 */
export const DEMO_MAX_PAYOUT_MINOR = 50n;

export type DemoPayoutResult =
  | {
      readonly ok: true;
      readonly transactionId: string;
      readonly status: string;
      readonly amountMinor: Minor;
      readonly masked: string;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Parse the amount from "/send 0.10", "/send R0.10".
 *
 * Shares `parseMinor` and the same anchoring rules as `parsePayAmount` — see
 * `demo-collect.ts` for why a trailing number is REFUSED rather than resolved:
 * a real user typed `/pay 0.2 0767221345` and the first parser matched the
 * phone number as the amount. On a payout that bug pays out the phone number.
 */
export function parseSendAmount(text: string): Minor | null {
  const match = /(?:^|\s)r?\s*(\d+(?:\.\d{1,2})?)(?:\s|$)/i.exec(text.trim());
  if (!match?.[1]) return null;
  try {
    const amount = parseMinor(match[1]);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

/** Anything beyond a single amount is refused outright, never resolved. */
export function hasExtraSendArguments(text: string): boolean {
  const numbers = text.trim().match(/\d+(?:\.\d+)?/g);
  return (numbers?.length ?? 0) > 1;
}

/**
 * Pay the configured demo handset.
 *
 * Returns a discriminated result rather than throwing: every refusal here has a
 * sentence a person should read, and a payout that did not happen must never be
 * ambiguous about whether it did.
 */
export async function sendDemoPayout(
  amountMinor: Minor,
  initiatedBy: string,
  env: Record<string, string | undefined> = process.env,
): Promise<DemoPayoutResult> {
  const msisdn = env.MOMO_DEMO_MSISDN?.trim();
  if (!msisdn) {
    return { ok: false, reason: 'No payee number is configured, so there is nobody to pay.' };
  }

  if (amountMinor <= 0n) {
    return { ok: false, reason: 'That amount is not a payment.' };
  }
  if (amountMinor > DEMO_MAX_PAYOUT_MINOR) {
    return {
      ok: false,
      reason:
        `${formatZAR(amountMinor)} is over the ${formatZAR(DEMO_MAX_PAYOUT_MINOR as Minor)} payout ceiling. ` +
        'A payout has nobody to approve it, so its ceiling is lower than a payment request.',
    };
  }

  // Bind the adapter in THIS instance — serverless isolates every route
  // (MISTAKES.md M8).
  ensureMoneyDb();

  const config = readMomoConfig(env);
  const live = config.targetEnvironment !== 'sandbox';

  // Announce it BEFORE it happens. On the way out this matters more than on the
  // way in: if this line is in the drain and the transfer is not, we know money
  // did not leave. The reverse ordering would leave that in doubt.
  log('warn', 'demo.send.initiating', {
    amount: formatZAR(amountMinor),
    payee: maskMsisdn(msisdn),
    environment: config.targetEnvironment,
    live,
    mode: readMomoMode(env),
    initiatedBy,
  });

  const started = await initiatePayout(
    { db: getMoneyDb(), client: getMomoClient({ env }) },
    {
      amountMinor,
      msisdn,
      externalId: `kasi-out-${initiatedBy}-${Date.now()}`,
      // ⚠️ DEMO_PAYOUT, and the same reasoning as AIRTIME on the way in.
      //
      // Every other payout purpose requires an id the reconciler does not have:
      // ESCROW_RELEASE needs a job, OWNER_PAYOUT an owner, DRIVER_WAGE a driver.
      // `required()` throws INSIDE the resolve transaction, which on a payout
      // means the money has already left and no journal can be written for it —
      // the M6b trap, one direction over and considerably worse.
      //
      // DEMO_PAYOUT posts out of SUSPENSE, needs no context, and is the exact
      // mirror of the AIRTIME collection: money parked on the way in comes back
      // out on the way out, and SUSPENSE returns towards zero where docs/02 §2
      // says it must end the day.
      purpose: 'DEMO_PAYOUT',
      payerMessage: 'MoMo Kasi payout',
      payeeNote: `Paid via ${initiatedBy}`,
      // NULL, not the channel name — `initiated_by` is a uuid and there is no
      // authenticated user until M9a. See `demo-collect.ts`.
      initiatedBy: null,
    },
  );

  log('warn', 'demo.send.initiated', {
    correlation_id: started.transactionId,
    status: started.status,
    amount: formatZAR(amountMinor),
  });

  return {
    ok: true,
    transactionId: started.transactionId,
    status: started.status,
    amountMinor,
    masked: maskMsisdn(msisdn),
  };
}
