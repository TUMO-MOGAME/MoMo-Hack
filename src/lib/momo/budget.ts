/**
 * THE LIVE SPEND GUARD.
 *
 * We have roughly **R10 of real money** for testing against a non-sandbox MoMo
 * environment. That is not a budget, it is a rounding error, and it is gone
 * after eight ordinary-looking test transactions. `scripts/momo-smoke.mjs` on
 * its own sends six payments of R12.50 and two of R5 — **R85 in one run**,
 * eight times the entire budget, from a script whose whole purpose is to be run
 * casually before a demo.
 *
 * So this is a guard and not a note. `MISTAKES.md`: prefer a guard that makes
 * the mistake *impossible* over one that merely detects it, and a rule with no
 * guard is a wish. The rule "keep test amounts small" is a wish. A hard cap
 * enforced at the one place every outbound amount must pass through is not.
 *
 * WHERE THIS IS ENFORCED: `toMomoAmount` in `currency.ts`, which is the single
 * chokepoint converting ledger minor units into the `{ amount, currency }` pair
 * that goes on the wire. There is no second path — a caller cannot construct a
 * MoMo request without going through it.
 *
 * WHAT IT DOES NOT DO: it does not track cumulative spend. That needs
 * persistence, and once the ledger is live the ledger IS the record of what we
 * have spent — `MOMO_SETTLEMENT` is exactly "money we have moved at MTN". A
 * per-transaction ceiling is the part that can be enforced at the boundary
 * without state, and it is the part that stops a single careless run.
 */

/**
 * Just enough of an environment to read one variable.
 *
 * Not `NodeJS.ProcessEnv`: that type requires `NODE_ENV`, so a test could not
 * pass a one-key object without a cast, and a cast in a test is a small lie
 * about what the function needs. `process.env` is assignable to this.
 */
export type EnvLike = Record<string, string | undefined>;

/** The whole live testing budget, in minor units. R10.00. */
export const LIVE_BUDGET_MINOR = 1_000n;

/**
 * The default per-transaction ceiling against a non-sandbox environment.
 * R1.00 — small enough that the entire budget survives ten transactions, large
 * enough to demonstrate a real payment.
 */
export const DEFAULT_LIVE_MAX_MINOR = 100n;

/** The env var that raises or lowers the ceiling, for a deliberate exception. */
export const LIVE_MAX_ENV = 'MOMO_LIVE_MAX_MINOR';

/**
 * ── THE PAYOUT CEILING, AND WHY IT IS LOWER THAN THE INBOUND ONE ─────────────
 *
 * A `requesttopay` and a `transfer` are not symmetric risks, and giving them
 * one shared cap would pretend they are.
 *
 * **A collection that goes wrong annoys somebody.** MTN pushes a prompt to a
 * handset, a human reads it, and if it is wrong they decline. There is a second
 * person in the loop and they hold the veto — no money moves without their PIN.
 *
 * **A transfer that goes wrong is money gone.** There is no prompt, no PIN, no
 * decline: we say pay, and MTN pays. The only thing between a bug and an empty
 * wallet is this number. So the payout default is **R0.10** — a tenth of the
 * inbound cap, enough to prove a payout end to end and small enough that a loop
 * which fires a hundred times before anyone notices has spent R10, not R100.
 *
 * Raise it deliberately, per transaction, knowing what it guards.
 */
export const DEFAULT_PAYOUT_MAX_MINOR = 10n;

/** The env var for the payout ceiling. Separate from the inbound one, on purpose. */
export const PAYOUT_MAX_ENV = 'MOMO_PAYOUT_MAX_MINOR';

export class PayoutBudgetError extends RangeError {
  readonly amountMinor: bigint;
  readonly capMinor: bigint;

  constructor(amountMinor: bigint, capMinor: bigint, targetEnvironment: string) {
    super(
      `refusing to PAY OUT ${formatMinor(amountMinor)} to the "${targetEnvironment}" MoMo ` +
        `environment: the payout cap is ${formatMinor(capMinor)} per transfer. ` +
        'Unlike a collection, a transfer has no second human in the loop — nobody ' +
        `approves it on a handset, so this cap is the only brake. Raise ` +
        `${PAYOUT_MAX_ENV} deliberately if you mean it.`,
    );
    this.name = 'PayoutBudgetError';
    this.amountMinor = amountMinor;
    this.capMinor = capMinor;
  }
}

