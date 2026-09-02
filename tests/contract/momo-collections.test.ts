/**
 * The Collections contract matrix (docs/04 §6).
 *
 * | Endpoint            | 202 | SUCCESSFUL | FAILED | PENDING | 400 | 401 | 409 | 429 | 500 | timeout | malformed |
 * | requesttopay        |  ✓  |     —      |   —    |    —    |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |    ✓    |     ✓     |
 * | requesttopay/{id}   |  —  |     ✓      |   ✓    |    ✓    |  ✓  |  ✓  |  —  |  ✓  |  ✓  |    ✓    |     ✓     |
 *
 * Every row is a test, and the specific behaviours docs/04 §6 calls out are
 * asserted by name at the bottom.
 *
 * MSISDNs come only from `src/lib/momo/test-msisdns.ts`. Any other number
 * ALWAYS returns SUCCESSFUL in the sandbox, so a test using a made-up number is
 * a test that cannot fail (momoAPIs.md §10).
 */

import { describe, expect, test } from 'vitest';
import { TEST_MSISDN } from '@/lib/momo/test-msisdns';
import { isMomoRequestError, eventForSendFailure } from '@/lib/momo/errors';
import {
  REFERENCE_ID,
  empty,
  json,
  malformed,
  networkError,
  testClient,
  timeoutError,
  tokenOk,
} from './_helpers';

const INPUT = {
  amountMinor: 1250n,
  msisdn: TEST_MSISDN.ASYNC_SUCCESS,
  externalId: 'fare-8842',
  payerMessage: 'MoMo Kasi taxi fare',
  payeeNote: 'Rank 42 fare',
};

function statusBody(status: string): Record<string, unknown> {
  return {
    financialTransactionId: '1432942836',
    externalId: 'fare-8842',
    amount: '12.50',
    currency: 'EUR',
    payer: { partyIdType: 'MSISDN', partyId: TEST_MSISDN.ASYNC_SUCCESS },
    payerMessage: 'MoMo Kasi taxi fare',
    payeeNote: 'Rank 42 fare',
    status,
  };
}

describe('requestToPay', () => {
  test('202 Accepted -> ACCEPTED', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(202)] });

    const result = await client.collections.requestToPay(REFERENCE_ID, INPUT);

    expect(result).toEqual({ outcome: 'ACCEPTED', referenceId: REFERENCE_ID });
    expect(recorder.apiCalls()).toBe(1);
  });

  test('sends the persisted reference id as X-Reference-Id, verbatim', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(202)] });

    await client.collections.requestToPay(REFERENCE_ID, INPUT);

    const call = recorder.calls.find((c) => c.url.includes('requesttopay'));
    expect(call?.headers['X-Reference-Id']).toBe(REFERENCE_ID);
    expect(call?.headers.Authorization).toBe('Bearer test.access.token');
    expect(call?.headers['X-Target-Environment']).toBe('sandbox');
    expect(call?.headers['X-Callback-Url']).toBe(
      'https://momo-hack.vercel.app/api/momo/callback/collection',
    );
  });

  test('the body is the documented shape, with a decimal STRING amount', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(202)] });

    await client.collections.requestToPay(REFERENCE_ID, INPUT);

    expect(recorder.lastBody()).toEqual({
      amount: '12.50',
      currency: 'EUR',
      externalId: 'fare-8842',
      payer: { partyIdType: 'MSISDN', partyId: TEST_MSISDN.ASYNC_SUCCESS },
      payerMessage: 'MoMo Kasi taxi fare',
      payeeNote: 'Rank 42 fare',
    });
  });

  test('409 Conflict is SUCCESS, not a failure', async () => {
    // docs/03 §1.2 — MTN already has this reference id. The transaction exists
    // upstream. Never retry with a new id; that is the double-pay bug.
    const { client } = testClient({ token: [tokenOk()], api: [empty(409)] });

    const result = await client.collections.requestToPay(REFERENCE_ID, INPUT);

    expect(result.outcome).toBe('ALREADY_ACCEPTED');
    expect(result.referenceId).toBe(REFERENCE_ID);
  });

  test('400 is UPSTREAM, non-retryable', async () => {
    const { client } = testClient({
      token: [tokenOk()],
      api: [json(400, { message: 'bad request' })],
    });

    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', provider: 'momo', retryable: false, status: 400 },
    });
  });

  test('401 refreshes the token and retries EXACTLY once', async () => {
    const { client, recorder } = testClient({
      token: [tokenOk(), tokenOk()],
      api: [empty(401), empty(202)],
    });

    const result = await client.collections.requestToPay(REFERENCE_ID, INPUT);

    expect(result.outcome).toBe('ACCEPTED');
    expect(recorder.tokenCalls()).toBe(2);
    expect(recorder.apiCalls()).toBe(2);
  });

  test('a second 401 fails, and does NOT try a third time', async () => {
    const { client, recorder } = testClient({
      token: [tokenOk(), tokenOk()],
      api: [empty(401), empty(401)],
    });

    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', retryable: false, status: 401 },
    });
    expect(recorder.apiCalls()).toBe(2);
  });

  test('429 is UPSTREAM, retryable, and is NOT retried in-request', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(429)] });

    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', retryable: true, status: 429 },
    });
    // One attempt. The reconciler picks it up; we do not burn the 10s budget.
    expect(recorder.apiCalls()).toBe(1);
  });

  test('500 is UPSTREAM, retryable, one attempt', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(500)] });

    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', retryable: true, status: 500 },
    });
    expect(recorder.apiCalls()).toBe(1);
  });

  test('a timeout becomes SEND_TIMEOUT -> PENDING, never FAILED', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [timeoutError()] });

    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toSatisfy(
      (e: unknown) => isMomoRequestError(e) && e.failure === 'TIMEOUT',
    );

    const caught = await client.collections
      .requestToPay(REFERENCE_ID, INPUT)
      .catch((e: unknown) => e);
    expect(eventForSendFailure(caught)).toEqual({ type: 'SEND_TIMEOUT' });
  });

  test('a network error is retryable and leaves the row recoverable', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [networkError()] });

    const caught = await client.collections
      .requestToPay(REFERENCE_ID, INPUT)
      .catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.failure).toBe('NETWORK');
    expect(eventForSendFailure(caught)).toEqual({ type: 'SEND_RETRYABLE' });
  });

  test('malformed JSON in an error body does not crash the route', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [malformed(500)] });

    // The body is unreadable but the STATUS still classifies it correctly.
    await expect(client.collections.requestToPay(REFERENCE_ID, INPUT)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', retryable: true, status: 500 },
    });
  });

  test('a reference id that is not a UUID v4 is refused before it is sent', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(202)] });

    await expect(client.collections.requestToPay('not-a-uuid', INPUT)).rejects.toMatchObject({
      error: { kind: 'VALIDATION', field: 'referenceId' },
    });
    expect(recorder.calls).toHaveLength(0);
  });

  test('a reference id equal to the apiUser is refused', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [empty(202)] });

    await expect(
      client.collections.requestToPay('11111111-1111-4111-8111-111111111111', INPUT),
    ).rejects.toMatchObject({ error: { kind: 'VALIDATION', field: 'referenceId' } });
  });

  test('an externalId containing a space is refused before it is sent', async () => {
    const { client, recorder } = testClient({ token: [tokenOk()], api: [empty(202)] });

    await expect(
      client.collections.requestToPay(REFERENCE_ID, { ...INPUT, externalId: 'fare 8842' }),
    ).rejects.toMatchObject({ error: { kind: 'VALIDATION', field: 'externalId' } });
    expect(recorder.calls).toHaveLength(0);
  });
});

