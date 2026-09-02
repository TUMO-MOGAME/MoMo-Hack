/**
 * Contract-test scaffolding (docs/04 §6).
 *
 * We do not control MoMo, so these tests assert that WE behave correctly
 * against every response shape we claim to handle. `fetch` is stubbed rather
 * than mocked at the module level, so the real client code — headers, token
 * refresh, timeout mapping — runs end to end.
 *
 * Not a `.test.ts` file, so vitest does not collect it.
 */

import { createTokenCache } from '@/lib/momo/token';
import { createSandboxClient } from '@/lib/momo';
import type { EnvBag } from '@/lib/momo/config';

/**
 * A sandbox-shaped environment. The api user is a real UUID v4 so the
 * "reference id must not equal the apiUser" guard can actually be exercised.
 */
export const TEST_ENV: EnvBag = {
  MOMO_MODE: 'sandbox',
  MOMO_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
  MOMO_TARGET_ENVIRONMENT: 'sandbox',
  MOMO_API_USER: '11111111-1111-4111-8111-111111111111',
  MOMO_API_KEY: 'not-a-real-key',
  MOMO_COLLECTION_SUBSCRIPTION_KEY: 'not-a-real-subscription-key',
  MOMO_CALLBACK_HOST: 'momo-hack.vercel.app',
};

export const REFERENCE_ID = '3f2a9c1e-7b54-4d2a-9e18-0c6d5b4a3e21';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function empty(status: number): Response {
  return new Response(null, { status });
}

export function malformed(status = 200): Response {
  return new Response('{"status": "SUCCESS', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** What our own `AbortSignal.timeout` throws when the 6s budget is spent. */
export function timeoutError(): Error {
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  return e;
}

export function networkError(): Error {
  return new TypeError('fetch failed');
}

export interface Recorder {
  readonly calls: { url: string; method: string; headers: Record<string, string> }[];
  tokenCalls(): number;
  apiCalls(): number;
  lastBody(): unknown;
}

export interface StubOptions {
  /** Responses for the token endpoint, consumed in order. Last one repeats. */
  readonly token?: (Response | Error)[];
  /** Responses for everything else, consumed in order. Last one repeats. */
  readonly api?: (Response | Error)[];
}

export interface Stub {
  readonly fetchImpl: typeof fetch;
  readonly recorder: Recorder;
}

function take(queue: (Response | Error)[] | undefined, index: number): Response | Error {
  if (!queue || queue.length === 0) return empty(500);
  return queue[Math.min(index, queue.length - 1)] as Response | Error;
}

export function stubFetch(options: StubOptions): Stub {
  const calls: Recorder['calls'] = [];
  let tokenIndex = 0;
  let apiIndex = 0;
  let lastBody: unknown;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? 'GET', headers });

    if (typeof init?.body === 'string') {
      try {
        lastBody = JSON.parse(init.body);
      } catch {
        lastBody = init.body;
      }
    }

    const isToken = url.endsWith('/token/');
    const next = isToken ? take(options.token, tokenIndex++) : take(options.api, apiIndex++);

    if (next instanceof Error) throw next;
    // A Response body can only be read once; clone so a repeated queue entry
    // can serve more than one call.
    return next.clone();
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    recorder: {
      calls,
      tokenCalls: () => calls.filter((c) => c.url.endsWith('/token/')).length,
      apiCalls: () => calls.filter((c) => !c.url.endsWith('/token/')).length,
      lastBody: () => lastBody,
    },
  };
}

export function tokenOk(expiresIn = 3600): Response {
  return json(200, {
    access_token: 'test.access.token',
    token_type: 'access_token',
    expires_in: expiresIn,
  });
}

/** A client with an isolated token cache, so tests never leak state into each other. */
export function testClient(options: StubOptions) {
  const stub = stubFetch(options);
  const client = createSandboxClient({
    env: TEST_ENV,
    fetchImpl: stub.fetchImpl,
    cache: createTokenCache(),
  });
  return { client, recorder: stub.recorder };
}
