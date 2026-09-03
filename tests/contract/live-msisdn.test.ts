import { describe, expect, test } from 'vitest';
// @ts-expect-error — a plain .mjs script module with no type declarations.
import { liveMsisdnProblem, SANDBOX_FIXTURE_MSISDN } from '../../scripts/_msisdn.mjs';

/**
 * The payer a LIVE MoMo push is allowed to charge.
 *
 * Every rule here is a measured production response, taken read-only against
 * `GET /collection/v1_0/accountholder/msisdn/{n}/active` on 2026-09-03 — not a
 * guess about what MTN probably wants:
 *
 *     27767223145   -> 200 {"result":true}
 *     0767223145    -> 200 {"result":false}
 *     +27767223145  -> 400
 *     46733123454   -> the sandbox fixture; not a wallet on production
 *
 * ── WHY THIS IS TESTED AND NOT JUST WRITTEN ─────────────────────────────────
 *
 * The check lived inline in `vercel-env.mjs`, where the only way to exercise it
 * was to doctor a real `.env.local` and run a deploy script — which is exactly
 * how a guard ends up never being exercised at all. Extracting it made the
 * decision a pure function; this file is the point of having done so.
 */

const REAL = '27767223145';

describe('a live push refuses a payer that cannot receive', () => {
  test('the sandbox fixture is refused, by name', () => {
    // The one that would actually have shipped: it is the fallback in
    // `vercel-env.mjs` and the value sitting in `.env.local`.
    const problem = liveMsisdnProblem(SANDBOX_FIXTURE_MSISDN);
    expect(problem).toBeTruthy();
    expect(problem).toContain(SANDBOX_FIXTURE_MSISDN);
    expect(problem).toContain('PAYER_NOT_FOUND');
  });

  test('unset is refused, and reads as unset rather than as empty', () => {
    for (const value of [undefined, '', '   ']) {
      const problem = liveMsisdnProblem(value);
      expect(problem).toBeTruthy();
      expect(problem).toContain('(unset)');
    }
  });

  test('a leading + is refused — MTN 400s before it looks the number up', () => {
    const problem = liveMsisdnProblem(`+${REAL}`);
    expect(problem).toBeTruthy();
    expect(problem).toContain('digits only');
  });

  test('local 0… format is refused, and the message shows the conversion', () => {
    // The form a South African actually writes. The refusal has to teach, or
    // the next person retypes the same thing.
    const problem = liveMsisdnProblem('0767223145');
    expect(problem).toBeTruthy();
    expect(problem).toContain('local format');
    expect(problem).toContain('27767223145');
  });

  test('spaces and punctuation are refused', () => {
    for (const value of ['27 76 722 3145', '27-767-223-145', '27767223145 ']) {
      // The trailing-space case must pass: it is trimmed, not rejected.
      const problem = liveMsisdnProblem(value);
      if (value.trim() === REAL) expect(problem).toBeNull();
      else expect(problem).toBeTruthy();
    }
  });

  test('the real number passes', () => {
    expect(liveMsisdnProblem(REAL)).toBeNull();
  });

  test('a well-formed WRONG number also passes, and that is the honest limit', () => {
    // `27767221345` is the real number with 31/13 transposed. It is what
    // MISTAKES.md M13's five failed payments were sent to, and it is perfectly
    // well-formed — so this guard cannot catch it, and nothing at this layer
    // could. Asserted so nobody reads a silent pass as "verified".
    expect(liveMsisdnProblem('27767221345')).toBeNull();
  });
});
