/**
 * Who `/pay` is allowed to ask for money, and how a person names them.
 *
 * ── THE PROPERTY THIS PRESERVES ──────────────────────────────────────────────
 *
 * `/pay` used to accept exactly one payee, fixed in config, and
 * `tests/unit/agent/pay-command.test.ts` states why: *"the payee is
 * CONFIGURATION. Nothing a user types can redirect a payment request at a phone
 * number of their choosing — which is the difference between a demo and a
 * machine for harassing strangers over MTN's network."*
 *
 * That property is **unchanged here**, and the distinction is the whole design:
 *
 *   - A user may now SELECT a payee. They still cannot SUPPLY one.
 *   - Every selector is resolved against a list that lives in the environment.
 *     An unrecognised selector is refused; it is never passed through to MTN.
 *   - So the worst a compromised or careless message can do is ring a phone
 *     that the operator already put on the list on purpose.
 *
 * A free-text number would have been the easy version and it is the one that
 * turns a public bot into a way to make MTN ring any stranger in South Africa
 * with a payment request. It is not built and should not be.
 *
 * ── FORMAT ───────────────────────────────────────────────────────────────────
 *
 *     MOMO_PAY_PAYEES="27767223145:me,27788033288:gogo"
 *
 * Comma or space separated. The label is optional — `27767223145` alone is
 * fine, and then only the number (or its last four digits) names it.
 *
 * UNSET IS NOT "EVERYBODY". Unset falls back to the single `MOMO_DEMO_MSISDN`,
 * which is exactly the behaviour before this file existed, so a deployment that
 * knows nothing about payees keeps working and keeps its one payee.
 */

/**
 * A brand, so that a `Payee` can only come from this module.
 *
 * Without it `requestDemoPayment(amount, channel, env, { msisdn: whatUserTyped })`
 * compiles, and the guarantee is back to being a convention. With it, the only
 * way to obtain a `Payee` is `parsePayees` or `resolvePayee` — both of which
 * read the environment — so "the payee came from configuration" is checked by
 * the compiler rather than asserted in a comment.
 */
declare const RESOLVED: unique symbol;

export interface Payee {
  /** International, no `+`. Measured: a `+` is a 400 from MTN before lookup. */
  readonly msisdn: string;
  /** What a person can type instead of the number. Lower-case, may be empty. */
  readonly label: string;
  /** Phantom. Never read, never present at runtime. */
  readonly [RESOLVED]: true;
}

/** The one place a `Payee` is minted. Private to this module on purpose. */
function payee(msisdn: string, label: string): Payee {
  return { msisdn, label } as Payee;
}

/** Mask for display. Never show a full MSISDN — POPIA s105/106 (docs/14 §5). */
export function maskPayee(msisdn: string): string {
  return `•••• ${msisdn.slice(-4)}`;
}

/**
 * Parse the configured payees.
 *
 * Malformed entries are DROPPED rather than thrown, and that direction is
 * deliberate: this is read on the request path, so one typo in an environment
 * variable would otherwise be a route that 500s on every message. Dropping
 * fails closed — a payee you cannot parse is a payee nobody can select.
 */
export function parsePayees(raw: string | undefined, fallbackMsisdn?: string): readonly Payee[] {
  const entries = (raw ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const payees: Payee[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const [rawMsisdn, rawLabel] = entry.split(':');
    const msisdn = (rawMsisdn ?? '').trim();
    // Digits only. A `+` or a local `0…` form is a number MTN cannot use, and
    // silently keeping it would surface as PAYER_NOT_FOUND on stage instead of
    // as a configuration error here.
    if (!/^[1-9][0-9]{6,14}$/.test(msisdn)) continue;
    if (seen.has(msisdn)) continue;

    seen.add(msisdn);
    payees.push(payee(msisdn, (rawLabel ?? '').trim().toLowerCase()));
  }

  if (payees.length === 0 && fallbackMsisdn && /^[1-9][0-9]{6,14}$/.test(fallbackMsisdn.trim())) {
    return [payee(fallbackMsisdn.trim(), '')];
  }

  return payees;
}

/**
 * Resolve what a person typed to a configured payee, or `null`.
 *
 * Accepts the full number, the label, or the last four digits — because
 * `•••• 3288` is what the bot shows them, so it is what they will type back.
 * Returning `null` for anything else is the guarantee: an unrecognised selector
 * never becomes a payee.
 */
export function resolvePayee(payees: readonly Payee[], selector: string): Payee | null {
  const needle = selector.trim().toLowerCase().replace(/^\+/, '');
  if (needle === '') return null;

  return (
    payees.find((p) => p.msisdn === needle) ??
    payees.find((p) => p.label !== '' && p.label === needle) ??
    // Last four only when it is unambiguous. Two payees ending 3288 would make
    // "3288" a coin toss, and a coin toss must not choose whose phone rings.
    (/^[0-9]{4}$/.test(needle) && payees.filter((p) => p.msisdn.endsWith(needle)).length === 1
      ? (payees.find((p) => p.msisdn.endsWith(needle)) ?? null)
      : null)
  );
}

/**
 * How the bot lists who you can pay, for a refusal or a `/pay` with no amount.
 *
 * Labels where they exist, masked numbers otherwise. A refusal that does not
 * say what WOULD work is a dead end, and this path exists to be talked to.
 */
export function describePayees(payees: readonly Payee[]): string {
  return payees
    .map((p) => (p.label ? `${p.label} (${maskPayee(p.msisdn)})` : maskPayee(p.msisdn)))
    .join(', ');
}
