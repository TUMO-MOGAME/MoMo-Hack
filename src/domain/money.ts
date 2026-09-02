/**
 * Money. The single most important file in this codebase.
 *
 * RULE (CLAUDE.md #1): money is `bigint` in MINOR UNITS (cents). Never float,
 * never `number`. R12.50 is `1250n`.
 *
 * The branded type means you cannot accidentally pass a plain bigint (a count,
 * an id, a timestamp) where an amount is expected. It costs one cast at the
 * boundary and removes an entire class of bug.
 */

declare const MinorBrand: unique symbol;

/** An amount in minor units (cents). Always non-negative unless stated. */
export type Minor = bigint & { readonly [MinorBrand]: 'Minor' };

/** A signed ledger posting. Positive = debit, negative = credit. */
export type Posting = bigint & { readonly [MinorBrand]: 'Minor' };

export const ZERO = 0n as Minor;

/** Construct a Minor from a bigint. Throws on a negative amount. */
export function minor(value: bigint): Minor {
  if (value < 0n) throw new RangeError(`amount cannot be negative: ${value}`);
  return value as Minor;
}

/** Construct a signed posting, which MAY be negative. */
export function posting(value: bigint): Posting {
  return value as Posting;
}

/**
 * Parse a decimal string like "12.50" into minor units.
 * Deliberately strict: no floats, no locale parsing, no silent rounding.
 */
export function parseMinor(input: string): Minor {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) throw new RangeError(`not a valid amount: "${input}"`);
  // Group 1 always matches when the regex does; `?? '0'` satisfies
  // noUncheckedIndexedAccess without weakening the compiler settings.
  const whole = BigInt(m[1] ?? '0');
  const cents = BigInt((m[2] ?? '').padEnd(2, '0'));
  return minor(whole * 100n + cents);
}

/** "1250" -> "12.50". Used at the MoMo boundary and nowhere else raw. */
export function toDecimalString(value: Minor | Posting): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`;
}

/** "R12.50". The only thing a South African user should ever see. */
export function formatZAR(value: Minor | Posting): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const cents = abs % 100n;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}R${grouped}.${String(cents).padStart(2, '0')}`;
}

/** Sum of postings. A balanced journal sums to exactly 0n. */
export function sum(values: readonly (Minor | Posting)[]): bigint {
  return values.reduce<bigint>((a, b) => a + b, 0n);
}
