/**
 * Per-product access-token cache (momoAPIs.md §5, docs/03 §1.1).
 *
 * Three subscriptions means THREE token caches. Confusing them is the most
 * common cause of 401 in this API.
 *
 * Refresh at 80% of `expires_in` (48 minutes of a 3600s token), and refresh
 * eagerly on a 401 before retrying once. Never refresh on every request — the
 * sandbox rate-limits and it wastes our 10s function budget.
 *
 * SERVERLESS CAVEAT, stated so nobody is surprised: Vercel functions are
 * ephemeral, so this cache is per-instance and often cold. That is acceptable —
 * a token call is ~300ms against a 10s budget. We deliberately do NOT put
 * tokens in the database: a shared mutable secret with no locking is worse than
 * a duplicated fetch.
 */

import type { MomoProduct, TokenResponse } from './types';

/** Refresh at 80% of the advertised lifetime. */
export const TOKEN_TTL_SAFETY = 0.8;

interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
}

export interface TokenCache {
  /** The cached token for a product, or undefined if absent or stale. */
  get(product: MomoProduct): string | undefined;
  set(product: MomoProduct, response: TokenResponse): void;
  /** Drop a product's token. Called on a 401 before the single retry. */
  invalidate(product: MomoProduct): void;
  clear(): void;
  /** Test seam: when the cached token expires, epoch ms. */
  expiresAt(product: MomoProduct): number | undefined;
}

export function createTokenCache(now: () => number = Date.now): TokenCache {
  const cache = new Map<MomoProduct, CachedToken>();

  return {
    get(product) {
      const cached = cache.get(product);
      if (!cached) return undefined;
      if (cached.expiresAt <= now()) {
        cache.delete(product);
        return undefined;
      }
      return cached.token;
    },

    set(product, response) {
      // `expires_in` is seconds. A hostile or broken value must not produce a
      // token we treat as valid forever, so anything non-positive is treated as
      // already expired and simply not cached.
      const lifetimeMs = Math.floor(response.expires_in * 1000 * TOKEN_TTL_SAFETY);
      if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) return;
      cache.set(product, { token: response.access_token, expiresAt: now() + lifetimeMs });
    },

    invalidate(product) {
      cache.delete(product);
    },

    clear() {
      cache.clear();
    },

    expiresAt(product) {
      return cache.get(product)?.expiresAt;
    },
  };
}

/**
 * The process-wide cache. One per serverless instance, which is exactly the
 * scope we want — see the caveat at the top.
 */
export const tokenCache = createTokenCache();

/** `Authorization: Basic base64(apiUser:apiKey)` (momoAPIs.md §5). */
export function basicAuthHeader(apiUser: string, apiKey: string): string {
  const encoded = Buffer.from(`${apiUser}:${apiKey}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}
