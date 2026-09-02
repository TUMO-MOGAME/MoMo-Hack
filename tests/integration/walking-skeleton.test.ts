/**
 * ⚠️ THE WALKING SKELETON (Phase 0) — the one test that touches everything.
 *
 * Every other test in this repo proves one layer in isolation. This one proves
 * they are actually joined: a real `requesttopay` against MTN's sandbox, a real
 * row in the production Postgres, resolution by the **deployed** function on
 * Vercel, and balanced double-entry postings at the end of it.
 *
 * It is the difference between "every part is built and tested" — which has
 * been true since PR #10 — and "money can move end to end", which had never
 * once been demonstrated.
 *
 * ── OPT-IN, AND WHY ──────────────────────────────────────────────────────────
 *
 * Gated behind `MOMO_SKELETON=1`, not just `DATABASE_URL`, because unlike every
 * other integration test here **this one cannot roll back**. `journal` and
 * `ledger_entry` are append-only by trigger, so a successful run leaves rows in
 * the production project permanently, by design — that is what it is proving.
 * A test with irreversible side effects must be asked for out loud.
 *
 * It also takes ~40s of wall clock (MTN's sandbox resolves this MSISDN after
 * about 25s) and spends sandbox money.
 *
 * ── ON THE BUDGET (CLAUDE.md #15) ────────────────────────────────────────────
 *
 * R1.00, against `MOMO_TARGET_ENVIRONMENT=sandbox`, where money is not real.
 * The test REFUSES to run against anything else — see the guard below. The live
 * budget is about R10 total and this file is not allowed to touch it.
 *
 *     MOMO_SKELETON=1 npx vitest run tests/integration/walking-skeleton.test.ts
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { connect, hasDb } from './_db';
import { createSandboxClient } from '@/lib/momo';
import { createSqlConnection } from '@/server/db/connection';
import { createPostgresMoneyDb } from '@/server/db/postgres';
import { initiateCollection } from '@/server/momo/initiate';

/** `momoAPIs.md` §10, rated **[V]**: `CREATED` → `SUCCESSFUL` after ~25s. */
const DEMO_MSISDN = '46733123454';

/** R1.00 in minor units. Sandbox money, but there is no reason to spend more. */
const AMOUNT_MINOR = 100n;

const optedIn = process.env.MOMO_SKELETON === '1';
const targetEnvironment = process.env.MOMO_TARGET_ENVIRONMENT ?? 'sandbox';
const host = process.env.MOMO_CALLBACK_HOST ?? 'momo.tumoolo.tech';
const cronSecret = process.env.CRON_SECRET;

const runnable = optedIn && hasDb && Boolean(process.env.MOMO_API_USER);

/**
 * Wall-clock, not compute. MTN takes ~25s to resolve, and every assertion query
 * is a round trip to eu-west-2.
 */
vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

