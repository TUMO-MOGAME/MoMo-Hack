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
import { demoStatus, parsePayAmount, requestDemoPayment } from './demo-collect';

/** `/pay 0.20` → the sentence to send back. Never throws; a chat must answer. */
export async function payReply(text: string, channel: string): Promise<string> {
  const amount = parsePayAmount(text.replace(/^\/pay(?:@\S+)?/i, ''));
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

/** `/status` → resolve anything pending, then report what the ledger says. */
export async function statusReply(): Promise<string> {
  try {
    const s = await demoStatus();
    if (!s) return 'Nothing has been requested yet. Send /pay 0.20 to start one.';

    if (!s.settled) {
      return [
        `That ${formatZAR(s.amountMinor)} is still ${s.status.toLowerCase()}.`,
        '',
        'If your phone has not asked you yet, give it a moment. If you have already',
        'approved it, send /status again — I check with MTN each time.',
      ].join('\n');
    }

    const parts = s.parts.map((p) => `  ${p.label} ${formatZAR(p.amountMinor)}`).join('\n');

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
  } catch {
    return 'I could not reach the ledger just then. Nothing changed — /status only ever reads.';
  }
}

/** Exported for the tests, so the wording is pinned rather than described. */
export const PAY_USAGE_HINT = 'Tell me how much';
export type { Minor };
