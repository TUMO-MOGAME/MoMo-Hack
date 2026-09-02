/**
 * The Telegram webhook's contract (docs/11 §6, M5a).
 *
 * The security-relevant behaviour is the secret header: everything else in this
 * route is a convenience, but an unauthenticated webhook is a bot anybody can
 * puppet. That case gets the most tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isFromTelegram, readTelegramConfig } from '@/lib/telegram/config';
import { truncateForTelegram } from '@/lib/telegram/client';
import { parseUpdate } from '@/lib/telegram/types';
import { claimUpdate, __resetAll } from '@/server/telegram/memory';
import {
  FALLBACK_TEXT,
  handleUpdate,
  parseCommand,
  type HandleDeps,
} from '@/server/telegram/handle';
import { HELP_TEXT } from '@/lib/agent/persona';

beforeEach(() => __resetAll());

describe('secret header', () => {
  const secret = 'a'.repeat(64);

  it('accepts the exact secret', () => {
    expect(isFromTelegram(secret, secret)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(isFromTelegram(null, secret)).toBe(false);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(isFromTelegram('b'.repeat(64), secret)).toBe(false);
  });

  it('rejects a prefix of the real secret', () => {
    expect(isFromTelegram(secret.slice(0, 32), secret)).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isFromTelegram('', secret)).toBe(false);
  });
});

describe('config', () => {
  it('names the missing variable and never a value', () => {
    expect(() => readTelegramConfig({})).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x' })).toThrow(
      /TELEGRAM_WEBHOOK_SECRET/,
    );
  });

  it('reads both when present', () => {
    const config = readTelegramConfig({
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_WEBHOOK_SECRET: 'secret',
    });
    expect(config.botToken).toBe('token');
    expect(config.webhookSecret).toBe('secret');
  });
});

describe('parseUpdate', () => {
  it('rejects a body with no update_id', () => {
    expect(parseUpdate({ message: {} })).toBeUndefined();
    expect(parseUpdate(null)).toBeUndefined();
    expect(parseUpdate('nope')).toBeUndefined();
  });

  it('reads a normal text message', () => {
    const update = parseUpdate({
      update_id: 7,
      message: { message_id: 1, chat: { id: 42, type: 'private' }, text: 'howzit' },
    });
    expect(update?.update_id).toBe(7);
    expect(update?.message?.chat.id).toBe(42);
    expect(update?.message?.text).toBe('howzit');
  });

  it('survives a message with no text', () => {
    const update = parseUpdate({
      update_id: 8,
      message: { message_id: 2, chat: { id: 42, type: 'private' } },
    });
    expect(update?.message?.text).toBeUndefined();
  });

  it('drops a malformed chat rather than inventing one', () => {
    const update = parseUpdate({ update_id: 9, message: { message_id: 3, chat: { id: 'x' } } });
    expect(update?.message).toBeUndefined();
  });
});

describe('update_id de-duplication', () => {
  it('claims an id once', () => {
    expect(claimUpdate(1)).toBe(true);
    expect(claimUpdate(1)).toBe(false);
    expect(claimUpdate(1)).toBe(false);
  });

  it('treats distinct ids independently', () => {
    expect(claimUpdate(1)).toBe(true);
    expect(claimUpdate(2)).toBe(true);
  });
});

describe('parseCommand', () => {
  it('reads a bare command', () => {
    expect(parseCommand('/start')).toBe('start');
  });

  it('strips the @botname suffix groups add', () => {
    expect(parseCommand('/help@momokasi_demo_bot')).toBe('help');
  });

  it('is undefined for ordinary text', () => {
    expect(parseCommand('what can you do')).toBeUndefined();
  });
});

function deps(agentReply: () => Promise<string>): {
  deps: HandleDeps;
  sent: string[];
} {
  const sent: string[] = [];
  return {
    sent,
    deps: {
      telegram: {
        sendMessage: async ({ text }) => void sent.push(text),
        sendChatAction: async () => undefined,
      },
      agent: { reply: agentReply },
    },
  };
}

const message = (text: string, chatId = 5, updateId = 1) => ({
  update_id: updateId,
  message: { message_id: 1, chat: { id: chatId, type: 'private' }, text },
});

describe('handleUpdate', () => {
  it('answers /start from a constant, without calling the model', async () => {
    const agent = vi.fn(async () => 'should not be called');
    const { deps: d, sent } = deps(agent);

    const outcome = await handleUpdate(d, message('/start'));

    expect(outcome).toEqual({ kind: 'replied', source: 'command' });
    expect(sent[0]).toBe(HELP_TEXT);
    expect(agent).not.toHaveBeenCalled();
  });

  it('sends an unknown command to the agent rather than an error', async () => {
    const { deps: d, sent } = deps(async () => 'Stokvels work like this.');
    const outcome = await handleUpdate(d, message('/stokvel'));

    expect(outcome).toEqual({ kind: 'replied', source: 'agent' });
    expect(sent[0]).toBe('Stokvels work like this.');
  });

  it('replies to ordinary text with the model', async () => {
    const { deps: d, sent } = deps(async () => 'Sawubona!');
    const outcome = await handleUpdate(d, message('howzit'));

    expect(outcome).toEqual({ kind: 'replied', source: 'agent' });
    expect(sent[0]).toBe('Sawubona!');
  });

  it('never leaves the user in silence when the model fails', async () => {
    const { deps: d, sent } = deps(async () => {
      throw new Error('429');
    });
    const outcome = await handleUpdate(d, message('howzit'));

    expect(outcome).toEqual({ kind: 'replied', source: 'fallback' });
    expect(sent[0]).toBe(FALLBACK_TEXT);
  });

  it('does not imply money moved when the model fails', async () => {
    // The user asked a question and got an apology. That apology must not read
    // as if a payment was attempted.
    expect(FALLBACK_TEXT).toMatch(/nothing to do with your money/i);
  });

  it('ignores a message with no text instead of guessing', async () => {
    const agent = vi.fn(async () => 'x');
    const { deps: d, sent } = deps(agent);

    const outcome = await handleUpdate(d, {
      update_id: 2,
      message: { message_id: 1, chat: { id: 5, type: 'private' } },
    });

    expect(outcome).toEqual({ kind: 'ignored', reason: 'no_text' });
    expect(sent).toHaveLength(0);
    expect(agent).not.toHaveBeenCalled();
  });

  it('carries conversation history into the next turn', async () => {
    const seen: unknown[] = [];
    const { deps: d } = deps(async () => 'ok');
    const spy: HandleDeps = {
      ...d,
      agent: {
        reply: async (history) => {
          seen.push([...history]);
          return 'ok';
        },
      },
    };

    await handleUpdate(spy, message('first', 9, 1));
    await handleUpdate(spy, message('second', 9, 2));

    // Turn two sees turn one's exchange, then the new message.
    expect(seen[1]).toEqual([
      { role: 'user', text: 'first' },
      { role: 'model', text: 'ok' },
      { role: 'user', text: 'second' },
    ]);
  });

  it('keeps separate chats separate', async () => {
    const seen: unknown[] = [];
    const spy: HandleDeps = {
      telegram: { sendMessage: async () => undefined, sendChatAction: async () => undefined },
      agent: {
        reply: async (history) => {
          seen.push([...history]);
          return 'ok';
        },
      },
    };

    await handleUpdate(spy, message('mine', 100, 1));
    await handleUpdate(spy, message('theirs', 200, 2));

    expect(seen[1]).toEqual([{ role: 'user', text: 'theirs' }]);
  });

  it('forgets the thread on /start', async () => {
    const seen: unknown[] = [];
    const spy: HandleDeps = {
      telegram: { sendMessage: async () => undefined, sendChatAction: async () => undefined },
      agent: {
        reply: async (history) => {
          seen.push([...history]);
          return 'ok';
        },
      },
    };

    await handleUpdate(spy, message('remember this', 7, 1));
    await handleUpdate(spy, message('/start', 7, 2));
    await handleUpdate(spy, message('what did I say', 7, 3));

    expect(seen[1]).toEqual([{ role: 'user', text: 'what did I say' }]);
  });
});

describe('outbound message limits', () => {
  it('leaves a normal reply untouched', () => {
    expect(truncateForTelegram('short')).toBe('short');
  });

  it('truncates at Telegram’s 4096 ceiling rather than being 400ed', () => {
    const out = truncateForTelegram('x'.repeat(5000));
    expect(out).toHaveLength(4096);
    expect(out.endsWith('…')).toBe(true);
  });
});
