#!/usr/bin/env node
/**
 * End-to-end smoke test against the live MTN MoMo sandbox.
 *
 * Two jobs:
 *   1. "Is the sandbox up, and do our credentials work right now?" — the check
 *      to run before a demo (docs/08 §2).
 *   2. Confirm the sandbox test MSISDN table, which momoAPIs.md §10 rates [P]
 *      (probable, from secondary sources). Every negative-path test we write
 *      depends on these numbers behaving as documented, so this promotes them
 *      to [V] or tells us they are wrong.
 *
 *   node scripts/momo-smoke.mjs
 *
 * Sends real requestToPay calls to the SANDBOX. No real money exists there.
 */

import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Mirrored from src/lib/momo/test-msisdns.ts — plain node cannot import a .ts
// module. If that file changes, change this. The whole point of this script is
// to check whether these numbers behave as documented.
const TEST_MSISDN = {
  FAILED: '46733123450',
  REJECTED: '46733123451',
  TIMEOUT: '46733123452',
  SUCCESS: '46733123453',
  PENDING: '46733123454',
};

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const envPath = join(root, '.env.local');
if (!existsSync(envPath)) {
  console.error('\n  .env.local not found.\n');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

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

// ── the documented outcomes we are checking ─────────────────────────────────
const CASES = [
  ['SUCCESS', TEST_MSISDN.SUCCESS, 'SUCCESSFUL'],
  ['FAILED', TEST_MSISDN.FAILED, 'FAILED'],
  ['REJECTED', TEST_MSISDN.REJECTED, 'REJECTED'],
  ['TIMEOUT', TEST_MSISDN.TIMEOUT, 'TIMEOUT'],
  ['PENDING', TEST_MSISDN.PENDING, 'PENDING'],
  ['random (undocumented)', '260970000001', 'SUCCESSFUL'],
];

console.log(`  ${'label'.padEnd(22)} ${'msisdn'.padEnd(14)} ${'expected'.padEnd(12)} actual`);
console.log(`  ${d('─'.repeat(66))}`);

let mismatches = 0;
let hardFail = false;

for (const [label, msisdn, expected] of CASES) {
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
      `  ${label.padEnd(22)} ${msisdn.padEnd(14)} ${expected.padEnd(12)} ${r(`POST ${pay.status}`)} ${d(body.slice(0, 60))}`,
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
    console.log(`  ${label.padEnd(22)} ${msisdn.padEnd(14)} ${expected.padEnd(12)} ${r(`GET ${st.status}`)}`);
    hardFail = true;
    continue;
  }

  const body = await st.json();
  const actual = body.status || '(none)';
  const match = actual === expected;
  if (!match) mismatches++;

  console.log(
    `  ${label.padEnd(22)} ${msisdn.padEnd(14)} ${expected.padEnd(12)} ${match ? g(actual) : y(actual)}`,
  );
}

// ── idempotency: the same X-Reference-Id twice must not create two payments ──
console.log(`\n  ${d('─'.repeat(66))}`);
const dupeRef = randomUUID();
const body = JSON.stringify({
  amount: '5.00',
  currency: 'EUR',
  externalId: `dupe-${Date.now()}`,
  payer: { partyIdType: 'MSISDN', partyId: TEST_MSISDN.SUCCESS },
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
const first = await fetch(`${BASE}/collection/v1_0/requesttopay`, { method: 'POST', headers, body });
const second = await fetch(`${BASE}/collection/v1_0/requesttopay`, { method: 'POST', headers, body });
const dupeOk = first.status === 202 && second.status === 409;
console.log(
  `  ${'idempotency (same ref)'.padEnd(22)} ${''.padEnd(14)} ${'202 then 409'.padEnd(12)} ` +
    `${dupeOk ? g(`${first.status} then ${second.status}`) : y(`${first.status} then ${second.status}`)}`,
);

// ── verdict ──────────────────────────────────────────────────────────────────
console.log();
if (hardFail) {
  console.log(`  ${r('✖')} The sandbox rejected at least one request. Credentials or sandbox are unhealthy.\n`);
  process.exit(1);
}
if (mismatches) {
  console.log(
    `  ${y('!')} ${mismatches} MSISDN outcome(s) differed from momoAPIs.md §10.\n` +
      `    Update that table with what you actually observed — the negative-path tests depend on it.\n`,
  );
  process.exit(0);
}
console.log(`  ${g('✓')} Sandbox healthy. Test MSISDNs behave exactly as documented.\n`);
