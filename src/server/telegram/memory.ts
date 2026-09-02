/**
 * Two pieces of per-instance state: update de-duplication, and a short
 * conversation history.
 *
 * BOTH ARE IN-MEMORY, AND THAT IS A REAL LIMITATION — worth stating plainly
 * rather than discovering in a demo.
 *
 * A Vercel function is not a server. Instances start, stay warm for a few
 * minutes of traffic, and disappear; two updates can land on two instances that
 * share nothing. So:
 *
 *   - DE-DUPLICATION is best-effort. It reliably catches the case it exists for
 *     — Telegram retrying an update because our response was slow, which hits a
 *     warm instance seconds later. It cannot catch a retry that lands on a cold
 *     one. The cost of a miss is one duplicated reply, not a duplicated payment:
 *     nothing in this path writes to the ledger. When the outbox lands (M5c)
 *     this moves to a `telegram_update` table with `update_id` as the primary
 *     key, and becomes exact.
 *
 *   - HISTORY is best-effort for the same reason, and the failure mode is the
 *     bot forgetting the last thing you said. Acceptable for a conversation;
 *     it would not be acceptable for anything that moved money, and nothing
 *     here does.
 *
 * `docs/11` §6 says "processed idempotently by `update_id`". This is that,
 * honestly scoped to what a stateless runtime can promise.
 */

/** Enough to cover a Telegram retry window without growing without bound. */
const MAX_SEEN = 500;
const MAX_TURNS = 8;
const HISTORY_TTL_MS = 30 * 60 * 1000;

const seen = new Set<number>();

/**
 * True the first time an `update_id` is offered, false every time after.
 *
 * Insertion-ordered `Set`, trimmed from the front — the oldest update is the
 * one least likely to still be retried.
 */
export function claimUpdate(updateId: number): boolean {
  if (seen.has(updateId)) return false;

  seen.add(updateId);
  while (seen.size > MAX_SEEN) {
    const oldest = seen.values().next();
    if (oldest.done) break;
    seen.delete(oldest.value);
  }
  return true;
}

export interface Turn {
  readonly role: 'user' | 'model';
  readonly text: string;
}

interface Thread {
  turns: Turn[];
  touchedAt: number;
}

const threads = new Map<number, Thread>();

function fresh(thread: Thread | undefined, now: number): Thread | undefined {
  if (!thread) return undefined;
  return now - thread.touchedAt > HISTORY_TTL_MS ? undefined : thread;
}

export function readHistory(chatId: number, now: number = Date.now()): readonly Turn[] {
  return fresh(threads.get(chatId), now)?.turns ?? [];
}

/**
 * Append a completed exchange. Keeps the last `MAX_TURNS` messages — a phone
 * conversation that has moved on eight messages is not helped by turn one, and
 * every retained turn is tokens on the next request.
 */
export function appendTurn(
  chatId: number,
  user: string,
  model: string,
  now: number = Date.now(),
): void {
  const thread = fresh(threads.get(chatId), now) ?? { turns: [], touchedAt: now };

  const exchange: Turn[] = [
    { role: 'user', text: user },
    { role: 'model', text: model },
  ];
  thread.turns = [...thread.turns, ...exchange].slice(-MAX_TURNS);
  thread.touchedAt = now;

  threads.set(chatId, thread);
}

/** `/start` begins a new conversation, not a continuation of an old one. */
export function resetThread(chatId: number): void {
  threads.delete(chatId);
}

/** Tests only — module state outlives a single `it()` otherwise. */
export function __resetAll(): void {
  seen.clear();
  threads.clear();
}
