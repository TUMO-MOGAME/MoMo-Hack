/**
 * MTN MoMo sandbox test numbers.
 *
 * [V] VERIFIED against the live sandbox on 2026-09-02 with
 * `node scripts/momo-smoke.mjs`, then polled for 40 seconds per number.
 *
 * FOUR OF SIX DOCUMENTED OUTCOMES WERE WRONG. The names below describe what
 * these numbers ACTUALLY do, not what secondary sources claimed. See
 * momoAPIs.md §10 for the full comparison.
 *
 * WHY THIS FILE EXISTS, AND WHY A LINT RULE POINTS AT IT:
 * any number not listed here returns SUCCESSFUL immediately. A test written
 * with a made-up number is a test that cannot fail — it passes whether or not
 * our failure handling works at all. Test files may only use these constants.
 */

export const TEST_MSISDN = {
  /** Resolves to FAILED immediately. The failure path. */
  FAILS_FAST: '46733123450',

  /**
   * Also FAILED. Documented as REJECTED, but the sandbox returns FAILED.
   * Kept so the mapping is visible rather than silently dropped.
   */
  ALSO_FAILS: '46733123451',

  /**
   * Also FAILED. Documented as TIMEOUT, but the sandbox returns FAILED.
   */
  ALSO_FAILS_2: '46733123452',

  /**
   * Enters PENDING and STAYS there — still pending after 40 seconds.
   * Use this to exercise the reconciler, the stuck-transaction sweep, and any
   * timeout handling. It is the only way to test a transaction that never
   * settles.
   */
  STAYS_PENDING: '46733123453',

  /**
   * CREATED -> SUCCESSFUL after roughly 25 seconds.
   *
   * THE DEMO NUMBER. The only one that exercises the real asynchronous flow:
   * request accepted, status CREATED, poll, then SUCCESSFUL. That ~25s window
   * is what the live console exists to show (docs/08 §3). Demoing with a random
   * number resolves instantly and proves nothing.
   */
  ASYNC_SUCCESS: '46733123454',
} as const;

export type TestMsisdn = (typeof TEST_MSISDN)[keyof typeof TEST_MSISDN];

export const ALL_TEST_MSISDNS: readonly string[] = Object.values(TEST_MSISDN);

/**
 * Sandbox statuses we have actually observed, in order of appearance.
 *
 * `CREATED` is NOT in MTN's documented vocabulary but the sandbox emits it —
 * a state machine that rejects it will mishandle the one number that
 * demonstrates asynchronous resolution.
 *
 * `REJECTED` and `TIMEOUT` are documented but appear UNREACHABLE in sandbox:
 * both numbers said to produce them return FAILED. They are modelled because
 * production may emit them, and they can only be exercised via the emulator.
 */
export const OBSERVED_STATUSES = ['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED'] as const;
export const MODELLED_ONLY_STATUSES = ['REJECTED', 'TIMEOUT'] as const;

/**
 * True for a number whose sandbox outcome is CHOSEN rather than incidental.
 * Anything else always succeeds, which makes it useless for a negative test.
 */
export function isDeterministic(msisdn: string): boolean {
  return ALL_TEST_MSISDNS.includes(msisdn);
}

/**
 * Mask for logs and UI. Never log or display a full MSISDN — POPIA s105/106
 * (docs/14 §5).
 */
export function maskMsisdn(msisdn: string): string {
  return `•••• ${msisdn.slice(-4)}`;
}
