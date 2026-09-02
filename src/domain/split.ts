/**
 * The split engine.
 *
 * A taxi fare arrives and must be divided 60/25/10/5 between the owner, the
 * driver, the fuel pool and the insurance pool. Most amounts do not divide
 * cleanly, so the remainder cents have to go somewhere — deterministically,
 * and without ever creating or destroying value.
 *
 * INVARIANT (property-tested, docs/04 §3): sum(parts) === amount, exactly,
 * for every amount and every valid set of basis points.
 *
 * Basis points, not percentages, and integers, not floats: 60% is 6000 bps.
 * The set must sum to exactly 10000.
 */

import { type Minor, minor } from './money';

export const TOTAL_BPS = 10_000;

export interface SplitComponent {
  /** Stable key — an account type or a label. Used for tie-breaking. */
  readonly key: string;
  /** Basis points. 6000 = 60%. */
  readonly bps: number;
}

export interface SplitPart {
  readonly key: string;
  readonly bps: number;
  readonly amount: Minor;
}

export class SplitRuleError extends Error {}

/** The default KombiPay fare split. Versioned in the DB; this is the seed. */
export const DEFAULT_FARE_SPLIT: readonly SplitComponent[] = [
  { key: 'OWNER', bps: 6000 },
  { key: 'DRIVER_FLOAT', bps: 2500 },
  { key: 'FUEL_POOL', bps: 1000 },
  { key: 'INSURANCE_POOL', bps: 500 },
];

export function assertValidRule(components: readonly SplitComponent[]): void {
  if (components.length === 0) {
    throw new SplitRuleError('a split rule needs at least one component');
  }
  for (const c of components) {
    if (!Number.isInteger(c.bps) || c.bps < 0 || c.bps > TOTAL_BPS) {
      throw new SplitRuleError(`component ${c.key} has invalid bps: ${c.bps}`);
    }
  }
  const total = components.reduce((a, c) => a + c.bps, 0);
  if (total !== TOTAL_BPS) {
    throw new SplitRuleError(`split sums to ${total} bps, expected ${TOTAL_BPS}`);
  }
  const keys = new Set(components.map((c) => c.key));
  if (keys.size !== components.length) {
    throw new SplitRuleError('duplicate component keys');
  }
}

/**
 * Divide `amount` across `components`.
 *
 * 1. Each part gets floor(amount * bps / 10000).
 * 2. The leftover cents are handed out one at a time, largest fractional
 *    remainder first, ties broken by the component's original position.
 *
 * Deterministic: the same input always produces the same output, which is what
 * makes a fare re-explainable months later from the versioned rule alone.
 */
export function split(amount: Minor, components: readonly SplitComponent[]): SplitPart[] {
  assertValidRule(components);

  const total = BigInt(TOTAL_BPS);

  const seeded = components.map((c, index) => {
    const scaled = amount * BigInt(c.bps);
    return {
      key: c.key,
      bps: c.bps,
      index,
      floor: scaled / total,
      frac: scaled % total,
    };
  });

  const distributed = seeded.reduce<bigint>((a, s) => a + s.floor, 0n);
  let remainder = amount - distributed;

  // Largest fractional part first; stable on the original ordering.
  const order = [...seeded].sort((a, b) =>
    a.frac === b.frac ? a.index - b.index : a.frac > b.frac ? -1 : 1,
  );

  const bonus = new Map<string, bigint>();
  for (const s of order) {
    if (remainder <= 0n) break;
    bonus.set(s.key, 1n);
    remainder -= 1n;
  }

  const parts = seeded.map((s) => ({
    key: s.key,
    bps: s.bps,
    amount: minor(s.floor + (bonus.get(s.key) ?? 0n)),
  }));

  // Belt and braces. This must never fire; if it does, we want to know loudly
  // rather than quietly mis-pay a driver.
  const check = parts.reduce<bigint>((a, p) => a + p.amount, 0n);
  if (check !== amount) {
    throw new SplitRuleError(`split produced ${check}, expected ${amount}`);
  }

  return parts;
}
