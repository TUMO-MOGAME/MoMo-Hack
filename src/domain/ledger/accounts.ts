/**
 * The chart of accounts (docs/02 §2).
 *
 * Pure. No I/O, no env, no database (docs/01 §5). An account is identified in
 * the domain by its NATURAL KEY — type + owner + subject + currency — never by
 * a uuid, because the domain has no way to know a uuid. `src/server/ledger`
 * resolves a reference to a row id at the boundary.
 */

/** Every account type in the system. Mirrors the `account_type` enum. */
export const ACCOUNT_TYPES = [
  'MOMO_SETTLEMENT',
  'USER_WALLET',
  'ESCROW_HOLD',
  'STOKVEL_POOL',
  'FAMILY_LOCKED',
  'FUEL_POOL',
  'INSURANCE_POOL',
  'DRIVER_FLOAT',
  'PLATFORM_FEE',
  'ROUNDING',
  'SUSPENSE',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * MOMO_SETTLEMENT is the only debit-normal account: it is money we hold at MTN,
 * the system's one external door. Everything else records what we OWE someone,
 * so it is credit-normal and sits at or below zero.
 *
 * This is the same rule as `account_is_debit_normal()` in 0001_ledger.sql. The
 * two must agree; `tests/unit/ledger/accounts.test.ts` asserts the list.
 */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'MOMO_SETTLEMENT';
}

/**
 * Accounts allowed to cross their normal balance. These three are book-keeping
 * accounts, not custodial ones — no user's money sits in them, so a transient
 * sign flip is an accounting artefact rather than a lost cent.
 *
 * SUSPENSE must be zero at end of day; a non-zero ROUNDING balance is an alarm
 * (docs/02 §2, A5 §1).
 */
const NEGATIVE_ALLOWED: ReadonlySet<AccountType> = new Set<AccountType>([
  'PLATFORM_FEE',
  'ROUNDING',
  'SUSPENSE',
]);

export function allowsNegative(type: AccountType): boolean {
  return NEGATIVE_ALLOWED.has(type);
}

/**
 * A reference to an account by natural key. `undefined` and `null` both mean
 * "no owner"/"no subject" — the server side coalesces them to the nil uuid so
 * the unique index behaves (0001_ledger.sql, `ledger_account_natural_key`).
 */
export interface AccountRef {
  readonly type: AccountType;
  /** `profile.id`. Null for system accounts. */
  readonly ownerId?: string | null;
  /** Job id, stokvel id, rank id, locked category... Null when not scoped. */
  readonly subjectId?: string | null;
  /** ISO-4217. The ledger is ZAR; the currency relabel happens only at the MoMo edge. */
  readonly currency?: string;
}

export const ZAR = 'ZAR';

/** The single settlement account. Every cent enters and leaves through here. */
export const MOMO_SETTLEMENT: AccountRef = { type: 'MOMO_SETTLEMENT' };

/** Our revenue. */
export const PLATFORM_FEE: AccountRef = { type: 'PLATFORM_FEE' };

/** Inbound money we cannot yet attribute. Must be zero at end of day. */
export const SUSPENSE: AccountRef = { type: 'SUSPENSE' };

/** Stable string form of a reference. Used for de-duplication and as a map key. */
export function accountKey(ref: AccountRef): string {
  const owner = ref.ownerId ?? '-';
  const subject = ref.subjectId ?? '-';
  return `${ref.type}:${owner}:${subject}:${ref.currency ?? ZAR}`;
}

export function sameAccount(a: AccountRef, b: AccountRef): boolean {
  return accountKey(a) === accountKey(b);
}

export function userWallet(ownerId: string): AccountRef {
  return { type: 'USER_WALLET', ownerId };
}

export function escrowHold(subjectId: string): AccountRef {
  return { type: 'ESCROW_HOLD', subjectId };
}

export function stokvelPool(stokvelId: string): AccountRef {
  return { type: 'STOKVEL_POOL', subjectId: stokvelId };
}

export function familyLocked(ownerId: string, category: string): AccountRef {
  // The lock is a ledger fact, not a UI rule (docs/11 §4): money for school fees
  // lives in a different ACCOUNT from money for transport, so there is no code
  // path that can spend one on the other.
  return { type: 'FAMILY_LOCKED', ownerId, subjectId: category };
}

export function driverFloat(driverId: string): AccountRef {
  return { type: 'DRIVER_FLOAT', ownerId: driverId };
}

export function fuelPool(rankId: string): AccountRef {
  return { type: 'FUEL_POOL', subjectId: rankId };
}

export function insurancePool(rankId: string): AccountRef {
  return { type: 'INSURANCE_POOL', subjectId: rankId };
}
