/**
 * The `token/` contract row (docs/04 §6) and the cache policy (momoAPIs.md §5).
 *
 * | Endpoint | 200 | 400 | 401 | 429 | 500 | timeout | malformed |
 * | token/   |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |    ✓    |     ✓     |
 */

import { describe, expect, test } from 'vitest';
import { createTransport } from '@/lib/momo/client';
import { createTokenCache, TOKEN_TTL_SAFETY, basicAuthHeader } from '@/lib/momo/token';
import { isMomoRequestError } from '@/lib/momo/errors';
import { TEST_ENV, empty, json, malformed, stubFetch, timeoutError, tokenOk } from './_helpers';

function transport(options: Parameters<typeof stubFetch>[0]) {
  const stub = stubFetch(options);
  const cache = createTokenCache();
  return {
    transport: createTransport({ env: TEST_ENV, fetchImpl: stub.fetchImpl, cache }),
    recorder: stub.recorder,
    cache,
  };
}

describe('token endpoint', () => {
  test('200 returns the access token and caches it', async () => {
    const { transport: t, recorder } = transport({ token: [tokenOk()] });

    expect(await t.fetchToken('collection')).toBe('test.access.token');
    expect(recorder.tokenCalls()).toBe(1);
  });

  test('the URL has the trailing slash (momoAPIs.md §5 — omitting it 404s)', async () => {
    const { transport: t, recorder } = transport({ token: [tokenOk()] });

    await t.fetchToken('collection');

    expect(recorder.calls[0]?.url).toBe('https://sandbox.momodeveloper.mtn.com/collection/token/');
    expect(recorder.calls[0]?.method).toBe('POST');
  });

  test('authenticates with Basic base64(apiUser:apiKey) and the product key', async () => {
    const { transport: t, recorder } = transport({ token: [tokenOk()] });

    await t.fetchToken('collection');

    const call = recorder.calls[0];
    expect(call?.headers.Authorization).toBe(
      basicAuthHeader('11111111-1111-4111-8111-111111111111', 'not-a-real-key'),
    );
    expect(call?.headers['Ocp-Apim-Subscription-Key']).toBe('not-a-real-subscription-key');
    expect(call?.headers['X-Target-Environment']).toBe('sandbox');
  });

  test.each([
    [400, false],
    [401, false],
    [429, true],
    [500, true],
  ])('%i maps to UPSTREAM retryable=%s', async (status, retryable) => {
    const { transport: t } = transport({ token: [empty(status)] });

    await expect(t.fetchToken('collection')).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', provider: 'momo', retryable, status },
    });
  });

  test('a timeout is TIMEOUT', async () => {
    const { transport: t } = transport({ token: [timeoutError()] });

    const caught = await t.fetchToken('collection').catch((e: unknown) => e);
    expect(isMomoRequestError(caught) && caught.failure).toBe('TIMEOUT');
  });

  test('malformed JSON is MALFORMED, not a crash', async () => {
    const { transport: t } = transport({ token: [malformed(200)] });

    const caught = await t.fetchToken('collection').catch((e: unknown) => e);
    expect(isMomoRequestError(caught) && caught.failure).toBe('MALFORMED');
  });

  test('a 200 missing access_token is MALFORMED, never treated as a token', async () => {
    const { transport: t } = transport({ token: [json(200, { token_type: 'access_token' })] });

    const caught = await t.fetchToken('collection').catch((e: unknown) => e);
    expect(isMomoRequestError(caught) && caught.failure).toBe('MALFORMED');
  });

  test('a missing subscription key fails as VALIDATION, naming only the KEY', async () => {
    const stub = stubFetch({ token: [tokenOk()] });
    const t = createTransport({
      env: { ...TEST_ENV, MOMO_COLLECTION_SUBSCRIPTION_KEY: undefined },
      fetchImpl: stub.fetchImpl,
      cache: createTokenCache(),
    });

    await expect(t.fetchToken('collection')).rejects.toMatchObject({
      error: { kind: 'VALIDATION', field: 'MOMO_COLLECTION_SUBSCRIPTION_KEY' },
    });
  });
});

describe('token cache', () => {
  test('refreshes at 80% of expires_in, not at 100%', () => {
    let clock = 1_000_000;
    const cache = createTokenCache(() => clock);

    cache.set('collection', { access_token: 'a', token_type: 'access_token', expires_in: 3600 });

    // 3600s * 0.8 = 2880s = 48 minutes.
    expect(cache.expiresAt('collection')).toBe(1_000_000 + 3600 * 1000 * TOKEN_TTL_SAFETY);

    clock += 2879 * 1000;
    expect(cache.get('collection')).toBe('a');

    clock += 2 * 1000;
    expect(cache.get('collection')).toBeUndefined();
  });

  test('caches per product — three subscriptions, three caches', () => {
    const cache = createTokenCache();

    cache.set('collection', { access_token: 'c', token_type: 'access_token', expires_in: 3600 });

    expect(cache.get('collection')).toBe('c');
    expect(cache.get('disbursement')).toBeUndefined();
    expect(cache.get('remittance')).toBeUndefined();
  });

  test('a non-positive expires_in is never cached', () => {
    const cache = createTokenCache();

    cache.set('collection', { access_token: 'c', token_type: 'access_token', expires_in: 0 });
    cache.set('remittance', { access_token: 'r', token_type: 'access_token', expires_in: -1 });

    expect(cache.get('collection')).toBeUndefined();
    expect(cache.get('remittance')).toBeUndefined();
  });

  test('a cached token means no second token call', async () => {
    const { transport: t, recorder } = transport({
      token: [tokenOk()],
      api: [empty(202), empty(202)],
    });

    await t.send('collection', 'https://sandbox.momodeveloper.mtn.com/x', { headers: {} });
    await t.send('collection', 'https://sandbox.momodeveloper.mtn.com/x', { headers: {} });

    expect(recorder.tokenCalls()).toBe(1);
    expect(recorder.apiCalls()).toBe(2);
  });

  test('invalidate forces a fresh fetch', async () => {
    const {
      transport: t,
      recorder,
      cache,
    } = transport({
      token: [tokenOk(), tokenOk()],
      api: [empty(202), empty(202)],
    });

    await t.send('collection', 'https://sandbox.momodeveloper.mtn.com/x', { headers: {} });
    cache.invalidate('collection');
    await t.send('collection', 'https://sandbox.momodeveloper.mtn.com/x', { headers: {} });

    expect(recorder.tokenCalls()).toBe(2);
  });
});
