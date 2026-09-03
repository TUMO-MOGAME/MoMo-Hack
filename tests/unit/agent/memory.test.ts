import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  __resetAll,
  appendTurn,
  claimUpdate,
  readHistory,
  resetThread,
} from '@/server/telegram/memory';
import { handleUpdate } from '@/server/telegram/handle';

/**
 * The bot's short conversation memory — untested until now, on a module that
 * decides whether the product can hold a conversation at all.
 *
 * Two things are asserted here and they are different claims:
 *
 *   1. The STORE behaves — it keeps turns, isolates chats, expires, and caps.
 *   2. The WIRING passes it — `handleUpdate` actually hands the stored turns to
 *      the agent on the next message. A perfect store that nobody reads is the
 *      failure this product would ship without noticing, because the bot still
 *      replies; it just replies as a stranger every time.
 *
 * What no test here can show is whether the MODEL uses the history well. That
 * is fluency, not plumbing, and it is checked by talking to the bot.
 */

const CHAT = 6083941772;

function update(text: string, chatId = CHAT, updateId = Math.floor(Math.random() * 1e9)) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, is_bot: false, first_name: 'Tumo' },
      text,
    },
  };
}

type Turn = { role: string; text: string };

function wire() {
  // The parameter is DECLARED rather than inferred. `vi.fn(async () => ...)`
  // types its calls as a zero-length tuple, so `calls[0][0]` — the whole point
  // of these assertions — is a type error rather than a history array.
  const reply = vi.fn(async (_history: readonly Turn[]) => 'agent answered');
  return {
    reply,
    deps: {
      telegram: {
        sendMessage: vi.fn(async () => undefined as never),
        sendChatAction: vi.fn(async () => undefined as never),
      },
      agent: { reply },
      money: { allowlist: new Set<number>(), pay: vi.fn(), status: vi.fn() },
    },
  };
}

beforeEach(() => {
  __resetAll();
});

describe('the conversation store', () => {
  test('a fresh chat has no history, rather than someone else’s', () => {
    expect(readHistory(CHAT)).toEqual([]);
  });

  test('keeps what was said, in order', () => {
    appendTurn(CHAT, 'my grandmother is Gogo', 'Sharp, noted.');
    appendTurn(CHAT, 'where does she live?', 'You have not told me that.');

    const history = readHistory(CHAT);
    expect(history.map((t) => t.text)).toEqual([
      'my grandmother is Gogo',
      'Sharp, noted.',
      'where does she live?',
      'You have not told me that.',
    ]);
    // `model`, not `agent` — the roles are Gemini's, because this array is
    // handed to the model as its `contents`. Naming them anything else here
    // would mean a translation step, and a translation step is a place for the
    // two halves of a conversation to swap over.
    expect(history.map((t) => t.role)).toEqual(['user', 'model', 'user', 'model']);
  });

  test('one chat cannot read another chat’s conversation', () => {
    // The bot is PUBLIC. A shared history would leak one person's messages —
    // and the amounts in them — into a stranger's thread.
    appendTurn(CHAT, 'my secret', 'noted');
    expect(readHistory(CHAT)).toHaveLength(2);
    expect(readHistory(CHAT + 1)).toEqual([]);
  });

  test('/start wipes the thread', () => {
    appendTurn(CHAT, 'something', 'noted');
    resetThread(CHAT);
    expect(readHistory(CHAT)).toEqual([]);
  });

  test('forgets a conversation that has gone cold', () => {
    // The TTL is 30 minutes. `readHistory` takes `now` precisely so this is
    // testable without waiting or faking a clock globally.
    appendTurn(CHAT, 'this morning', 'noted');
    const later = Date.now() + 31 * 60 * 1000;
    expect(readHistory(CHAT, later)).toEqual([]);
    expect(readHistory(CHAT)).not.toEqual([]);
  });

  test('caps the thread instead of growing without bound', () => {
    // A long-running chat must not accumulate forever in a warm instance's
    // memory — and the turns that get dropped must be the OLDEST.
    for (let i = 0; i < 40; i += 1) appendTurn(CHAT, `user ${i}`, `agent ${i}`);

    const history = readHistory(CHAT);
    expect(history.length).toBeLessThanOrEqual(16);
    expect(history.at(-1)?.text).toBe('agent 39');
    expect(history.some((t) => t.text === 'user 0')).toBe(false);
  });
});

describe('de-duplication', () => {
  test('an update_id is claimed once and refused after', () => {
    // Telegram retries when we are slow. Without this the bot answers the same
    // message twice and argues with itself in front of a judge.
    expect(claimUpdate(4242)).toBe(true);
    expect(claimUpdate(4242)).toBe(false);
  });

  test('different updates are all claimable', () => {
    expect(claimUpdate(1)).toBe(true);
    expect(claimUpdate(2)).toBe(true);
  });
});

describe('the wiring — the store is actually handed to the agent', () => {
  test('the FIRST message arrives with no history', async () => {
    const w = wire();

    await handleUpdate(w.deps as never, update('sawubona') as never);

    expect(w.reply).toHaveBeenCalledTimes(1);
    const history = w.reply.mock.calls[0]![0];
    expect(history.map((t) => t.text)).toEqual(['sawubona']);
  });

  test('the SECOND message carries the first exchange with it', async () => {
    // This is the claim that matters, and the one that would fail silently:
    // drop `readHistory` from the call and the bot still answers every message
    // perfectly well — as a stranger, every time.
    const w = wire();

    await handleUpdate(w.deps as never, update('my grandmother is Gogo') as never);
    await handleUpdate(w.deps as never, update('where does she live?') as never);

    expect(w.reply).toHaveBeenCalledTimes(2);
    const second = w.reply.mock.calls[1]![0];
    expect(second.map((t) => t.text)).toEqual([
      'my grandmother is Gogo',
      'agent answered',
      'where does she live?',
    ]);
  });

  test('a second chat’s message does not carry the first chat’s history', async () => {
    const w = wire();

    await handleUpdate(w.deps as never, update('my secret', CHAT) as never);
    await handleUpdate(w.deps as never, update('hello', CHAT + 1) as never);

    const second = w.reply.mock.calls[1]![0];
    expect(second.map((t) => t.text)).toEqual(['hello']);
  });

  test('/start clears the thread through the real handler', async () => {
    const w = wire();

    await handleUpdate(w.deps as never, update('my grandmother is Gogo') as never);
    await handleUpdate(w.deps as never, update('/start') as never);
    await handleUpdate(w.deps as never, update('who is she?') as never);

    const last = w.reply.mock.calls.at(-1)![0];
    expect(last.map((t) => t.text)).toEqual(['who is she?']);
  });
});
