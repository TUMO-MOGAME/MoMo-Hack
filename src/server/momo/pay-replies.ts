/**
 * The words a person reads when they ask to pay, on either channel.
 *
 * Separate from `demo-collect.ts` so the money logic has no opinion about
 * phrasing, and separate from the Telegram handler so the web chat says the
 * SAME thing. Channel parity is meant to be a property of the code, and two
 * handlers each writing their own sentences is exactly how it stops being one.
 *
 * ── THE RULE FOR EVERY STRING IN THIS FILE ───────────────────────────────────
 *
 * **Never claim the money has moved.** Initiating a `requesttopay` means MTN has
 * accepted a REQUEST, nothing more. The payer still has to approve it on their
 * handset and may decline, may not have signal, may not have the balance. A
 * reply that says "paid!" at this point is `MISTAKES.md` M10 all over again, one
 * layer down — and this time there would be a real transaction to be wrong
 * about, which is worse.
 *
 * So the vocabulary is deliberate: the request is "sent", the phone is "asked",
 * and only `/status` — after the reconciler has spoken to MTN — is allowed to
 * use the word "received".
 */

import { formatZAR, type Minor } from '@/domain/money';
import { log } from '@/server/log';
import {
  type DemoStatus,
  demoStatus,
  hasExtraArguments,
  parsePayAmount,
  requestDemoPayment,
} from './demo-collect';
import { hasExtraSendArguments, parseSendAmount, sendDemoPayout } from './demo-payout';

/** `/pay 0.20` → the sentence to send back. Never throws; a chat must answer. */
export async function payReply(text: string, channel: string): Promise<string> {
  const args = text.replace(/^\/pay(?:@\S+)?/i, '');

  // A second argument is almost always a payee, and answering it at all would
  // be misleading — this build cannot pay an arbitrary number, by design.
  // Saying so plainly beats parsing one of the two numbers and hoping.
  if (hasExtraArguments(args)) {
    return [
      'Just the amount, please — like /pay 0.20.',
      '',
      "I can't send money to a number you type. This asks the one phone that's",
      'set up for this demo to approve a payment, and that number lives in the',
      'server config, not in the message.',
    ].join('\n');
  }

  const amount = parsePayAmount(args);
  if (amount === null) {
    return 'Tell me how much — like /pay 0.20 — and I will ask your phone to approve it.';
  }

  try {
    const result = await requestDemoPayment(amount, channel);
    if (!result.ok) return result.reason;

    return [
      `Request sent for ${formatZAR(result.amountMinor)} to ${result.masked}.`,
      '',
      'Check your phone — MTN will ask you to approve it with your MoMo PIN.',
      'I never see that PIN; it goes to MTN, not to me.',
      '',
      'When you have approved it, send /status and I will read the ledger.',
    ].join('\n');
  } catch (e) {
    // LOG IT. An earlier draft of this comment claimed `requestDemoPayment` had
    // already logged the detail — it had not, because the throw comes from
    // inside `initiateCollection`, below it. So the first real failure of this
    // path produced a polite sentence and no cause anywhere, which is
    // MISTAKES.md M8 exactly: a catch that swallows into a friendly answer is
    // where evidence goes to die.
    //
    // The message goes to the drain, never to the user — it can carry a URL, a
    // reference id or a subscription key.
    log('error', 'demo.pay.failed', {
      channel,
      error: e instanceof Error ? e.message : 'unknown',
    });

    // A failed send is not a moved cent, and the reply must not leave that in
    // doubt.
    return [
      'I could not send that request just now, so nothing was charged and nothing is waiting on your phone.',
      'Try again in a moment.',
    ].join(' ');
  }
}

/**
 * MTN's failure reasons, in words a person can act on.
 *
 * Only the ones we have actually observed or that are documented in
 * `momoAPIs.md` — inventing an explanation for a code we have never seen is how
 * a support message becomes a lie.
 */
const REASONS: Record<string, string> = {
  PAYER_NOT_FOUND:
    "That number has no MoMo wallet in this environment, so MTN had nobody to ask. Check the number is registered for MTN MoMo, and that it's the same market these API credentials belong to.",
  PAYER_LIMIT_REACHED: 'That wallet has hit a transaction limit at MTN.',
  NOT_ENOUGH_FUNDS: 'There was not enough in the wallet to cover it.',
  PAYER_REJECTED: 'The payment was declined on the phone.',
  EXPIRED: 'The request sat unapproved for too long and MTN expired it.',
  INTERNAL_PROCESSING_ERROR: 'MTN had an internal error. Nothing was charged; it can be retried.',
};

/** `/status` → resolve anything pending, then report what the ledger says. */
export async function statusReply(): Promise<string> {
  try {
    const s = await demoStatus();
    if (!s) return 'Nothing has been requested yet. Send /pay 0.20 to start one.';
    return statusText(s);
  } catch {
    return 'I could not reach the ledger just then. Nothing changed — /status only ever reads.';
  }
}

/**
 * The words for one transaction's state — PURE, so it can be tested.
 *
 * Split out of `statusReply` because the bug that prompted it was found by
 * RUNNING the product, not by a test: a payout was told to *"check your
 * phone"*, a prompt that is never coming. Everything that made that reachable
 * — a database, a reconciler, a live MTN call — sits on the other side of this
 * function, and none of it is needed to assert what a person actually reads.
 */
