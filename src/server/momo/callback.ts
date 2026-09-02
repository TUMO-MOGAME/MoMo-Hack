/**
 * Callback parsing (docs/03 §3.1, A5 §3).
 *
 * The callback body is UNTRUSTED INPUT THAT CAN ONLY TRIGGER A LOOKUP. Nothing
 * in this file returns a status, an amount or a payee — only a reference id,
 * which the caller then uses to ask MTN what actually happened.
 *
 * It lives here rather than in the route file because a Next.js route module
 * may only export the HTTP method handlers, and because untrusted-input parsing
 * deserves its own unit tests.
 */

import { isUuidV4 } from '@/lib/momo/client';

export const CALLBACK_KINDS = ['collection', 'disbursement', 'remittance'] as const;

export type CallbackKind = (typeof CALLBACK_KINDS)[number];

export function isCallbackKind(value: string): value is CallbackKind {
  return (CALLBACK_KINDS as readonly string[]).includes(value);
}

/**
 * Pull a reference id out of whatever MTN sends.
 *
 * The exact callback body shape is **[U]** (momoAPIs.md §14 — still on the
 * portal checklist). Rather than guess one field name and silently drop every
 * callback if we guessed wrong, we accept the plausible spellings and the query
 * string, and require each candidate to be a UUID v4.
 *
 * Being liberal here is safe precisely BECAUSE the value is only ever used as a
 * lookup key: a wrong id finds nothing and is logged. It could not be safe if
 * the body were allowed to set a status — which is exactly why it is not.
 */
export function extractReferenceId(body: unknown, url: URL): string | undefined {
  const candidates: unknown[] = [url.searchParams.get('referenceId') ?? undefined];

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    candidates.push(b.referenceId, b.reference_id, b.externalReferenceId, b.financialTransactionId);
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isUuidV4(candidate)) return candidate;
  }
  return undefined;
}

/**
 * A per-instance rate limit.
 *
 * Serverless instances are ephemeral and there are several, so this is a speed
 * bump rather than a wall — which is all it needs to be, because the route is
 * idempotent and reveals nothing. A shared limiter would mean hosted Redis, and
 * docs/10 rules out anything that needs a card.
 */
export const RATE_LIMIT_PER_MINUTE = 120;

export interface RateLimiter {
  (key: string, now?: number): boolean;
}

export function createRateLimiter(perMinute = RATE_LIMIT_PER_MINUTE): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (key, now = Date.now()) => {
    const window = windows.get(key);
    if (!window || window.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    window.count++;
    return window.count > perMinute;
  };
}
