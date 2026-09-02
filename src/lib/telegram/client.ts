/**
 * The outbound half of the Telegram channel (docs/11 §6, A5).
 *
 * Only the methods we actually call. `editMessageText`, `answerCallbackQuery`,
 * `sendPhoto` and `setChatMenuButton` are in docs/11 for the inline-keyboard and
 * Mini App work (M5c); they are not here because nothing calls them yet, and a
 * wrapper with no caller is a wrapper nobody has tested.
 *
 * The bot token goes in the URL PATH, which is how Telegram's API works. That
 * means the token must never reach a log line, an error message or a thrown
 * stack — so every failure here reports the METHOD and the status, never the
 * URL.
 */

import { AppException } from '@/lib/errors';
import { readTelegramConfig, TELEGRAM_API_BASE, type EnvBag } from './config';

export interface SendMessageOptions {
  readonly chatId: number;
  readonly text: string;
  /** Telegram rejects `parse_mode` payloads with unbalanced markup, so plain text is the default. */
  readonly parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  readonly replyToMessageId?: number;
}

export interface TelegramClient {
  sendMessage(options: SendMessageOptions): Promise<void>;
  sendChatAction(chatId: number, action: 'typing'): Promise<void>;
}

/** Telegram truncates at 4096 characters and 400s the request that exceeds it. */
export const MAX_MESSAGE_CHARS = 4096;

export function truncateForTelegram(text: string): string {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…`;
}

export function createTelegramClient(env: EnvBag = process.env): TelegramClient {
  const config = readTelegramConfig(env);

  async function call(method: string, payload: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Drain the body so the connection can be reused, but do not attach it
        // to the error: Telegram echoes the request back in `description`, and
        // the request is where the token lives.
        await response.text().catch(() => '');
        throw new AppException({
          kind: 'UPSTREAM',
          provider: 'telegram',
          // 429 is Telegram's flood control and 5xx is theirs to fix; both are
          // worth another attempt. A 400 means we built a bad payload and will
          // build the same bad payload again.
          retryable: response.status === 429 || response.status >= 500,
          status: response.status,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async sendMessage(options) {
      await call('sendMessage', {
        chat_id: options.chatId,
        text: truncateForTelegram(options.text),
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
        ...(options.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
      });
    },

    async sendChatAction(chatId, action) {
      await call('sendChatAction', { chat_id: chatId, action });
    },
  };
}