export function statusText(s: DemoStatus): string {
  // ── A PAYOUT IS NOT A COLLECTION, AND MUST NOT BE DESCRIBED AS ONE ─────────
  //
  // Every sentence below used to talk about a phone being asked to approve. For
  // a `/send` there is no prompt, no PIN and no approval — telling someone to
  // check their phone describes an event that is never coming, which is
  // `MISTAKES.md` M10's failure in miniature: prose that fits the template
  // instead of the truth. Caught by RUNNING `/send` and reading the `/status`
  // that came back, not by a test.
  const payout = s.product === 'DISBURSEMENT';

  {
    // ── TERMINAL FAILURE IS NOT "STILL PENDING" ──────────────────────────────
    //
    // The first version of this said *"That R0.20 is still failed. If your phone
    // has not asked you yet, give it a moment"* — which told a user to wait for
    // a prompt that was never coming. FAILED, REJECTED and TIMEOUT are terminal
    // (CLAUDE.md's vocabulary section says so in as many words); nothing about
    // them changes by waiting, and inviting someone to keep checking is the
    // opposite of the honesty the rest of this file is careful about.
    //
    // It reads the REASON out of MTN's own response rather than guessing.
    // `PAYER_NOT_FOUND` in particular means something specific and actionable:
    // the number has no MoMo wallet in this environment.

    if (s.terminal && !s.settled) {
      const because = s.reason ? REASONS[s.reason] : undefined;
      return [
        `That ${formatZAR(s.amountMinor)} did not go through — MTN returned ${s.status}.`,
        '',
        because ?? 'MTN did not say why.',
        '',
        payout
          ? 'No money left the wallet.'
          : 'No money moved, and nothing is waiting on your phone.',
      ].join('\n');
    }

    if (!s.settled) {
      return [
        `That ${formatZAR(s.amountMinor)} is still ${s.status.toLowerCase()}.`,
        '',
        ...(payout
          ? [
              'Nothing to approve — a payout has no PIN prompt. MTN is still processing it.',
              'Send /status again and I will ask them once more.',
            ]
          : [
              'If your phone has not asked you yet, give it a moment. If you have already',
              'approved it, send /status again — I check with MTN each time.',
            ]),
      ].join('\n');
    }

    const parts = s.parts.map((p) => `  ${p.label} ${formatZAR(p.amountMinor)}`).join('\n');

    if (payout) {
      return [
        `✅ ${formatZAR(s.amountMinor)} paid out, and the journal balances.`,
        '',
        'The ledger records it as money LEAVING — SUSPENSE debited, MOMO_SETTLEMENT',
        'credited — which is the exact mirror of the collection that put it there.',
        'Every posting sums to zero, and the database enforces that with a trigger.',
        '',
        'That is the round trip: money in, money out, and SUSPENSE back to zero.',
      ].join('\n');
    }

    return [
      `✅ ${formatZAR(s.amountMinor)} received, and the journal balances.`,
      '',
      'Every posting sums to zero — the database enforces that with a trigger,',
      'so an unbalanced journal cannot be written at all.',
      '',
      `If that had been a taxi fare, ${formatZAR(s.amountMinor)} would split:`,
      parts,
      '',
      'Integer cents, so nothing is invented or lost in the rounding.',
    ].join('\n');
  }
}

/**
 * `/send <amount>` → the sentence to send back (M3a). Never throws.
 *
 * ── THE RULE FOR EVERY STRING BELOW, AND IT IS STRICTER THAN `/pay`'S ────────
 *
 * `/pay` must never claim money HAS moved, because MTN has only accepted a
 * request. `/send` must never claim money has moved EITHER — a `202` on a
 * transfer means accepted for processing, not paid — but the failure modes are
 * the opposite way round:
 *
 *   · a `/pay` that silently succeeded costs the payer money they can see;
 *   · a `/send` that silently succeeded costs US money, twice, if a human
 *     reads "it failed" and sends it again.
 *
 * So "I could not send that" is only ever said when we KNOW nothing left, and
 * anything uncertain says so in those words and points at `/status`.
 */
export async function sendReply(text: string, channel: string): Promise<string> {
  const args = text.replace(/^\/send(?:@\S+)?/i, '');

  if (hasExtraSendArguments(args)) {
    return [
      'Just the amount, please — like /send 0.10.',
      '',
      "I can't pay a number you type. This pays the one phone that's set up for",
      'this demo, and that number lives in the server config, not in the message.',
    ].join('\n');
  }

  const amount = parseSendAmount(args);
  if (amount === null) {
    return 'Tell me how much to send — like /send 0.10.';
  }

  try {
    const result = await sendDemoPayout(amount, channel);
    if (!result.ok) return result.reason;

    return [
      `Payout of ${formatZAR(result.amountMinor)} accepted for ${result.masked}.`,
      '',
      'Nobody has to approve this one — a payout has no PIN prompt. MTN is',
      'processing it now.',
      '',
      'Send /status when you want me to check with MTN and read the ledger.',
    ].join('\n');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';

    log('error', 'demo.send.failed', { channel, error: message });

    // ── THE 403 DESERVES ITS OWN SENTENCE ────────────────────────────────────
    //
    // Measured on production 2026-09-03: MTN refuses `POST .../transfer` with a
    // bare 403 before reading the body. Collapsing that into "something went
    // wrong" would send someone hunting a bug in our code that is not there.
    if (/\b403\b|forbidden/i.test(message)) {
      return [
        'MTN will not let this account pay out yet, so nothing was sent and nothing left the wallet.',
        '',
        'This is an authorisation gate on their side, not a failure here — collections',
        'work on the same credentials in the same breath. Money can come in; it cannot',
        'go out until MTN enables disbursements for this account.',
      ].join('\n');
    }

    // Anything else is genuinely uncertain, and says so rather than guessing.
    return [
      'I could not tell whether that payout went through, so please do NOT send it again yet.',
      'Run /status first — if it did leave, it will be in the ledger, and sending twice',
      'would pay it twice.',
    ].join('\n');
  }
}

/** Exported for the tests, so the wording is pinned rather than described. */
export const PAY_USAGE_HINT = 'Tell me how much';
export type { Minor };
