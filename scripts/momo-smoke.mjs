#!/usr/bin/env node
/**
 * End-to-end smoke test against the live MTN MoMo sandbox.
 *
 * Two jobs:
 *   1. "Is the sandbox up, and do our credentials work right now?" — the check
 *      to run before a demo (docs/08 §2).
 *   2. Re-confirm the sandbox test MSISDN table. It is now [V] — measured, and
 *      four of MTN's six documented outcomes were wrong (momoAPIs.md §10). So a
 *      mismatch here no longer means "update the doc"; it means the SANDBOX has
 *      changed under us, and the negative-path tests that depend on these
 *      numbers need re-checking.
 *
 *   node scripts/momo-smoke.mjs
 *
 * Sends real requestToPay calls to the SANDBOX. No real money exists there.
 */

import { randomUUID } from 'node:crypto';
import { loadEnv } from './_env.mjs';
// Mirrored from src/lib/momo/test-msisdns.ts — plain node cannot import a .ts
// module. If that file changes, change this.
//
// These names and expectations are the MEASURED ones (momoAPIs.md §10, [V]
// 2026-09-02), not MTN's documented ones — four of which are wrong. The mirror
// was not updated when #5 corrected the table, so this script reported "4
// outcomes differed" on every run while the doc and the code were both right.
// A smoke test that always warns is a smoke test nobody reads.
const TEST_MSISDN = {
  FAILS_FAST: '46733123450',
  ALSO_FAILS: '46733123451',
  ALSO_FAILS_2: '46733123452',
  STAYS_PENDING: '46733123453',
  ASYNC_SUCCESS: '46733123454',
};

// This is what the `loadEnv` import was always for. #9 added the import and the
// worktree-aware loader but left the old inline copy in place, and the inline
// copy referenced `resolve`, `join`, `existsSync` and `readFileSync` whose
// imports had gone with it — so this script died with `ReferenceError: resolve
// is not defined` before it read a single credential. Nothing ran it again
// after the refactor, and nothing could have told us: it is not in CI.
//
// `loadEnv` also searches every git worktree, so `npm run check:momo` now works
// from the chore tree, where `.env.local` does not live.
const { env } = loadEnv();

const BASE = env.MOMO_BASE_URL;
const TARGET = env.MOMO_TARGET_ENVIRONMENT || 'sandbox';
const SUB = env.MOMO_COLLECTION_SUBSCRIPTION_KEY;
const AUTH = Buffer.from(`${env.MOMO_API_USER}:${env.MOMO_API_KEY}`).toString('base64');

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

console.log(`\n  MoMo sandbox smoke test  ${d(BASE)}\n`);

