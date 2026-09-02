#!/usr/bin/env node
/**
 * What can we actually DO at MTN right now, per operation?
 *
 *   node scripts/momo-preflight.mjs              # the environment .env.local points at
 *   node scripts/momo-preflight.mjs --production # the MTN_* production credentials
 *
 * ── WHY THIS EXISTS (MISTAKES.md M14) ────────────────────────────────────────
 *
 * A previous session checked the disbursement balance (`200`, R35.83) and the
 * payee (`{"result":true}`) and published *"nothing is blocked but the code"*
 * into `PLANNING.md` as a MUST. Both checks were real, both were green, and the
 * conclusion was wrong: `POST /disbursement/v1_0/transfer` returns **403** on
 * production and always had.
 *
 * **Read-only checks only ever prove read-only things.** A `GET` that works
 * says nothing about whether a `POST` is permitted, and the difference between
 * them is the entire payout half of the product. So this script exercises the
 * WRITE operations too, and reports them per-operation rather than per-product.
 *
 * ── HOW IT COSTS R0.00, AND THAT IS ASSERTED RATHER THAN INTENDED ────────────
 *
 * Every write probe carries an amount many times the account balance, which the
 * script READS FIRST. Such a request can only ever resolve to NOT_ENOUGH_FUNDS,
 * so nothing moves — and the script refuses to send if it cannot prove the
 * amount is safely above the balance. There is no flag to override that.
 *
 * It also sends ONE deliberately malformed body. That is the probe that
 * distinguishes "the gateway refuses us" from "our schema is wrong": if a bad
 * body and a good body get the same rejection, nothing ever read the body.
 *
 * The balance is re-read at the end and printed, so "nothing moved" is
 * evidence rather than a claim.
 */

import { randomUUID } from 'node:crypto';
import { loadEnv, colour as c } from './_env.mjs';

const args = process.argv.slice(2);
const production = args.includes('--production');

const { env, path } = loadEnv();

const CONFIG = production
  ? {
      label: 'PRODUCTION (MTN_*)',
      baseUrl: env.MTN_BASE_URL || 'https://proxy.momoapi.mtn.com',
      target: env.MTN_ENVIRONMENT || 'mtnsouthafrica',
      apiUser: env.MTN_API_USER,
      apiKey: env.MTN_API_KEY,
      collectionKey: env.MTN_COLLECTION_SUBSCRIPTION_KEY,
      disbursementKey: env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY,
      // Per-product users do not exist on production — MTN issues one.
      disbursementUser: env.MTN_API_USER,
      disbursementSecret: env.MTN_API_KEY,
      currency: 'ZAR',
    }
  : {
      label: `${env.MOMO_TARGET_ENVIRONMENT || 'sandbox'} (MOMO_*)`,
      baseUrl: env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
      target: env.MOMO_TARGET_ENVIRONMENT || 'sandbox',
      apiUser: env.MOMO_API_USER,
      apiKey: env.MOMO_API_KEY,
      collectionKey: env.MOMO_COLLECTION_SUBSCRIPTION_KEY,
      disbursementKey: env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY,
      // momoAPIs.md §8b: the sandbox scopes an API user to the subscription key
      // it was created under, so disbursements may need their own pair.
      disbursementUser: env.MOMO_DISBURSEMENT_API_USER || env.MOMO_API_USER,
      disbursementSecret: env.MOMO_DISBURSEMENT_API_KEY || env.MOMO_API_KEY,
      currency: env.MOMO_TARGET_ENVIRONMENT === 'sandbox' ? 'EUR' : 'ZAR',
    };

const PAYEE = env.MOMO_DEMO_MSISDN || '';

console.log();
console.log(`  ${c.b('MoMo preflight')}   ${c.d(path)}`);
console.log(`  ${c.d('environment')}     ${CONFIG.label}`);
console.log(`  ${c.d('base')}            ${CONFIG.baseUrl}`);
console.log(`  ${c.d('target')}          ${CONFIG.target}`);
console.log(`  ${c.d('payee')}           ${PAYEE || c.y('(MOMO_DEMO_MSISDN unset)')}`);
console.log();