describe('requestToPay status', () => {
  test.each(['CREATED', 'SUCCESSFUL', 'FAILED', 'PENDING', 'REJECTED', 'TIMEOUT'] as const)(
    '200 %s is read verbatim',
    async (status) => {
      const { client } = testClient({ token: [tokenOk()], api: [json(200, statusBody(status))] });

      const result = await client.collections.getStatus(REFERENCE_ID);

      expect(result.status).toBe(status);
      expect(result.referenceId).toBe(REFERENCE_ID);
      expect(result.amount).toBe('12.50');
      expect(result.raw).toMatchObject({ status });
    },
  );

  test('400 is UPSTREAM, non-retryable', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [json(400, { message: 'bad' })] });

    await expect(client.collections.getStatus(REFERENCE_ID)).rejects.toMatchObject({
      error: { kind: 'UPSTREAM', retryable: false, status: 400 },
    });
  });

  test('404 is non-retryable, and is how the reconciler learns a POST never landed', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [empty(404)] });

    const caught = await client.collections.getStatus(REFERENCE_ID).catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.status).toBe(404);
    expect(isMomoRequestError(caught) && caught.retryable).toBe(false);
  });

  test('401 refreshes the token and retries exactly once', async () => {
    const { client, recorder } = testClient({
      token: [tokenOk(), tokenOk()],
      api: [empty(401), json(200, statusBody('SUCCESSFUL'))],
    });

    const result = await client.collections.getStatus(REFERENCE_ID);

    expect(result.status).toBe('SUCCESSFUL');
    expect(recorder.tokenCalls()).toBe(2);
    expect(recorder.apiCalls()).toBe(2);
  });

  test('429 and 500 stay retryable, so the row is never marked FAILED', async () => {
    for (const status of [429, 500]) {
      const { client } = testClient({ token: [tokenOk()], api: [empty(status)] });
      await expect(client.collections.getStatus(REFERENCE_ID)).rejects.toMatchObject({
        error: { kind: 'UPSTREAM', retryable: true, status },
      });
    }
  });

  test('a timeout is TIMEOUT, retryable', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [timeoutError()] });

    const caught = await client.collections.getStatus(REFERENCE_ID).catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.failure).toBe('TIMEOUT');
    expect(isMomoRequestError(caught) && caught.retryable).toBe(true);
  });

  test('malformed JSON is MALFORMED and retryable, not a crash', async () => {
    const { client } = testClient({ token: [tokenOk()], api: [malformed(200)] });

    const caught = await client.collections.getStatus(REFERENCE_ID).catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.failure).toBe('MALFORMED');
    expect(eventForSendFailure(caught)).toEqual({ type: 'SEND_RETRYABLE' });
  });

  test('a 200 with a status we do not recognise is MALFORMED, never guessed at', async () => {
    const { client } = testClient({
      token: [tokenOk()],
      api: [json(200, { ...statusBody('SUCCESSFUL'), status: 'PROBABLY_FINE' })],
    });

    const caught = await client.collections.getStatus(REFERENCE_ID).catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.failure).toBe('MALFORMED');
  });
});
