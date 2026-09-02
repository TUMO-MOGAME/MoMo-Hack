/**
 * The ZAR / EUR shim (momoAPIs.md §11, ADR-0008).
 *
 * Two jobs here. The first is the arithmetic: a relabel, never an FX rate, so
 * our ledger and MTN's records agree to the cent and reconciliation is exact.
 *
 * The second is the containment rule, and it is the reason this file scans the
 * source tree: **the word EUR appears in exactly two places in the codebase,
 * the shim and this test.** Every UI surface shows R. If that ever stops being
 * true, a screen somewhere is about to show a South African commuter a price in
 * euros, and this test fails first.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  fromMomoAmount,
  isExpectedCurrency,
  momoCurrency,
  toMomoAmount,
} from '@/lib/momo/currency';
import { formatZAR, parseMinor, posting } from '@/domain/money';

const SRC = join(process.cwd(), 'src');
const SHIM = join('src', 'lib', 'momo', 'currency.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('the EUR containment rule', () => {
  test('exactly one file in src/ contains the string EUR', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /\bEUR\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));

    expect(offenders).toEqual([SHIM.split(sep).join(sep)]);
  });
});

describe('toMomoAmount', () => {
  test('sandbox transmits the same NUMBER under the EUR label', () => {
    // 1250 ZAR cents -> "12.50". No exchange rate. That is the entire design:
    // an FX rate would make our ledger and MTN's records disagree.
    expect(toMomoAmount(1250n, 'sandbox')).toEqual({ amount: '12.50', currency: 'EUR' });
  });

  test('production sends the identical number under the ZAR label', () => {
    expect(toMomoAmount(1250n, 'production')).toEqual({ amount: '12.50', currency: 'ZAR' });
  });

  test('the numeric value is byte-identical across environments', () => {
    for (const cents of [1n, 5n, 99n, 100n, 101n, 123456789n]) {
      expect(toMomoAmount(cents, 'sandbox').amount).toBe(toMomoAmount(cents, 'production').amount);
    }
  });

  test('cents are always two digits', () => {
    expect(toMomoAmount(1n, 'sandbox').amount).toBe('0.01');
    expect(toMomoAmount(10n, 'sandbox').amount).toBe('0.10');
    expect(toMomoAmount(100n, 'sandbox').amount).toBe('1.00');
    expect(toMomoAmount(100_000_000n, 'sandbox').amount).toBe('1000000.00');
  });

  test('a non-positive amount is refused, not silently sent', () => {
    expect(() => toMomoAmount(0n, 'sandbox')).toThrow(RangeError);
    expect(() => toMomoAmount(-1n, 'sandbox')).toThrow(RangeError);
  });

  test('no float ever touches the value — beyond 2^53 is still exact', () => {
    // 90071992547409911 cents is past Number.MAX_SAFE_INTEGER. A float would
    // round it; bigint does not.
    expect(toMomoAmount(90_071_992_547_409_911n, 'sandbox').amount).toBe('900719925474099.11');
  });
});

describe('fromMomoAmount', () => {
  test('round-trips exactly, which is what makes reconciliation exact', () => {
    for (const cents of [1n, 99n, 1250n, 100_000n, 90_071_992_547_409_911n]) {
      expect(fromMomoAmount(toMomoAmount(cents, 'sandbox').amount)).toBe(cents);
    }
  });

  test('agrees with the frozen money parser', () => {
    expect(fromMomoAmount('12.50')).toBe(parseMinor('12.50'));
  });

  test('rejects anything that is not a plain decimal', () => {
    for (const bad of ['12,50', '12.505', 'R12.50', '1e3', '', ' 12.5.0 ']) {
      expect(() => fromMomoAmount(bad)).toThrow(RangeError);
    }
  });
});

describe('what the user sees', () => {
  test('is always rands, never the transmitted label', () => {
    expect(formatZAR(posting(1250n))).toBe('R12.50');
    expect(formatZAR(posting(123_456_789n))).toBe('R1 234 567.89');
  });
});

describe('isExpectedCurrency', () => {
  test('accepts the echo that matches the environment', () => {
    expect(isExpectedCurrency('EUR', 'sandbox')).toBe(true);
    expect(isExpectedCurrency('eur', 'sandbox')).toBe(true);
    expect(isExpectedCurrency('ZAR', 'production')).toBe(true);
  });

  test('rejects a mismatch — either the sandbox changed or we are on the wrong env', () => {
    expect(isExpectedCurrency('ZAR', 'sandbox')).toBe(false);
    expect(isExpectedCurrency('USD', 'sandbox')).toBe(false);
  });

  test('a missing echo is not a failure', () => {
    expect(isExpectedCurrency(undefined, 'sandbox')).toBe(true);
  });

  test('momoCurrency is the single source of the label', () => {
    expect(momoCurrency('sandbox')).not.toBe(momoCurrency('production'));
    expect(momoCurrency(undefined)).toBe('ZAR');
  });
});