/** The payout ceiling now in force. Same malformed-value reasoning as `liveCapMinor`. */
export function payoutCapMinor(env: EnvLike = process.env): bigint {
  const raw = env[PAYOUT_MAX_ENV];
  if (!raw) return DEFAULT_PAYOUT_MAX_MINOR;
  try {
    const parsed = BigInt(raw.trim());
    return parsed > 0n ? parsed : DEFAULT_PAYOUT_MAX_MINOR;
  } catch {
    return DEFAULT_PAYOUT_MAX_MINOR;
  }
}

/**
 * Throw unless this amount may be PAID OUT to this environment.
 *
 * Applied on top of `assertWithinLiveBudget`, never instead of it: a payout
 * must satisfy both the general live cap and the tighter payout one. Sandbox is
 * exempt for the same reason as ever — sandbox money is not real, and the demo
 * pays out R12.50 there.
 */
export function assertWithinPayoutBudget(
  amountMinor: bigint,
  targetEnvironment: string | undefined,
  env: EnvLike = process.env,
): void {
  if (!isLiveEnvironment(targetEnvironment)) return;

  const cap = payoutCapMinor(env);
  if (amountMinor > cap) {
    throw new PayoutBudgetError(amountMinor, cap, targetEnvironment ?? '(unset)');
  }
}

export class LiveBudgetError extends RangeError {
  readonly amountMinor: bigint;
  readonly capMinor: bigint;

  constructor(amountMinor: bigint, capMinor: bigint, targetEnvironment: string) {
    super(
      `refusing to send ${formatMinor(amountMinor)} to the "${targetEnvironment}" MoMo ` +
        `environment: the live cap is ${formatMinor(capMinor)} per transaction. ` +
        `The whole live testing budget is ${formatMinor(LIVE_BUDGET_MINOR)}. ` +
        `Use the sandbox, or raise ${LIVE_MAX_ENV} deliberately if you mean it.`,
    );
    this.name = 'LiveBudgetError';
    this.amountMinor = amountMinor;
    this.capMinor = capMinor;
  }
}

/** R12.34, from 1234n. Local to this file so the error text needs no imports. */
function formatMinor(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}R${whole}.${cents.toString().padStart(2, '0')}`;
}

/**
 * Is this environment spending real money?
 *
 * Anything that is not the string `sandbox` is treated as live. That default is
 * deliberate: a typo in `MOMO_TARGET_ENVIRONMENT`, or a value we have not seen
 * before, must fall on the CAUTIOUS side. Guessing "probably sandbox" and being
 * wrong costs real money; guessing "probably live" and being wrong costs a
 * confusing error message.
 */
export function isLiveEnvironment(targetEnvironment: string | undefined): boolean {
  return targetEnvironment !== 'sandbox';
}

/**
 * The per-transaction ceiling now in force.
 *
 * A malformed or non-positive `MOMO_LIVE_MAX_MINOR` falls back to the default
 * rather than throwing or, far worse, being read as "no limit".
 */
export function liveCapMinor(env: EnvLike = process.env): bigint {
  const raw = env[LIVE_MAX_ENV];
  if (!raw) return DEFAULT_LIVE_MAX_MINOR;
  try {
    const parsed = BigInt(raw.trim());
    return parsed > 0n ? parsed : DEFAULT_LIVE_MAX_MINOR;
  } catch {
    return DEFAULT_LIVE_MAX_MINOR;
  }
}

/**
 * Throw unless this amount may be sent to this environment.
 *
 * Sandbox money is not real, so the cap does not apply there — the demo uses
 * R12.50 fares and should keep doing so.
 */
export function assertWithinLiveBudget(
  amountMinor: bigint,
  targetEnvironment: string | undefined,
  env: EnvLike = process.env,
): void {
  if (!isLiveEnvironment(targetEnvironment)) return;

  const cap = liveCapMinor(env);
  if (amountMinor > cap) {
    throw new LiveBudgetError(amountMinor, cap, targetEnvironment ?? '(unset)');
  }
}
