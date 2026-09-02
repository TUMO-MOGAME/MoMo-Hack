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

export interface HandleDeps {
  readonly telegram: TelegramClient;
  readonly agent: AgentClient;
}

export type HandleOutcome =
  | { readonly kind: 'ignored'; readonly reason: string }
  | { readonly kind: 'replied'; readonly source: 'command' | 'agent' | 'fallback' };

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
