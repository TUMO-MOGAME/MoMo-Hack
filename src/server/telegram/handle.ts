/**
 * What to do with one Telegram update.
 *
 * Kept out of the route so it can be tested without a `Request`, a network, or
 * a real bot token. The route's job is authentication and returning `200` fast;
 * this is the job.
 */

import type { AgentClient } from '@/lib/agent/gemini';
import { ABOUT_TEXT, HELP_TEXT } from '@/lib/agent/persona';
import type { TelegramClient } from '@/lib/telegram/client';
import type { TelegramUpdate } from '@/lib/telegram/types';
import { log } from '@/server/log';
import { appendTurn, readHistory, resetThread } from './memory';

/**
 * The money commands and the list of chats allowed to use them — ONE OBJECT.
 *
 * ── WHY THEY ARE BUNDLED, AND IT IS THE WHOLE POINT ──────────────────────────
 *
 * These were two optional fields. An allowlist that is a third optional field
 * is one a future route can forget to pass, and forgetting it is exactly the
 * failure M5d exists to prevent — a public bot with production credentials and
 * no gate. `MISTAKES.md` prefers a guard that makes the mistake IMPOSSIBLE over
 * one that merely detects it, so the capability and its gate are a single
 * value: you cannot give this handler the ability to spend money without
 * saying, in the same expression, who is allowed to.
 *
 * That is a compile-time guarantee rather than a convention, and it is the
 * reason this shape is worth the churn of changing the deps interface.
 */
export interface MoneyCommands {
  /**
   * Chat ids that may run `/pay` and `/status`. An EMPTY set denies everyone,
   * which is the correct default — see `readPayAllowlist`.
   */
  readonly allowlist: ReadonlySet<number>;
  readonly pay: (text: string) => Promise<string>;
  readonly status: () => Promise<string>;
  /**
   * `/send` — money OUT (M3a). Optional, and it is the ONE field here that is.
   *
   * `pay` and `status` are required because a bot wired for money must be able
   * to do both. A payout is a strictly larger capability: it needs no second
   * human, so a deployment may reasonably wire the money commands WITHOUT it.
   * Absent means `/send` says so plainly rather than erroring.
   */
  readonly send?: (text: string) => Promise<string>;
}

export interface HandleDeps {
  readonly telegram: TelegramClient;
  readonly agent: AgentClient;
  /**
   * The money commands, INJECTED — which is the point, not a convenience.
   *
   * `handleUpdate` is pure decision-making and every test in
   * `tests/contract/telegram-webhook.test.ts` runs it with no network and no
   * database. Importing the payment path directly would put a live MoMo call
   * one careless test away, and would make the module graph say the Telegram
   * handler *can* move money even in tests that never intend to.
   *
   * Absent (the default) means `/pay` politely says it is unavailable, so the
   * bot degrades to a read-only assistant rather than erroring.
   */
  readonly money?: MoneyCommands;
}

export type HandleOutcome =
  | { readonly kind: 'ignored'; readonly reason: string }
  | { readonly kind: 'replied'; readonly source: 'command' | 'agent' | 'fallback' | 'denied' };

/**
 * Telegram sends `/pay@momokasi_demo_bot` in groups. Strip the suffix so a
 * command works the same in a group as in a direct message.
 */
export function parseCommand(text: string): string | undefined {
  const match = /^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?\b/.exec(text.trim());
  return match ? match[1]?.toLowerCase() : undefined;
}

/**
 * Commands answered from a constant, with no model call.
 *
 * `/start` is the first thing a new user ever sees, and it should not be able to
 * fail because an upstream is rate-limited.
 */
const CANNED: Record<string, string> = {
  start: HELP_TEXT,
  help: HELP_TEXT,
  about: ABOUT_TEXT,
};

/**
 * The reply when the model cannot answer.
 *
 * Deliberately not "something went wrong". The user asked a question and is
 * owed either an answer or an honest account of why there isn't one — and it
 * must not imply their money did something, because no money is involved.
 */
export const FALLBACK_TEXT =
  "Eish — my brain's offline for a second there. Nothing to do with your money; " +
  'I just could not reach the model. Try me again in a moment, or send /help for ' +
  'what I can do.';

/**
 * What a chat that is not on the allowlist is told.
 *
 * Three things it must do, and each is a decision:
 *
 * 1. **Say nothing happened.** The whole hazard of a payment command is
 *    ambiguity about whether money moved (`pay-replies.ts`, `MISTAKES.md` M10).
 *    A refusal is the easiest place in the product to be unambiguous, so it is.
 * 2. **Give the reason honestly** — the number this rings is a real person's
 *    phone, not a sandbox. "Not authorised" invites someone to keep trying.
 * 3. **Echo the chat id.** This is the operator's fix path: the id goes
 *    straight into `TELEGRAM_PAY_CHAT_IDS`. It gives an attacker nothing — it
 *    is their own id and the list lives on the server — and it turns a
 *    30-minute "why is the bot ignoring me" on stage into a paste.
 *
 * It does NOT offer to add them, or hint that asking would work. It ends.
 */