describe.skipIf(!runnable)('walking skeleton — sandbox to ledger, through the deployment', () => {
  let client: Client;

  beforeAll(async () => {
    // A live environment is REAL MONEY and this test is not authorised to spend
    // it. Fail loudly rather than skip: a silent skip here would look like the
    // skeleton had been proved when it had not.
    if (targetEnvironment !== 'sandbox') {
      throw new Error(
        `refusing to run the skeleton against MOMO_TARGET_ENVIRONMENT=${targetEnvironment}. ` +
          'This test is sandbox-only (CLAUDE.md #15).',
      );
    }
    client = await connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  test('a real collection resolves through the deployed function and posts a balanced journal', async () => {
    // The real sandbox, built explicitly. `getMomoClient()` would honour
    // `MOMO_MODE`, which is `emulator` in .env.local — and a skeleton proved
    // against the emulator proves nothing at all.
    const momo = createSandboxClient();
    const db = createPostgresMoneyDb(createSqlConnection());

    // AIRTIME is the simplest real purpose: MOMO_SETTLEMENT is debited and
    // SUSPENSE credited, with no owner, driver, rank or split rule to resolve.
    // `ensureAccount` upserts both by natural key, so no seed data is needed.
    const subjectId = randomUUID();
    const externalId = `SKELETON-${Date.now()}`;

    const before = await sumLedger(client);

    // ── 1. Initiate. The row is durable BEFORE a packet leaves. ──────────────
    const started = await initiateCollection(
      { db, client: momo },
      {
        amountMinor: AMOUNT_MINOR,
        msisdn: DEMO_MSISDN,
        externalId,
        purpose: 'AIRTIME',
        subjectId,
        payerMessage: 'MoMo Kasi airtime',
        payeeNote: 'walking skeleton',
      },
    );

    // 202 Accepted moves INITIATED → CREATED (state-machine.ts, and the
    // undocumented `CREATED` status recorded in momoAPIs.md §12).
    expect(started.status).toBe('CREATED');
    expect(started.transactionId).toMatch(/^[0-9a-f-]{36}$/);

    const persisted = await row(client, started.transactionId);
    expect(persisted).not.toBeNull();
    expect(persisted.amount_minor).toBe(AMOUNT_MINOR.toString());
    expect(persisted.journal_id).toBeNull();

    // ── 2. Let MTN resolve, then make the DEPLOYED function do the work. ─────
    //
    // Two independent paths can resolve this and BOTH are exercised: MTN's
    // callback to https://<host>/api/momo/callback/collection, and the cron
    // route we poke below. Whichever wins, the other is a no-op — that is the
    // single-resolver guarantee in resolve.ts, and this is the first time it
    // has been exercised against a real deployment rather than a fake.
    const resolved = await until(
      async () => {
        await pokeDeployedReconciler();
        const r = await row(client, started.transactionId);
        return r.status === 'SUCCESSFUL' ? r : null;
      },
      { attempts: 15, everyMs: 5_000 },
    );

    expect(resolved).not.toBeNull();
    expect(resolved.status).toBe('SUCCESSFUL');

    // ── 3. The ledger consequence. ───────────────────────────────────────────
    expect(resolved.journal_id).not.toBeNull();

    const entries = await postings(client, resolved.journal_id);

    // Double entry: at least two postings, summing to exactly zero.
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.reduce((t, e) => t + BigInt(e.amount), 0n)).toBe(0n);

    // Money in: the settlement account is DEBITED, the destination CREDITED.
    const settlement = entries.find((e) => e.type === 'MOMO_SETTLEMENT');
    const suspense = entries.find((e) => e.type === 'SUSPENSE');
    expect(settlement?.amount).toBe(AMOUNT_MINOR.toString());
    expect(suspense?.amount).toBe((-AMOUNT_MINOR).toString());

    // And the global invariant still holds, over every row in the table —
    // not just the ones this test wrote.
    expect(await sumLedger(client)).toBe(0n);
    expect(await sumLedger(client)).toBe(before);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Ask the DEPLOYED cron route to run a tick.
 *
 * This is the point of the whole test: the reconciliation that closes the loop
 * happens on Vercel, in the function MTN can reach, not in this process.
 */
async function pokeDeployedReconciler(): Promise<void> {
  if (!cronSecret) return;
  try {
    await fetch(`https://${host}/api/cron/reconcile`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // A failed poke is not a failed test — MTN's callback may resolve it
    // anyway, and the next attempt tries again.
  }
}

async function until<T>(
  fn: () => Promise<T | null>,
  { attempts, everyMs }: { attempts: number; everyMs: number },
): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const result = await fn();
    if (result !== null) return result;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return null;
}

async function row(client: Client, id: string): Promise<any> {
  const r = await client.query(
    'select id, status::text, amount_minor::text, journal_id from momo_transaction where id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

async function postings(client: Client, journalId: string): Promise<any[]> {
  const r = await client.query(
    `select e.amount::text as amount, a.type::text as type
       from ledger_entry e join ledger_account a on a.id = e.account_id
      where e.journal_id = $1`,
    [journalId],
  );
  return r.rows;
}

/** Every posting in the table, summed. The one number that must always be 0. */
async function sumLedger(client: Client): Promise<bigint> {
  const r = await client.query('select coalesce(sum(amount), 0)::text as total from ledger_entry');
  return BigInt(r.rows[0].total);
}
