import { describe, expect, test } from 'vitest';
import { describePayees, maskPayee, parsePayees, resolvePayee } from '@/lib/momo/payees';

/**
 * Who `/pay` may ask for money.
 *
 * The property under test is one sentence: **a person may SELECT a payee and
 * may never SUPPLY one.** Everything below is that sentence from a different
 * angle, because the failure it prevents — a public bot making MTN ring any
 * South African with a payment request — has no smaller version.
 */

const TWO = '27767223145:me,27788033288:gogo';

describe('parsing the configured payees', () => {
  test('reads labelled entries, lower-casing the label', () => {
    const payees = parsePayees('27767223145:Me,27788033288:GOGO');
    expect(payees.map((p) => [p.msisdn, p.label])).toEqual([
      ['27767223145', 'me'],
      ['27788033288', 'gogo'],
    ]);
  });

  test('a bare number needs no label', () => {
    expect(parsePayees('27767223145')).toEqual([{ msisdn: '27767223145', label: '' }]);
  });

  test('tolerates the spacing and separators people actually type', () => {
    for (const raw of [
      TWO,
      '27767223145:me 27788033288:gogo',
      ' 27767223145:me , 27788033288:gogo ',
    ]) {
      expect(parsePayees(raw).map((p) => p.msisdn)).toEqual(['27767223145', '27788033288']);
    }
  });

  test('drops entries MTN could not use, rather than throwing', () => {
    // Read on the request path. One typo in an env var must not be a route that
    // 500s on every message — and a payee that cannot be parsed is a payee
    // nobody can select, which fails closed.
    const payees = parsePayees('+27767223145,0788033288,notanumber,27788033288:gogo');
    expect(payees.map((p) => p.msisdn)).toEqual(['27788033288']);
  });

  test('de-duplicates the same number', () => {
    expect(parsePayees('27767223145:me,27767223145:again')).toHaveLength(1);
  });

  test('UNSET IS NOT EVERYBODY — it falls back to the single demo number', () => {
    // The most important line here. If an unset variable ever produced "any
    // number is fine", a deploy that forgot it would open the payment path.
    expect(parsePayees(undefined, '27767223145')).toEqual([{ msisdn: '27767223145', label: '' }]);
    expect(parsePayees('', '27767223145')).toHaveLength(1);
  });

  test('unset with no fallback is NOBODY, not anybody', () => {
    expect(parsePayees(undefined, undefined)).toEqual([]);
    expect(parsePayees('', '')).toEqual([]);
    // A malformed fallback is no fallback.
    expect(parsePayees(undefined, '+27767223145')).toEqual([]);
  });
});

describe('resolving what a person typed', () => {
  const payees = parsePayees(TWO);

  test('by label, case-insensitively', () => {
    expect(resolvePayee(payees, 'gogo')?.msisdn).toBe('27788033288');
    expect(resolvePayee(payees, 'GoGo')?.msisdn).toBe('27788033288');
    expect(resolvePayee(payees, ' me ')?.msisdn).toBe('27767223145');
  });

  test('by full number', () => {
    expect(resolvePayee(payees, '27788033288')?.msisdn).toBe('27788033288');
  });

  test('by the last four digits, because that is what the bot shows them', () => {
    expect(resolvePayee(payees, '3288')?.msisdn).toBe('27788033288');
    expect(resolvePayee(payees, '3145')?.msisdn).toBe('27767223145');
  });

  test('an ambiguous last-four resolves to NOBODY, not to a coin toss', () => {
    // Two payees ending 3288 must not make "3288" pick one at random. A coin
    // toss must never choose whose phone rings.
    const ambiguous = parsePayees('27788033288:a,27799903288:b');
    expect(ambiguous).toHaveLength(2);
    expect(resolvePayee(ambiguous, '3288')).toBeNull();
  });

  test('AN UNCONFIGURED NUMBER RESOLVES TO NULL — the whole guarantee', () => {
    for (const typed of ['0767221345', '27621234567', '9999999999', '27767223146']) {
      expect(resolvePayee(payees, typed)).toBeNull();
    }
  });

  test('a + is stripped rather than silently matching nothing', () => {
    // Someone WILL paste +27788033288. Matching it to the configured number is
    // right; it is the same phone, and MTN's own 400 on the + is about the wire
    // format, not about identity.
    expect(resolvePayee(payees, '+27788033288')?.msisdn).toBe('27788033288');
  });

  test('empty and whitespace resolve to null, never to the first payee', () => {
    // The caller decides that an ABSENT selector means "the first one". An
    // empty STRING is not the same thing and must not silently pick somebody.
    expect(resolvePayee(payees, '')).toBeNull();
    expect(resolvePayee(payees, '   ')).toBeNull();
  });

  test('a label cannot be matched by the empty label of an unlabelled payee', () => {
    const bare = parsePayees('27767223145');
    expect(resolvePayee(bare, '')).toBeNull();
  });
});

describe('how they are shown', () => {
  test('never in full — POPIA s105/106', () => {
    expect(maskPayee('27788033288')).toBe('•••• 3288');
    expect(describePayees(parsePayees(TWO))).not.toContain('27788033288');
  });

  test('labels where they exist, masked numbers otherwise', () => {
    expect(describePayees(parsePayees(TWO))).toBe('me (•••• 3145), gogo (•••• 3288)');
    expect(describePayees(parsePayees('27767223145'))).toBe('•••• 3145');
  });
});
