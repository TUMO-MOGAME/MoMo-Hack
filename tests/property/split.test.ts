/**
 * P1-P2 from docs/04 §3 — the properties that matter most.
 *
 * A split that loses or invents a cent is the one bug this project cannot
 * survive (R3). Examples prove a case works; properties prove the category
 * works. 5,000 generated cases run in well under a second.
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { minor, type Minor } from '@/domain/money';
import { DEFAULT_FARE_SPLIT, split, SplitRuleError, TOTAL_BPS } from '@/domain/split';

/** Arbitrary set of components whose basis points sum to exactly 10000. */
const arbRule = fc
  .integer({ min: 2, max: 8 })
  .chain((n) =>
    fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: n, maxLength: n }).map((weights) => {
      const total = weights.reduce((a, b) => a + b, 0);
      const bps = weights.map((w) => Math.floor((w * TOTAL_BPS) / total));
      // Push the rounding drift onto the first component so the rule is valid.
      // `?? 0` satisfies noUncheckedIndexedAccess; n >= 2 so index 0 exists.
      bps[0] = (bps[0] ?? 0) + (TOTAL_BPS - bps.reduce((a, b) => a + b, 0));
      return bps.map((b, i) => ({ key: `K${i}`, bps: b }));
    }),
  )
  .filter((cs) => cs.every((c) => c.bps >= 0));

const arbAmount = fc.bigInt({ min: 1n, max: 100_000_000n }).map((v) => minor(v));

describe('split', () => {
  test('P1 — parts always sum to exactly the input', () => {
    fc.assert(
      fc.property(arbAmount, arbRule, (amount, rule) => {
        const parts = split(amount, rule);
        expect(parts.reduce<bigint>((a, p) => a + p.amount, 0n)).toBe(amount);
      }),
      { numRuns: 5000 },
    );
  });

  test('P1b — no part is ever negative', () => {
    fc.assert(
      fc.property(arbAmount, arbRule, (amount, rule) => {
        expect(split(amount, rule).every((p) => p.amount >= 0n)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  test('P2 — the same input always produces the same split', () => {
    fc.assert(
      fc.property(arbAmount, arbRule, (amount, rule) => {
        expect(split(amount, rule)).toEqual(split(amount, rule));
      }),
      { numRuns: 1000 },
    );
  });

  test('the remainder never exceeds one cent per component', () => {
    fc.assert(
      fc.property(arbAmount, arbRule, (amount, rule) => {
        for (const p of split(amount, rule)) {
          const exact = (amount * BigInt(p.bps)) / BigInt(TOTAL_BPS);
          expect(p.amount - exact).toBeLessThanOrEqual(1n);
          expect(p.amount - exact).toBeGreaterThanOrEqual(0n);
        }
      }),
      { numRuns: 2000 },
    );
  });

  test('an invalid rule is rejected, never silently normalised', () => {
    expect(() => split(minor(100n), [{ key: 'A', bps: 5000 }])).toThrow(SplitRuleError);
    expect(() => split(minor(100n), [{ key: 'A', bps: 6000 }, { key: 'A', bps: 4000 }])).toThrow(
      SplitRuleError,
    );
    expect(() => split(minor(100n), [])).toThrow(SplitRuleError);
  });

  test('the documented R12.50 fare split — driver takes the remainder cent', () => {
    // Guards docs/01 §4 and docs/08 §3. Both said R3.12/R0.63 until the
    // property test proved the deterministic tie-break gives the odd cent to
    // the driver (lower index at an equal fractional part).
    const parts = split(minor(1250n) as Minor, DEFAULT_FARE_SPLIT);
    expect(Object.fromEntries(parts.map((p) => [p.key, p.amount]))).toEqual({
      OWNER: 750n,
      DRIVER_FLOAT: 313n,
      FUEL_POOL: 125n,
      INSURANCE_POOL: 62n,
    });
  });
});
