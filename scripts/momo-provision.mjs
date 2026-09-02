#!/usr/bin/env node
/**
 * Provision an MTN MoMo SANDBOX API user and key, then verify it.
 *
 * The portal gives you subscription keys. It does NOT give you an API user or an
 * API key — you generate a UUID yourself, register it, and exchange it for a
 * secret that is shown exactly once (momoAPIs.md §4). Doing that by hand means
 * three requests with fiddly headers, and the usual result is a 401 you cannot
 * explain. This does it for you and writes the result into .env.local.
 *
 *   node scripts/momo-provision.mjs
 *
 * Safe to re-run: it will not overwrite an existing MOMO_API_USER unless you
 * pass --force, because the API key is unrecoverable once lost.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { findEnvFile } from './_env.mjs';

// Resolved across worktrees — .env.local lives in exactly one of them, and we
// deliberately run agents in others (MISTAKES.md M4).
const envPath = findEnvFile();
const force = process.argv.includes('--force');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const die = (msg) => {
  console.error(`\n  ${c.red('✖')} ${msg}\n`);
  process.exit(1);
};

if (!envPath) die('.env.local not found in any worktree. Copy .env.example to .env.local first.');

const raw = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  raw
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const BASE = env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const CALLBACK_HOST = env.MOMO_CALLBACK_HOST || 'momo-kasi.vercel.app';
const SUB_KEY = env.MOMO_COLLECTION_SUBSCRIPTION_KEY;

console.log(`\n  ${c.bold('MoMo sandbox provisioning')}  ${c.dim(BASE)}\n`);

if (!SUB_KEY) {
  die(
    'MOMO_COLLECTION_SUBSCRIPTION_KEY is empty in .env.local.\n' +
      '    Get it: https://momodeveloper.mtn.com → sign in → Products → Collections\n' +
      '    → Subscribe → then Profile shows your primary key.',
  );
}

if (env.MOMO_API_USER && env.MOMO_API_KEY && !force) {
  console.log(`  ${c.green('✓')} MOMO_API_USER and MOMO_API_KEY are already set.`);
  console.log(`  ${c.dim('Verifying they still work…')}\n`);
  await verifyAll(env.MOMO_API_USER, env.MOMO_API_KEY);
  process.exit(0);
}

// ── Step 1: create the API user ──────────────────────────────────────────────
const apiUser = randomUUID();
console.log(`  ${c.dim('1/3')} Creating API user  ${c.dim(apiUser)}`);

const createRes = await fetch(`${BASE}/v1_0/apiuser`, {
  method: 'POST',
  headers: {
    'X-Reference-Id': apiUser,
    'Ocp-Apim-Subscription-Key': SUB_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ providerCallbackHost: CALLBACK_HOST }),
});

if (createRes.status !== 201) {
  const body = await createRes.text().catch(() => '');
  die(
    `Create API user returned ${createRes.status}, expected 201.\n` +
      `    ${body.slice(0, 300)}\n\n` +
      '    401 → the subscription key is wrong, or you have not subscribed to Collections.\n' +
      '    409 → that UUID already exists (re-run; a fresh one is generated each time).',
  );
}
console.log(`      ${c.green('201 Created')}`);

// ── Step 2: exchange it for an API key ───────────────────────────────────────
console.log(`  ${c.dim('2/3')} Generating API key ${c.dim('(shown once — this script saves it)')}`);

const keyRes = await fetch(`${BASE}/v1_0/apiuser/${apiUser}/apikey`, {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': SUB_KEY },
});

if (keyRes.status !== 201) {
  const body = await keyRes.text().catch(() => '');
  die(`Create API key returned ${keyRes.status}, expected 201.\n    ${body.slice(0, 300)}`);
}
const { apiKey } = await keyRes.json();
if (!apiKey) die('No apiKey in the response body.');
console.log(`      ${c.green('201 Created')}`);

// ── Step 3: verify a token against every product we subscribed to ────────────
console.log(`  ${c.dim('3/3')} Verifying access tokens\n`);
const ok = await verifyAll(apiUser, apiKey);

// ── Write back ───────────────────────────────────────────────────────────────
let out = raw;
const setKey = (k, v) =>
  (out = new RegExp(`^${k}=.*$`, 'm').test(out)
    ? out.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
    : `${out}\n${k}=${v}`);

setKey('MOMO_API_USER', apiUser);
setKey('MOMO_API_KEY', apiKey);
writeFileSync(envPath, out, 'utf8');

console.log(`\n  ${c.green('✓')} Written to ${c.dim('.env.local')}`);
console.log(`    MOMO_API_USER  ${c.dim(apiUser)}`);
console.log(`    MOMO_API_KEY   ${c.dim(apiKey.slice(0, 6) + '…' + apiKey.slice(-4))}`);
console.log(
  `\n  ${c.gold('Keep .env.local out of git.')} It is already gitignored, and this repo is public.\n`,
);
if (!ok) {
  console.log(
    `  ${c.gold('!')} At least one product failed to issue a token. Subscribe to it on the\n` +
      `    portal and paste its key into .env.local — you can re-run this with --force,\n` +
      `    but you do not need to: the API user works across all three products.\n`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
async function verifyAll(user, key) {
  const auth = Buffer.from(`${user}:${key}`).toString('base64');
  const products = [
    ['collection', env.MOMO_COLLECTION_SUBSCRIPTION_KEY],
    ['disbursement', env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY],
    ['remittance', env.MOMO_REMITTANCE_SUBSCRIPTION_KEY],
  ];

  let allOk = true;
  for (const [product, subKey] of products) {
    if (!subKey) {
      console.log(`      ${c.dim('–')} ${product.padEnd(13)} ${c.dim('no subscription key yet')}`);
      allOk = false;
      continue;
    }
    try {
      const r = await fetch(`${BASE}/${product}/token/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Ocp-Apim-Subscription-Key': subKey,
          'X-Target-Environment': env.MOMO_TARGET_ENVIRONMENT || 'sandbox',
        },
      });
      if (r.ok) {
        const { expires_in } = await r.json();
        console.log(
          `      ${c.green('✓')} ${product.padEnd(13)} token issued, expires in ${expires_in}s`,
        );
      } else {
        console.log(`      ${c.red('✖')} ${product.padEnd(13)} HTTP ${r.status}`);
        allOk = false;
      }
    } catch (e) {
      console.log(`      ${c.red('✖')} ${product.padEnd(13)} ${e.message}`);
      allOk = false;
    }
  }
  return allOk;
}