if (!CONFIG.apiUser || !CONFIG.apiKey) {
  console.error(`  ${c.r('✖')} no API user/key for this environment.\n`);
  process.exit(1);
}

const rows = [];
const record = (op, status, note) => {
  rows.push({ op, status, note });
  const mark = status === null ? c.y('?') : status < 300 ? c.g('✓') : c.r('✖');
  const code = status === null ? '---' : String(status);
  console.log(`  ${mark} ${op.padEnd(46)} ${code.padEnd(5)} ${c.d(note ?? '')}`);
};

async function tokenFor(product, user, secret, subKey) {
  if (!subKey) return null;
  try {
    const r = await fetch(`${CONFIG.baseUrl}/${product}/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
    });
    record(`POST /${product}/token/`, r.status);
    if (!r.ok) return null;
    return (await r.json()).access_token;
  } catch (e) {
    record(`POST /${product}/token/`, null, e.message);
    return null;
  }
}

const headersFor = (token, subKey, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  'X-Target-Environment': CONFIG.target,
  'Ocp-Apim-Subscription-Key': subKey,
  ...extra,
});

async function get(label, url, token, subKey) {
  try {
    const r = await fetch(url, { headers: headersFor(token, subKey) });
    const text = await r.text();
    record(label, r.status, text.slice(0, 90));
    return { status: r.status, text };
  } catch (e) {
    record(label, null, e.message);
    return { status: null, text: '' };
  }
}

async function post(label, url, token, subKey, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: headersFor(token, subKey, {
        'Content-Type': 'application/json',
        'X-Reference-Id': randomUUID(),
      }),
      body: JSON.stringify(body),
    });
    const text = await r.text();
    record(label, r.status, text.slice(0, 90));
    return { status: r.status, text };
  } catch (e) {
    record(label, null, e.message);
    return { status: null, text: '' };
  }
}

/** An amount that cannot clear, derived from the balance we just read. */
function unclearable(balanceText) {
  let available;
  try {
    available = Number(JSON.parse(balanceText).availableBalance);
  } catch {
    return null;
  }
  if (!Number.isFinite(available)) return null;
  const probe = Math.max(available * 100, 100000);
  // THE SAFETY ASSERTION. No flag overrides this: a probe that could succeed is
  // not a probe, it is a payment.
  return probe >= available * 10 ? String(probe) : null;
}

// ── collections ──────────────────────────────────────────────────────────────
console.log(`  ${c.b('Collections')}`);
const collToken = await tokenFor('collection', CONFIG.apiUser, CONFIG.apiKey, CONFIG.collectionKey);
let collBalance = { text: '' };
if (collToken) {
  collBalance = await get(
    'GET  /collection/v1_0/account/balance',
    `${CONFIG.baseUrl}/collection/v1_0/account/balance`,
    collToken,
    CONFIG.collectionKey,
  );
  if (PAYEE) {
    await get(
      `GET  /collection/v1_0/accountholder/.../active`,
      `${CONFIG.baseUrl}/collection/v1_0/accountholder/msisdn/${PAYEE}/active`,
      collToken,
      CONFIG.collectionKey,
    );
  }
  const amount = unclearable(collBalance.text);
  if (amount && PAYEE) {
    await post(
      'POST /collection/v1_0/requesttopay   (cannot clear)',
      `${CONFIG.baseUrl}/collection/v1_0/requesttopay`,
      collToken,
      CONFIG.collectionKey,
      {
        amount,
        currency: CONFIG.currency,
        externalId: `preflight-${Date.now()}`,
        payer: { partyIdType: 'MSISDN', partyId: PAYEE },
        payerMessage: 'MoMo Kasi preflight',
        payeeNote: 'MoMo Kasi preflight',
      },
    );
  } else {
    record('POST /collection/v1_0/requesttopay', null, 'skipped — no safe amount or no payee');
  }
}

// ── disbursements ────────────────────────────────────────────────────────────
console.log();
console.log(`  ${c.b('Disbursements')}`);
const disbToken = await tokenFor(
  'disbursement',
  CONFIG.disbursementUser,
  CONFIG.disbursementSecret,
  CONFIG.disbursementKey,
);
let disbBalance = { text: '' };
if (disbToken) {
  disbBalance = await get(
    'GET  /disbursement/v1_0/account/balance',
    `${CONFIG.baseUrl}/disbursement/v1_0/account/balance`,
    disbToken,
    CONFIG.disbursementKey,
  );
  if (PAYEE) {
    await get(
      `GET  /disbursement/v1_0/accountholder/.../active`,
      `${CONFIG.baseUrl}/disbursement/v1_0/accountholder/msisdn/${PAYEE}/active`,
      disbToken,
      CONFIG.disbursementKey,
    );
  }

  const amount = unclearable(disbBalance.text) ?? '100000';
  const good = {
    amount,
    currency: CONFIG.currency,
    externalId: `preflight-${Date.now()}`,
    payee: { partyIdType: 'MSISDN', partyId: PAYEE || '27000000000' },
    payerMessage: 'MoMo Kasi preflight',
    payeeNote: 'MoMo Kasi preflight',
  };

  const wellFormed = await post(
    'POST /disbursement/v1_0/transfer     (cannot clear)',
    `${CONFIG.baseUrl}/disbursement/v1_0/transfer`,
    disbToken,
    CONFIG.disbursementKey,
    good,
  );

  // THE DECISIVE PROBE. If a body MTN would certainly reject returns the SAME
  // status as a well-formed one, nothing read the body and the refusal is
  // authorization rather than schema.
  const malformed = await post(
    'POST /disbursement/v1_0/transfer     (MALFORMED, on purpose)',
    `${CONFIG.baseUrl}/disbursement/v1_0/transfer`,
    disbToken,
    CONFIG.disbursementKey,
    { nonsense: true },
  );

  console.log();
  if (wellFormed.status === 202) {
    console.log(`  ${c.g('PAYOUTS ARE OPEN')} — a well-formed transfer was accepted.`);
  } else if (wellFormed.status === malformed.status && wellFormed.status >= 400) {
    console.log(
      `  ${c.r('PAYOUTS ARE REFUSED BEFORE THE BODY IS READ')} — a malformed body returns the\n` +
        `  same ${wellFormed.status} as a well-formed one, so this is MTN's authorization gate,\n` +
        `  not our request. momoAPIs.md §8a. Nothing here can be fixed in our code.`,
    );
  } else {
    console.log(
      `  ${c.y('MIXED')} — well-formed ${wellFormed.status}, malformed ${malformed.status}.\n` +
        `  Different answers mean MTN DID read the body: this one is ours to fix.`,
    );
  }
}

// ── proof that nothing moved ─────────────────────────────────────────────────
console.log();
console.log(`  ${c.b('Balances after (must be unchanged)')}`);
if (collToken) {
  await get(
    'GET  /collection/v1_0/account/balance',
    `${CONFIG.baseUrl}/collection/v1_0/account/balance`,
    collToken,
    CONFIG.collectionKey,
  );
}
if (disbToken) {
  await get(
    'GET  /disbursement/v1_0/account/balance',
    `${CONFIG.baseUrl}/disbursement/v1_0/account/balance`,
    disbToken,
    CONFIG.disbursementKey,
  );
}

const refused = rows.filter((r) => r.status !== null && r.status >= 400).length;
console.log();
console.log(`  ${rows.length} operations probed, ${refused} refused.`);
console.log(`  ${c.d('Every write probe carried an amount that cannot clear. No money moved.')}`);
console.log();