export function denialText(chatId: number): string {
  return [
    'Those commands move real money on MTN, so they only work from the chats set',
    'up for this demo — a real request rings a real person’s phone.',
    '',
    'Nothing was sent and nothing was charged.',
    '',
    `If this chat should be on that list, its id is ${chatId}.`,
    '',
    'Everything else still works — ask me anything, or send /help.',
  ].join('\n');
}

export async function handleUpdate(
  deps: HandleDeps,
  update: TelegramUpdate,
): Promise<HandleOutcome> {
  // An edited message is a new intent as far as we are concerned, but we do not
  // re-answer it: a user fixing a typo should not get two replies.
  const message = update.message;
  if (!message) return { kind: 'ignored', reason: 'no_message' };

  const text = message.text?.trim();
  if (!text) {
    // Photos, stickers, voice notes. Gig proof photos are M5c; until then,
    // silence is better than a wrong answer about an image we did not read.
    return { kind: 'ignored', reason: 'no_text' };
  }

  const chatId = message.chat.id;
  const command = parseCommand(text);

  if (command) {
    const canned = CANNED[command];
    if (canned) {
      // `/start` is a fresh conversation. Without this, someone restarting the
      // bot to escape a confused thread carries the confusion with them.
      if (command === 'start') resetThread(chatId);
      await deps.telegram.sendMessage({ chatId, text: canned });
      return { kind: 'replied', source: 'command' };
    }

    // ── THE ONLY PATH IN THIS FILE THAT CAN TOUCH MONEY ─────────────────────
    //
    // A COMMAND, matched by `parseCommand`'s regex. Not a model decision, not
    // an intent classifier, not free text that happened to look like a payment
    // request — those still reach the agent below, which has no write tools and
    // refuses to claim it can send anything (MISTAKES.md M10).
    //
    // This is what keeps CLAUDE.md #11 true while the bot can still take a
    // payment: the human types the verb and the amount, the server chooses the
    // payee from configuration, and MTN asks the payer for their own PIN on
    // their own handset. No model is anywhere in that sentence.
    if (command === 'pay' || command === 'status' || command === 'send') {
      const money = deps.money;
      if (!money) {
        await deps.telegram.sendMessage({
          chatId,
          text:
            command === 'status'
              ? 'No ledger connected right now.'
              : 'Payments are not switched on for this bot right now.',
        });
        return { kind: 'replied', source: 'command' };
      }

      // ── THE ALLOWLIST (M5d) ───────────────────────────────────────────────
      //
      // CHECKED BEFORE EITHER HANDLER IS CALLED, and before the typing
      // indicator — a denied chat should not even see the bot think about it.
      //
      // `/status` is gated as well as `/pay`, and that is deliberate rather
      // than over-caution. It is not read-only from MTN's point of view: it
      // drives the reconciler, and it reads out the amount and the split of a
      // payment made by somebody else. Neither belongs to a stranger.
      if (!money.allowlist.has(chatId)) {
        // The chat id is the ONLY thing that gets logged, and it is the only
        // thing worth logging: it is what an operator pastes into
        // TELEGRAM_PAY_CHAT_IDS to fix a legitimate denial.
        log('warn', 'telegram.pay.denied', {
          correlation_id: String(update.update_id),
          chat_id: String(chatId),
          command,
        });
        await deps.telegram.sendMessage({ chatId, text: denialText(chatId) });
        return { kind: 'replied', source: 'denied' };
      }

      // `/send` is checked AFTER the allowlist, deliberately. A chat that may
      // not spend money is told it may not spend money — it is never told which
      // capabilities this deployment happens to have.
      if (command === 'send' && !money.send) {
        await deps.telegram.sendMessage({
          chatId,
          text: 'Paying out is not switched on for this bot right now.',
        });
        return { kind: 'replied', source: 'command' };
      }

      await deps.telegram.sendChatAction(chatId, 'typing').catch(() => undefined);
      const reply =
        command === 'pay'
          ? await money.pay(text)
          : command === 'send'
            ? // Non-null: guarded immediately above.
              await money.send!(text)
            : await money.status();
      await deps.telegram.sendMessage({ chatId, text: reply });
      return { kind: 'replied', source: 'command' };
    }

    // An unknown command still reaches the agent — "/stokvel" should get a
    // useful answer about stokvels rather than "unknown command".
  }

  // The typing indicator is the cheapest possible latency fix: the model takes
  // ~4s, and four seconds of nothing reads as broken. Its failure is never
  // allowed to cost us the actual reply.
  await deps.telegram.sendChatAction(chatId, 'typing').catch(() => undefined);

  try {
    const reply = await deps.agent.reply([...readHistory(chatId), { role: 'user', text }]);
    await deps.telegram.sendMessage({ chatId, text: reply });
    // Recorded only after the send succeeds. A reply the user never saw is not
    // part of the conversation, and remembering it would have the bot referring
    // back to something that was never on their screen.
    appendTurn(chatId, text, reply);
    return { kind: 'replied', source: 'agent' };
  } catch (e) {
    log('warn', 'telegram.agent_failed', {
      correlation_id: String(update.update_id),
      error: e instanceof Error ? e.message : 'unknown',
    });
    await deps.telegram.sendMessage({ chatId, text: FALLBACK_TEXT });
    return { kind: 'replied', source: 'fallback' };
  }
}
