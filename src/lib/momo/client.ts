/**
 * The MoMo HTTP transport (docs/03 §1) — auth, token refresh, timeouts and
 * error mapping. The product APIs (`collections.ts`) sit on top of it.
 *
 * Hard rules for this file:
 *   - it NEVER touches the database — it returns values, callers persist them
 *   - it NEVER throws raw — every failure is a `MomoRequestError` (an AppError)
 *   - it NEVER retries a money-moving call. One attempt, then hand off to the
 *     reconciler. The only retry here is the single re-attempt after a 401
 *     token refresh, which is idempotent by construction because the SAME
 *     `X-Reference-Id` is resent.
 *
 * The 10s Vercel Hobby cap forces this shape, and it is the correct design
 * anyway: retrying a payment inside a request that may itself be retried by the
 * client is how systems double-charge people.
 */

import { type EnvBag, type MomoConfig, readMomoConfig } from './config';
import { MomoRequestError, upstream } from './errors';
import { type TokenCache, basicAuthHeader, tokenCache as defaultTokenCache } from './token';
import type { MomoProduct, TokenResponse } from './types';

export interface CreateClientOptions {
  /** Defaults to `process.env`, read per call (docs/03 §5). */
  readonly env?: EnvBag;
  /** Injectable for contract tests. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable so tests never share the process-wide cache. */
  readonly cache?: TokenCache;
}

/** What a product API needs, and nothing more. */
export interface MomoTransport {
  /** Config read FRESH from the environment on every call. */
  config(): MomoConfig;
  /** One authenticated call, with exactly one retry, and only on a 401. */
  send(
    product: MomoProduct,
    url: string,
    init: RequestInit & { headers: Record<string, string> },
  ): Promise<Response>;
  /** Force a token fetch. Exposed for the health check and the token tests. */
  fetchToken(product: MomoProduct): Promise<string>;
  /** Body text, never throwing, so a failed read cannot mask the real error. */
  text(response: Response): Promise<string>;
  /** JSON parse that raises MALFORMED rather than a raw SyntaxError. */
  json<T>(response: Response): Promise<T>;
}

/** momoAPIs.md §6 — a reference id that is not a UUID **v4** is rejected with 400. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

/** Truncated, so a 2MB HTML error page from a proxy never reaches a log line. */
export function snippet(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/**
 * docs/03 §1.2, in one function.
 *
 * 401 is absent on purpose: it is handled by the refresh-and-retry-once path in
 * `send()` and only reaches here after that retry has already failed.
 */
export function classify(status: number): { retryable: boolean } {
  return { retryable: status === 429 || status >= 500 };
}

function isAbort(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name = (e as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

export function createTransport(options: CreateClientOptions = {}): MomoTransport {
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const cache = options.cache ?? defaultTokenCache;

  const config = (): MomoConfig => readMomoConfig(options.env);

  function subscriptionKey(cfg: MomoConfig, product: MomoProduct): string {
    const key = cfg.subscriptionKeys[product];
    if (!key) {
      // The KEY NAME is safe to surface. The value never is.
      throw new MomoRequestError('HTTP', {
        kind: 'VALIDATION',
        field: `MOMO_${product.toUpperCase()}_SUBSCRIPTION_KEY`,
        message: 'no subscription key configured for this product',
      });
    }
    return key;
  }

  async function rawFetch(cfg: MomoConfig, url: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(url, { ...init, signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (e) {
      if (isAbort(e)) {
        // NOT a failure of the payment. The request may well have landed
        // upstream, so this becomes PENDING, never FAILED (docs/03 §1.3).
        throw new MomoRequestError('TIMEOUT', upstream(408, true), 'request timed out');
      }
      throw new MomoRequestError('NETWORK', upstream(undefined, true), 'network error');
    }
  }

  async function text(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  async function json<T>(response: Response): Promise<T> {
    const body = await text(response);
    try {
      return JSON.parse(body) as T;
    } catch {
      // A garbled body is more likely a proxy hiccup than a permanent contract
      // change, and the reconciler is idempotent, so re-polling is free.
      throw new MomoRequestError('MALFORMED', upstream(response.status, true), snippet(body));
    }
  }

  /**
   * `POST /{product}/token/` (momoAPIs.md §5).
   *
   * Note the TRAILING SLASH. Omitting it has been reported to 404 — rated **[P]**
   * in momoAPIs.md, which is why it is written exactly once, here.
   */
  async function fetchToken(product: MomoProduct): Promise<string> {
    const cfg = config();
    const response = await rawFetch(cfg, `${cfg.baseUrl}/${product}/token/`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(cfg.apiUser, cfg.apiKey),
        'Ocp-Apim-Subscription-Key': subscriptionKey(cfg, product),
        'X-Target-Environment': cfg.targetEnvironment,
      },
    });

    if (!response.ok) {
      throw new MomoRequestError(
        'HTTP',
        upstream(response.status, classify(response.status).retryable),
        snippet(await text(response)),
      );
    }

    const parsed = await json<TokenResponse>(response);
    if (typeof parsed.access_token !== 'string' || typeof parsed.expires_in !== 'number') {
      throw new MomoRequestError('MALFORMED', upstream(response.status, true), 'token body');
    }
    cache.set(product, parsed);
    return parsed.access_token;
  }

  async function token(product: MomoProduct): Promise<string> {
    return cache.get(product) ?? (await fetchToken(product));
  }

  async function send(
    product: MomoProduct,
    url: string,
    init: RequestInit & { headers: Record<string, string> },
  ): Promise<Response> {
    const cfg = config();

    const attempt = async (bearer: string): Promise<Response> =>
      rawFetch(cfg, url, {
        ...init,
        headers: {
          ...init.headers,
          // The literal word `Bearer` is required; omitting it is a 401
          // (momoAPIs.md §6).
          Authorization: `Bearer ${bearer}`,
          'Ocp-Apim-Subscription-Key': subscriptionKey(cfg, product),
          'X-Target-Environment': cfg.targetEnvironment,
        },
      });

    const response = await attempt(await token(product));
    if (response.status !== 401) return response;

    // Refresh the token and retry EXACTLY ONCE (docs/03 §1.2). The retry
    // resends the same X-Reference-Id, so if the first attempt did land, MTN
    // dedupes it into a 409 — which we read as success. No path here mints a
    // new id.
    cache.invalidate(product);
    return attempt(await fetchToken(product));
  }

  return { config, send, fetchToken, text, json };
}

/**
 * momoAPIs.md §6, the documented ways to get a rejection for free: a non-v4
 * uuid (400), and an id equal to the apiUser (rejected outright). A REUSED id
 * gives 409, which we deliberately treat as success rather than guard against.
 */
export function assertReferenceId(cfg: MomoConfig, referenceId: string): void {
  if (!isUuidV4(referenceId)) {
    throw new MomoRequestError('HTTP', {
      kind: 'VALIDATION',
      field: 'referenceId',
      message: 'X-Reference-Id must be a UUID v4',
    });
  }
  if (referenceId.toLowerCase() === cfg.apiUser.toLowerCase()) {
    throw new MomoRequestError('HTTP', {
      kind: 'VALIDATION',
      field: 'referenceId',
      message: 'X-Reference-Id must not equal the apiUser id',
    });
  }
}

/** momoAPIs.md §6 — an `externalId` containing spaces is rejected. */
export function assertExternalId(externalId: string): void {
  if (!externalId || /\s/.test(externalId)) {
    throw new MomoRequestError('HTTP', {
      kind: 'VALIDATION',
      field: 'externalId',
      message: 'externalId must be non-empty and contain no whitespace',
    });
  }
}
