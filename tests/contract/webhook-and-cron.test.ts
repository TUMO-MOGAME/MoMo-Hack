/**
 * The two untrusted HTTP edges (docs/04 §10, A5 §3).
 *
 * `/api/momo/callback/[kind]` is untrusted BY DESIGN — the body may only ever
 * produce a lookup key. `/api/cron/*` must require the `CRON_SECRET` bearer;
 * an unauthenticated cron route lets anyone trigger settlement, which A5 grades
 * **High**.
 *
 * Both are tested at the helper level rather than through a running server,
 * because that is where the decisions actually live. The route handlers are
 * three lines of glue over these.
 */

import { describe, expect, test } from 'vitest';
import { isAuthorisedCron, secretMatches } from '@/server/cron/auth';
import {
  CALLBACK_KINDS,
  createRateLimiter,
  extractReferenceId,
  isCallbackKind,
} from '@/server/momo/callback';
import { REFERENCE_ID } from './_helpers';

const URL_BASE = new URL('https://momo-hack.vercel.app/api/momo/callback/collection');

describe('callback body parsing', () => {
  test('reads the reference id from the documented field', () => {
    expect(extractReferenceId({ referenceId: REFERENCE_ID }, URL_BASE)).toBe(REFERENCE_ID);
  });

  test('accepts the plausible spellings — the body shape is still [U]', () => {
    for (const key of ['referenceId', 'reference_id', 'externalReferenceId']) {
      expect(extractReferenceId({ [key]: REFERENCE_ID }, URL_BASE)).toBe(REFERENCE_ID);
    }
  });

  test('accepts it from the query string', () => {
    const url = new URL(`${URL_BASE.toString()}?referenceId=${REFERENCE_ID}`);
    expect(extractReferenceId(null, url)).toBe(REFERENCE_ID);
  });

  test('refuses anything that is not a UUID v4', () => {
    // A forged callback cannot even name a transaction, let alone resolve one.
    for (const bad of [
      { referenceId: 'not-a-uuid' },
      { referenceId: '11111111-1111-1111-1111-111111111111' }, // v1, not v4
      { referenceId: 12345 },
      { referenceId: null },
      {},
      null,
      'a string body',
    ]) {
      expect(extractReferenceId(bad, URL_BASE)).toBeUndefined();
    }
  });

  test('extracts NOTHING but an id — no status, no amount, no payee', () => {
    // The body is never used to set a status directly (docs/03 §3.1). The only
    // thing this function can return is a string.
    const hostile = {
      referenceId: REFERENCE_ID,
      status: 'SUCCESSFUL',
      amount: '1000000.00',
      payee: { partyId: '27820000000' },
    };

    const result = extractReferenceId(hostile, URL_BASE);

    expect(result).toBe(REFERENCE_ID);
    expect(typeof result).toBe('string');
  });

  test('only the three product kinds are routed', () => {
    expect([...CALLBACK_KINDS]).toEqual(['collection', 'disbursement', 'remittance']);
    expect(isCallbackKind('collection')).toBe(true);
    expect(isCallbackKind('../../etc/passwd')).toBe(false);
    expect(isCallbackKind('COLLECTION')).toBe(false);
  });
});

describe('callback rate limiting', () => {
  test('allows a normal burst and then refuses', () => {
    const limited = createRateLimiter(3);

    expect(limited('1.2.3.4', 1000)).toBe(false);
    expect(limited('1.2.3.4', 1000)).toBe(false);
    expect(limited('1.2.3.4', 1000)).toBe(false);
    expect(limited('1.2.3.4', 1000)).toBe(true);
  });

  test('the window rolls', () => {
    const limited = createRateLimiter(1);

    expect(limited('1.2.3.4', 1000)).toBe(false);
    expect(limited('1.2.3.4', 1000)).toBe(true);
    expect(limited('1.2.3.4', 62_000)).toBe(false);
  });

  test('one caller cannot starve another', () => {
    const limited = createRateLimiter(1);

    expect(limited('a', 1000)).toBe(false);
    expect(limited('a', 1000)).toBe(true);
    expect(limited('b', 1000)).toBe(false);
  });
});

describe('cron authorisation', () => {
  test('accepts the exact bearer', () => {
    const request = new Request('https://x/api/cron/reconcile', {
      method: 'POST',
      headers: { authorization: 'Bearer s3cr3t' },
    });

    expect(isAuthorisedCron(request, 's3cr3t')).toBe(true);
  });

  test('rejects a missing, wrong, or malformed header', () => {
    const make = (headers: Record<string, string>) =>
      new Request('https://x/api/cron/reconcile', { method: 'POST', headers });

    expect(isAuthorisedCron(make({}), 's3cr3t')).toBe(false);
    expect(isAuthorisedCron(make({ authorization: 'Bearer wrong!' }), 's3cr3t')).toBe(false);
    expect(isAuthorisedCron(make({ authorization: 's3cr3t' }), 's3cr3t')).toBe(false);
    expect(isAuthorisedCron(make({ authorization: 'Basic s3cr3t' }), 's3cr3t')).toBe(false);
  });

  test('rejects everything when CRON_SECRET is unset', () => {
    // The dangerous failure mode: an unset secret must DENY, never allow.
    const request = new Request('https://x/api/cron/reconcile', {
      method: 'POST',
      headers: { authorization: 'Bearer ' },
    });

    expect(isAuthorisedCron(request, undefined)).toBe(false);
    expect(isAuthorisedCron(request, '')).toBe(false);
  });

  test('the compare is length-first and constant time over the rest', () => {
    expect(secretMatches(undefined, 'abc')).toBe(false);
    expect(secretMatches('abc', undefined)).toBe(false);
    expect(secretMatches('ab', 'abc')).toBe(false);
    expect(secretMatches('abcd', 'abc')).toBe(false);
    expect(secretMatches('abc', 'abc')).toBe(true);
    // A shared prefix must not be treated as a match.
    expect(secretMatches('abd', 'abc')).toBe(false);
  });
});
