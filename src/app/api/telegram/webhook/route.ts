/**
 * `POST /api/telegram/webhook` — the Telegram channel's inbound edge (M5a).
 *
 * UNLIKE THE MOMO CALLBACK, THIS ONE IS AUTHENTICATED. Telegram echoes the
 * `secret_token` we hand to `setWebhook` in the
 * `X-Telegram-Bot-Api-Secret-Token` header on every update (docs/11 §6,
 * ADR-0007). A mismatch is a `401` and a log line — nobody who cannot produce
 * the secret gets to make this bot say anything.
 *
 * That is the whole reason the body may be trusted here, which is the opposite
 * of the MoMo callback's posture next door.
 *
 * EVERY OTHER OUTCOME IS `200`. Telegram retries any non-2xx, escalating, and a
 * body we cannot parse will not parse better on the fourth attempt — so a bad
 * update is acknowledged and dropped, not rejected. The one exception is the
 * auth failure above, which must be visible.
 *
 * ── THIS ROUTE CAN MOVE MONEY, AND THE DOCSTRING USED TO DENY IT ─────────────
 *
 * Until #38 this comment said *"NOTHING HERE TOUCHES MONEY. No ledger write, no
 * MoMo call, no database."* That was true when written and false the moment
 * `/pay` was wired in below. It is corrected here rather than quietly deleted,
 * because it is `MISTAKES.md` M10's second cause happening a second time in a
 * different file: **a comment that describes a build state carries an expiry
 * date**, and the next person reads a confident false claim and stops checking.
 *
 * What is true now:
 *
 * - A valid update carrying `/pay` reaches MTN and writes to the ledger.
 * - The blast radius is bounded by four things, none of which is this comment:
 *   the payee is configuration and never input (`pay-replies.ts`); the amount
 *   is capped per transaction (`lib/momo/budget.ts`); the chat must be on
 *   `TELEGRAM_PAY_CHAT_IDS` (M5d, below); and the payer approves on their own
 *   handset with a PIN we never see.
 * - The AGENT still cannot move money. `respond()` has no write tools and does
 *   not import the payment module (CLAUDE.md #11, ADR-0014). That claim is
 *   still load-bearing — it is only the *route* that changed, not the model's
 *   reach, and free text that merely sounds like a payment is still refused.
 */

import { createAgentClient } from '@/lib/agent/gemini';
import { createTelegramClient } from '@/lib/telegram/client';
import { isFromTelegram, readPayAllowlist, readTelegramConfig } from '@/lib/telegram/config';
import { parseUpdate } from '@/lib/telegram/types';
import { log } from '@/server/log';
import { handleUpdate } from '@/server/telegram/handle';
import { payReply, sendReply, statusReply } from '@/server/momo/pay-replies';
import { claimUpdate } from '@/server/telegram/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  let config;
  try {
    config = readTelegramConfig();
  } catch {
    // Deployed without credentials. Say so in the log, and do NOT 500 — a 500
    // makes Telegram retry a configuration problem thousands of times.
    log('error', 'telegram.webhook.unconfigured', {});
    return ok();
  }

  if (
    !isFromTelegram(request.headers.get('x-telegram-bot-api-secret-token'), config.webhookSecret)
  ) {
    log('warn', 'telegram.webhook.bad_secret', {});
    return new Response(null, { status: 401 });
  }

  const update = parseUpdate(await request.json().catch(() => null));
  if (!update) {
    log('info', 'telegram.webhook.unparseable', {});
    return ok();
  }

  // Telegram retries when we are slow. Answering the same update twice is the
  // difference between a bot and a bot that argues with itself.
  if (!claimUpdate(update.update_id)) {
    log('info', 'telegram.webhook.duplicate', { correlation_id: String(update.update_id) });
    return ok();
  }

  try {
    const outcome = await handleUpdate(
      {
        telegram: createTelegramClient(),
        agent: createAgentClient(),
        // The money commands are supplied HERE and nowhere else, so the whole
        // payment capability of this bot is visible in one place. `handleUpdate`
        // itself imports neither, and its contract tests pass none — a test can
        // therefore never accidentally reach MTN.
        //
        // THE ALLOWLIST IS PART OF THE SAME VALUE (M5d). It is not a separate
        // field this route could forget: `MoneyCommands` requires it, so the
        // only way to give the bot a payment capability is to say in the same
        // breath who may use it. Unset means the empty set, which denies
        // everyone — see `readPayAllowlist`.
        money: {
          allowlist: readPayAllowlist(),
          pay: (text) => payReply(text, 'telegram'),
          status: statusReply,
          send: (text) => sendReply(text, 'telegram'),
        },
      },
      update,
    );
    log('info', 'telegram.webhook.handled', {
      correlation_id: String(update.update_id),
      outcome: outcome.kind,
      ...(outcome.kind === 'replied' ? { source: outcome.source } : { reason: outcome.reason }),
    });
  } catch (e) {
    // The handler already converts a model failure into a friendly reply, so
    // reaching here means Telegram itself is unreachable. Nothing to retry
    // against, and a 500 would only make Telegram hammer us.
    log('error', 'telegram.webhook.failed', {
      correlation_id: String(update.update_id),
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return ok();
}

function ok(): Response {
  return new Response(null, { status: 200 });
}