// ── token ────────────────────────────────────────────────────────────────────
const tokRes = await fetch(`${BASE}/collection/token/`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${AUTH}`,
    'Ocp-Apim-Subscription-Key': SUB,
    'X-Target-Environment': TARGET,
  },
});
if (!tokRes.ok) {
  console.error(`  ${r('✖')} token: HTTP ${tokRes.status}\n`);
  process.exit(1);
}
const { access_token, expires_in } = await tokRes.json();
console.log(`  ${g('✓')} access token  ${d(`expires in ${expires_in}s`)}\n`);

// ── the MEASURED outcomes we are checking (momoAPIs.md §10, [V]) ────────────
//
// Each case lists every status we accept. Only ASYNC_SUCCESS has more than one:
// it resolves CREATED -> SUCCESSFUL in about 25 seconds, so which of the two we
// land on depends on where the poll window closes. Both are correct; treating
// either as a mismatch is what made this script noise.
const CASES = [
  ['STAYS_PENDING', TEST_MSISDN.STAYS_PENDING, ['PENDING']],
  ['FAILS_FAST', TEST_MSISDN.FAILS_FAST, ['FAILED']],
  ['ALSO_FAILS (doc: REJECTED)', TEST_MSISDN.ALSO_FAILS, ['FAILED']],
  ['ALSO_FAILS_2 (doc: TIMEOUT)', TEST_MSISDN.ALSO_FAILS_2, ['FAILED']],
  ['ASYNC_SUCCESS — the demo', TEST_MSISDN.ASYNC_SUCCESS, ['CREATED', 'SUCCESSFUL']],
  ['random (undocumented)', '260970000001', ['SUCCESSFUL']],
];

console.log(`  ${'label'.padEnd(28)} ${'msisdn'.padEnd(14)} ${'accepted'.padEnd(22)} actual`);
console.log(`  ${d('─'.repeat(66))}`);

let mismatches = 0;
let hardFail = false;

for (const [label, msisdn, expected] of CASES) {
  const show = expected.join('/');
  const ref = randomUUID();

  const pay = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Ocp-Apim-Subscription-Key': SUB,
      'X-Target-Environment': TARGET,
      'X-Reference-Id': ref,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: '12.50',
      currency: 'EUR', // sandbox is EUR-only — the shim, momoAPIs.md §11
      externalId: `smoke-${Date.now()}`,
      payer: { partyIdType: 'MSISDN', partyId: msisdn },
      payerMessage: 'MoMo Kasi smoke test',
      payeeNote: 'smoke',
    }),
  });

  if (pay.status !== 202) {
    const body = await pay.text().catch(() => '');
    console.log(
      `  ${label.padEnd(28)} ${msisdn.padEnd(14)} ${show.padEnd(22)} ${r(`POST ${pay.status}`)} ${d(body.slice(0, 60))}`,
    );
    hardFail = true;
    continue;
  }

  await sleep(1200); // give the sandbox a moment to settle

  const st = await fetch(`${BASE}/collection/v1_0/requesttopay/${ref}`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Ocp-Apim-Subscription-Key': SUB,
      'X-Target-Environment': TARGET,
    },
  });

  if (!st.ok) {
    console.log(
      `  ${label.padEnd(28)} ${msisdn.padEnd(14)} ${show.padEnd(22)} ${r(`GET ${st.status}`)}`,
    );
    hardFail = true;
    continue;
  }

  const body = await st.json();
  const actual = body.status || '(none)';
  const match = expected.includes(actual);
  if (!match) mismatches++;

  console.log(
    `  ${label.padEnd(28)} ${msisdn.padEnd(14)} ${show.padEnd(22)} ${match ? g(actual) : y(actual)}`,
  );
}

// ── idempotency: the same X-Reference-Id twice must not create two payments ──
console.log(`\n  ${d('─'.repeat(66))}`);
const dupeRef = randomUUID();
const body = JSON.stringify({
  amount: '5.00',
  currency: 'EUR',
  externalId: `dupe-${Date.now()}`,
  payer: { partyIdType: 'MSISDN', partyId: TEST_MSISDN.ASYNC_SUCCESS },
  payerMessage: 'idempotency check',
  payeeNote: 'dupe',
});
const headers = {
  Authorization: `Bearer ${access_token}`,
  'Ocp-Apim-Subscription-Key': SUB,
  'X-Target-Environment': TARGET,
  'X-Reference-Id': dupeRef,
  'Content-Type': 'application/json',
};
const first = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
  method: 'POST',
  headers,
  body,
});
const second = await fetch(`${BASE}/collection/v1_0/requesttopay`, {
  method: 'POST',
  headers,
  body,
});
const dupeOk = first.status === 202 && second.status === 409;
console.log(
  `  ${'idempotency (same ref)'.padEnd(22)} ${''.padEnd(14)} ${'202 then 409'.padEnd(12)} ` +
    `${dupeOk ? g(`${first.status} then ${second.status}`) : y(`${first.status} then ${second.status}`)}`,
);

// ── verdict ──────────────────────────────────────────────────────────────────
console.log();
if (hardFail) {
  console.log(
    `  ${r('✖')} The sandbox rejected at least one request. Credentials or sandbox are unhealthy.\n`,
  );
  process.exit(1);
}
if (mismatches) {
  console.log(
    `  ${y('!')} ${mismatches} MSISDN outcome(s) differed from momoAPIs.md §10.\n` +
      `    That table is [V] — measured, not assumed — so this means the SANDBOX\n` +
      `    changed. Re-measure, then update §10 AND src/lib/momo/test-msisdns.ts\n` +
      `    AND the mirror at the top of this file, in the same PR.\n`,
  );
  process.exit(0);
}
console.log(`  ${g('✓')} Sandbox healthy. Test MSISDNs behave exactly as documented.\n`);
