/**
 * The live spend guard (`src/lib/momo/budget.ts`).
 *
 * We have about R10 of real money. `scripts/momo-smoke.mjs` sends R85 in a
 * single run. These tests exist so that the thing standing between those two
 * facts is verified rather than assumed — a guard nobody has watched fire is
 * indistinguishable from a comment.
 */

import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LIVE_MAX_MINOR,
  type EnvLike,
  LIVE_BUDGET_MINOR,
  LiveBudgetError,
  assertWithinLiveBudget,
  isLiveEnvironment,
  liveCapMinor,
} from '@/lib/momo/budget';
import { toMomoAmount } from '@/lib/momo/currency';

const NO_ENV: EnvLike = {};

describe('what counts as spending real money', () => {
  test('only the exact string "sandbox" is free', () => {
    expect(isLiveEnvironment('sandbox')).toBe(false);
  });

  test('anything else is treated as live — including a typo and an unset value', () => {
    for (const value of ['production', 'mtnsouthafrica', 'Sandbox', 'sandbo', '', undefined]) {
      expect(isLiveEnvironment(value)).toBe(true);
    }
  });

  test('the cautious default is the point: guessing wrong must cost an error, not money', () => {
    // 'sandbxo' is the kind of typo that would otherwise send R12.50 for real.
    expect(() => assertWithinLiveBudget(1250n, 'sandbxo', NO_ENV)).toThrow(LiveBudgetError);
  });
});

describe('the cap', () => {
  test('R1.00 by default, and the whole budget is R10.00', () => {
    expect(DEFAULT_LIVE_MAX_MINOR).toBe(100n);
    expect(LIVE_BUDGET_MINOR).toBe(1_000n);
    // Ten transactions at the cap spend the entire budget and no more.
    expect(DEFAULT_LIVE_MAX_MINOR * 10n).toBe(LIVE_BUDGET_MINOR);
  });

  test('MOMO_LIVE_MAX_MINOR raises it deliberately', () => {
    expect(liveCapMinor({ MOMO_LIVE_MAX_MINOR: '250' })).toBe(250n);
  });

  test('a malformed or non-positive override falls back — never to "no limit"', () => {
    for (const raw of ['', 'abc', '0', '-500', '1.5']) {
      expect(liveCapMinor({ MOMO_LIVE_MAX_MINOR: raw })).toBe(DEFAULT_LIVE_MAX_MINOR);
    }
  });
});

describe('sandbox is unaffected — sandbox money is not real', () => {
  test('the R12.50 demo fare still goes through', () => {
    expect(() => assertWithinLiveBudget(1250n, 'sandbox', NO_ENV)).not.toThrow();
    expect(toMomoAmount(1250n, 'sandbox')).toEqual({ amount: '12.50', currency: 'EUR' });
  });

  test('even a large sandbox amount is allowed', () => {
    expect(() => assertWithinLiveBudget(9_999_999n, 'sandbox', NO_ENV)).not.toThrow();
  });
});

describe('live is capped', () => {
  test('R12.50 to a live environment is refused', () => {
    expect(() => assertWithinLiveBudget(1250n, 'production', NO_ENV)).toThrow(LiveBudgetError);
  });

  test('the whole smoke-test run would be refused at the first payment', () => {
    // Six at R12.50 and two at R5.00 — R85, eight times the budget.
    expect(() => assertWithinLiveBudget(1250n, 'production', NO_ENV)).toThrow(/live cap is R1\.00/);
    expect(() => assertWithinLiveBudget(500n, 'production', NO_ENV)).toThrow(LiveBudgetError);
  });

  test('an amount at or under the cap is allowed', () => {
    expect(() => assertWithinLiveBudget(100n, 'production', NO_ENV)).not.toThrow();
    expect(() => assertWithinLiveBudget(10n, 'production', NO_ENV)).not.toThrow();
    expect(() => assertWithinLiveBudget(1n, 'production', NO_ENV)).not.toThrow();
  });

  test('the error says the amount, the cap and the budget — enough to act on', () => {
    try {
      assertWithinLiveBudget(1250n, 'production', NO_ENV);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LiveBudgetError);
      const message = (error as Error).message;
      expect(message).toContain('R12.50');
      expect(message).toContain('R1.00');
      expect(message).toContain('R10.00');
      expect(message).toContain('production');
    }
  });
});

describe('it is enforced at the chokepoint, not left to callers', () => {
  test('toMomoAmount refuses an over-cap live amount', () => {
    // This is the guarantee that matters: every outbound MoMo request is built
    // here, so there is no path that skips the check.
    expect(() => toMomoAmount(1250n, 'production')).toThrow(LiveBudgetError);
  });

  test('toMomoAmount allows an under-cap live amount, labelled ZAR', () => {
    expect(toMomoAmount(50n, 'production')).toEqual({ amount: '0.50', currency: 'ZAR' });
  });

  test('the positive-amount check still runs first', () => {
    expect(() => toMomoAmount(0n, 'production')).toThrow(/must be positive/);
    expect(() => toMomoAmount(-5n, 'sandbox')).toThrow(/must be positive/);
  });
});
