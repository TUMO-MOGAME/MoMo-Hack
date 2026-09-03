/**
 * Is this MSISDN usable as the payer on a LIVE MoMo push?
 *
 * Pulled out of `vercel-env.mjs` so the decision can be tested rather than
 * eyeballed. The rules below are not style preferences — each one is a measured
 * production response, taken read-only against
 * `GET /collection/v1_0/accountholder/msisdn/{n}/active` on 2026-09-03:
 *
 *     27767223145   -> 200 {"result":true}     international, no +
 *     0767223145    -> 200 {"result":false}    local format
 *     +27767223145  -> 400                     the + is rejected before lookup
 *     46733123454   -> the SANDBOX fixture, not a wallet on production
 *
 * The class this catches is malformed numbers. It cannot catch a well-formed
 * WRONG number, and nothing can — `MISTAKES.md` M13 was five failed payments
 * against `27767221345`, which is the real number with two digits transposed
 * and is perfectly well-formed. That is why the message for a valid-looking
 * number says nothing reassuring: silence here is "not obviously broken", not
 * "correct".
 */

/** MTN's sandbox test number. Auto-resolves on sandbox; not a wallet on production. */
export const SANDBOX_FIXTURE_MSISDN = '46733123454';

/**
 * Returns a human-readable problem string, or `null` when there is nothing
 * obviously wrong.
 *
 * Only meaningful for a live push — sandbox WANTS the fixture, so the caller
 * checks the environment before calling.
 */
export function liveMsisdnProblem(msisdn) {
  const value = (msisdn ?? '').trim();

  if (!value || value === SANDBOX_FIXTURE_MSISDN) {
    return (
      `MOMO_DEMO_MSISDN is "${value || '(unset)'}" and this is a LIVE push.\n` +
      `      ${SANDBOX_FIXTURE_MSISDN} is MTN's SANDBOX fixture and is not a registered\n` +
      '      wallet on production, so every /pay would return PAYER_NOT_FOUND.\n' +
      '      Set the real payer in .env.local, international with no + (e.g. 27767223145).'
    );
  }

  if (value.startsWith('+') || !/^[0-9]+$/.test(value)) {
    return (
      `MOMO_DEMO_MSISDN "${value}" must be digits only — no +, no spaces.\n` +
      '      Measured: a leading + is a 400 from MTN before the number is even looked up.'
    );
  }

  if (value.startsWith('0')) {
    return (
      `MOMO_DEMO_MSISDN "${value}" is in local format.\n` +
      '      MoMo needs the country code and no +: 0767223145 becomes 27767223145.\n' +
      '      Measured: the local form returns {"result":false} from accountholder/active.'
    );
  }

  return null;
}
