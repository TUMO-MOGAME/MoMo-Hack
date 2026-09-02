/**
 * MTN MoMo sandbox test numbers (momoAPIs.md §10).
 *
 * WHY THIS FILE EXISTS, AND WHY A LINT RULE POINTS AT IT:
 *
 * In the sandbox, ANY number not on this list ALWAYS returns SUCCESSFUL.
 * So a test written with a made-up number is a test that cannot fail — it
 * passes whether or not our failure handling works at all.
 *
 * Test files may only use MSISDNs from this file. Enforced in CI.
 *
 * Rating: [P] — reported consistently by multiple developers, NOT yet confirmed
 * against the portal. Day 1 task (momoAPIs.md §14). If SUCCESS below does not
 * behave, try the '5' leading variant and update momoAPIs.md.
 */

export const TEST_MSISDN = {
  /** Resolves to FAILED. */
  FAILED: '46733123450',
  /** Resolves to REJECTED — the payer declined. */
  REJECTED: '46733123451',
  /** Resolves to TIMEOUT — the payer never responded. */
  TIMEOUT: '46733123452',
  /** Resolves to SUCCESSFUL. */
  SUCCESS: '46733123453',
  /** Stays PENDING. */
  PENDING: '46733123454',
} as const;

export type TestMsisdn = (typeof TEST_MSISDN)[keyof typeof TEST_MSISDN];

export const ALL_TEST_MSISDNS: readonly string[] = Object.values(TEST_MSISDN);

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
  const tail = msisdn.slice(-4);
  return `•••• ${tail}`;
}
