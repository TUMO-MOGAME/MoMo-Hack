/**
 * `POST /api/pay` — the web chat's `/pay` and `/status` commands.
 *
 * ── WHY THIS IS A SEPARATE ROUTE FROM `/api/agent` ───────────────────────────
 *
 * `/api/agent`'s docstring says, in as many words:
 *
 *   *"WHAT THIS ROUTE CANNOT DO: Move money. Not 'will not' — cannot.
 *   `respond()` reaches three read-only tools and there is no write tool in the
 *   module graph below it."*
 *
 * That sentence is worth more than the convenience of one endpoint. Adding a
 * payment branch to `/api/agent` would make it false, and a false claim in a
 * docstring is worse than no claim — the next person reads it and stops
 * checking. So the agent route stays read-only and provably so, and money lives
 * here, where the file name says what it does.
 *
 * The client sends here only when the message starts with `/pay` or `/status` —
 * a literal slash command, matched before anything reaches the model. Free text
 * that merely *sounds* like a payment ("send R50 to my brother") still goes to
 * `/api/agent`, which refuses it and says so (MISTAKES.md M10).
 *
 * ── THE SAME REPLIES AS TELEGRAM, FROM THE SAME MODULE ───────────────────────
 *
 * `payReply` and `statusReply` are shared with the bot. "Both channels should
 * respond the same" is then a property of the code rather than a promise two
 * handlers make separately — which is the point of `respond()` and applies just
 * as much to the sentences around a payment.
 */

import { createRateLimiter } from '@/server/momo/callback';
import { log } from '@/server/log';
import { payReply, sendReply, statusReply } from '@/server/momo/pay-replies';
import { cannedReply } from '@/lib/agent/persona';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tighter than the agent's 20/min, because every call here can spend real
 * money and ring a real phone. Six is enough to fumble a demo twice and not
 * enough to be used as a way to pester the payer.
 */
const rateLimited = createRateLimiter(6);

/**
 * Same allowlist as `/api/agent` (A5-03), and it matters more on this route.
 *
 * ── WHAT THIS DOES AND DOES NOT STOP, STATED HONESTLY ────────────────────────
 *
 * The Telegram channel has a real gate — a chat-id allowlist (M5d). This route
 * does not, and the asymmetry is worth naming rather than leaving for someone
 * to discover: **anyone who can reach `momo.tumoolo.tech` can POST here.**
 *
 * The first version allowed a request with NO `Origin` header at all
 * (`if (!origin) return true`), which let a bare
 * `curl -d '{"message":"/pay 1.00"}'` ring the demo phone. That default is now
 * closed: a missing `Origin` is accepted only alongside `x-momo-chat`, which a
 * browser cannot attach cross-origin without a preflight we never answer.
 *
 * **That is friction, not authentication.** A determined caller can forge both
 * headers with one curl flag. What actually bounds the damage is elsewhere, and
 * all of it holds:
 *
 * - the payee is configuration, never input — this can only ever ring ONE phone;
 * - `MOMO_LIVE_MAX_MINOR` caps a live transaction at R1.00;
 * - the rate limiter below allows 6/min per IP;
 * - **no money moves without the payer typing their PIN into MTN's own app.**
 *   The worst an attacker achieves is unsolicited prompts on one handset.
 *
 * If web `/pay` needs a real gate before this is public for longer than a demo,
 * it wants a shared secret the operator holds — not a header check. That is a
 * product decision, not a refactor, and it is recorded in `STATUS.md` rather
 * than quietly half-built here.
 */
function fromOurOwnPage(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('x-momo-chat') === '1';
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === new URL(request.url).host) return true;
  return host === 'momo.tumoolo.tech' || /^localhost(:\d+)?$/.test(host);
}

export async function POST(request: Request): Promise<Response> {
  if (!fromOurOwnPage(request)) {
    log('warn', 'pay.origin.rejected', {});
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return Response.json(
      { reply: 'Slow down a moment — that is a real payment request each time.' },
      { status: 429 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const message =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message.slice(0, 120).trim()
      : '';

  // ── CHANNEL PARITY: /help, /about and /start answer here too ──────────────
  //
  // These are canned text with NO model call and NO money, and they are handled
  // before the payment dispatch precisely because they touch neither. They used
  // to live only in the Telegram handler, so typing `/help` in the web chat
  // went to the model as ordinary text and got whatever Gemini improvised —
  // parity holding for `/pay` and quietly not for `/help`.
  //
  // Answered ahead of the origin-sensitive money path on purpose: nothing here
  // can spend anything, so it needs no more protection than the page itself.
  const canned = /^\/([a-z]+)\b/i.exec(message);
  const cannedText = canned?.[1] ? cannedReply(canned[1]) : null;
  if (cannedText) {
    return Response.json({ reply: cannedText }, { headers: { 'cache-control': 'no-store' } });
  }

  if (!/^\/(pay|status|send)\b/i.test(message)) {
    return Response.json({ error: 'not a payment command' }, { status: 400 });
  }

  try {
    const reply = /^\/status\b/i.test(message)
      ? await statusReply()
      : /^\/send\b/i.test(message)
        ? await sendReply(message, 'web')
        : await payReply(message, 'web');
    return Response.json({ reply }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    log('error', 'pay.failed', { error: e instanceof Error ? e.message : 'unknown' });
    // Never leave it ambiguous whether money moved.
    return Response.json({
      reply:
        'Something went wrong sending that request. Nothing was charged — if your phone did not ask you, no payment was started.',
    });
  }
}
