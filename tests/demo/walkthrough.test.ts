/**
 * THE DEMO. `npm run demo`.
 *
 * One command that tells the whole story on a projector, in order:
 *
 *   1. The split engine   — pure, offline, exact. No network, no database.
 *   2. A real payment     — through the MoMo client this build actually uses.
 *   3. The ledger         — double-entry, balancing to zero.
 *   4. The invariant      — every posting ever written, summed.
 *
 * ── IT ADAPTS, AND IT SAYS SO ────────────────────────────────────────────────
 *
 * The demo reads its own environment and prints it, because standing in front
 * of judges claiming "this is live" while an emulator answers is the one
 * unrecoverable mistake. Whatever it is doing, the header says so:
 *
 *   MOMO_MODE=emulator   recorded responses, offline, deterministic (ADR-0009)
 *   MOMO_MODE=sandbox    the real MTN sandbox
 *
 * ── AMOUNTS AND THE LIVE BUDGET (CLAUDE.md #15) ──────────────────────────────
 *
 * Against a non-sandbox `MOMO_TARGET_ENVIRONMENT` every rand is real, the whole
 * testing budget is about R10, and `budget.ts` caps a transaction at R1.00 —
 * in the EMULATOR too, since it shares `toMomoAmount`. So the demo pays R12.50
 * on sandbox and R1.00 when live, automatically, and never trips its own guard
 * on stage.
 *
 * The SPLIT is shown at R12.50 either way: it is a pure function, it touches no
 * money, and R12.50 is the figure the pitch quotes.
 *
 * ── WHY THE PAYMENT IS `AIRTIME` AND NOT `FARE` ──────────────────────────────
 *
 * Honesty, and it is worth saying out loud if asked. `resolveTransaction`'s
 * default context supplies only `subjectId`, while the fare split needs
 * ownerId + driverId + rankId — so the reconciler cannot resolve a FARE yet
 * (M6b, STATUS.md). The split is therefore demonstrated BESIDE the payment
 * rather than through it. Both halves are real; they are not yet joined.
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { connect, hasDb } from '../integration/_db';
import { DEFAULT_FARE_SPLIT, split } from '@/domain/split';
import { minor } from '@/domain/money';
import { formatZAR, type Posting } from '@/domain/money';

/** `formatZAR` takes the branded ledger type; these are ledger amounts. */
const zar = (v: bigint) => formatZAR(v as Posting);
import { getMomoClient, readMomoConfig, readMomoMode } from '@/lib/momo';
import { createSqlConnection } from '@/server/db/connection';
import { createPostgresMoneyDb } from '@/server/db/postgres';
import { initiateCollection } from '@/server/momo/initiate';
import { reconcile } from '@/server/momo/reconcile';

const w = (s = '') => process.stdout.write(`${s}\n`);
const rule = (c = '─') => w(`  ${c.repeat(66)}`);

const DEMO_MSISDN = process.env.MOMO_DEMO_MSISDN ?? '46733123454';
const runnable = process.env.MOMO_DEMO === '1' && hasDb;

vi.setConfig({ testTimeout: 240_000, hookTimeout: 60_000 });

describe.skipIf(!runnable)('MoMo Kasi — live demonstration', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  test('money moves, and the ledger balances', async () => {
    const cfg = readMomoConfig();
    const mode = readMomoMode();
    const live = cfg.targetEnvironment !== 'sandbox';

    // R12.50 is the pitch figure. Against a live environment the cap is R1.00
    // and the guard fires in the emulator too, so drop rather than throw.
    const payMinor = live ? 100n : 1250n;

    w();
    rule('═');
    w('   MoMo Kasi — money that moves, and a ledger that cannot be wrong');
    rule('═');
    w(
      `   client        ${mode === 'emulator' ? 'EMULATOR (recorded, offline)' : 'MTN sandbox (live API)'}`,
    );
    w(
      `   environment   ${cfg.targetEnvironment}${live ? '   ⚠ REAL MONEY — R1.00 cap in force' : '   (sandbox money is not real)'}`,
    );
    w(`   callback host ${cfg.callbackHost ?? '(none — reconciler only)'}`);
    w();

    // ── 1. The split engine ────────────────────────────────────────────────
    w('  1  THE SPLIT ENGINE          pure · offline · integer cents · exact');
    rule();
    const fare = 1250n;
    const parts = split(minor(fare), DEFAULT_FARE_SPLIT);
    const label: Record<string, string> = {
      OWNER: 'taxi owner',
      DRIVER_FLOAT: 'driver float',
      FUEL_POOL: 'rank fuel pool',
      INSURANCE_POOL: 'rank insurance',
    };
    w(`     a ${zar(fare)} taxi fare, split 60 / 25 / 10 / 5`);
    w();
    for (const p of parts) {
      const note = p.key === 'DRIVER_FLOAT' ? '  ← takes the remainder cent' : '';
      w(`       ${(label[p.key] ?? p.key).padEnd(18)} ${zar(p.amount).padStart(8)}${note}`);
    }
    const sum = parts.reduce((t, p) => t + p.amount, 0n);
    w(`       ${'─'.repeat(18)} ${'─'.repeat(8)}`);
    w(
      `       ${'sum'.padEnd(18)} ${zar(sum).padStart(8)}   ${sum === fare ? 'EXACT — no cent invented, none lost' : 'MISMATCH'}`,
    );
    expect(sum).toBe(fare);
    w();
    w('     Not floating point. Never floating point. 5,000+ generated cases');
    w('     assert this sums exactly, at every amount.');
    w();

    // ── 2. A real payment ──────────────────────────────────────────────────
    w(`  2  A REAL PAYMENT             ${zar(payMinor)} to ${DEMO_MSISDN}`);
    rule();
    const started = await initiateCollection(
      { db: createPostgresMoneyDb(createSqlConnection()), client: getMomoClient() },
      {
        amountMinor: payMinor,
        msisdn: DEMO_MSISDN,
        externalId: `DEMO-${Date.now()}`,
        purpose: 'AIRTIME',
        subjectId: randomUUID(),
        payerMessage: 'MoMo Kasi',
        payeeNote: 'demo',
      },
    );
    w(`     → requesttopay      ref ${started.transactionId.slice(0, 8)}…`);
    w(`     ← MTN accepted      status ${started.status}`);
    w();
    w('     The row was durable BEFORE the packet left, and our primary key IS');
    w("     MTN's idempotency key — so a retry can never pay twice.");
    w();

    // ── 3. Resolution and the ledger ───────────────────────────────────────
    w('  3  RESOLUTION                 the reconciler, not the caller');
    rule();
    const deps = {
      db: createPostgresMoneyDb(createSqlConnection()),
      client: getMomoClient(),
    };
    let row: Record<string, unknown> | null = null;
    for (let i = 0; i < 24; i++) {
      const report = await reconcile(deps);
      row = await one(client, started.transactionId);
      if (row?.status === 'SUCCESSFUL') {
        w(`     ← resolved          examined ${report.examined}, resolved ${report.resolved}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    expect(row?.status).toBe('SUCCESSFUL');
    w();

    w('  4  THE LEDGER                 double entry, enforced by Postgres');
    rule();
    const postings = await entries(client, String(row?.journal_id));
    for (const p of postings) {
      const amt = BigInt(p.amount);
      w(
        `       ${p.type.padEnd(18)} ${(amt > 0n ? '+' : '') + zar(amt)}`.padEnd(40) +
          (amt > 0n ? 'debit  — money we now hold at MTN' : 'credit — what we owe'),
      );
    }
    const jsum = postings.reduce((t, p) => t + BigInt(p.amount), 0n);
    w(`       ${'─'.repeat(18)} ${'─'.repeat(8)}`);
    w(
      `       ${'sum'.padEnd(18)} ${zar(jsum).padStart(8)}   ${jsum === 0n ? 'BALANCED' : 'UNBALANCED'}`,
    );
    expect(jsum).toBe(0n);
    w();

    // ── 4. The invariant, over everything ──────────────────────────────────
    w('  5  THE INVARIANT              every posting ever written');
    rule();
    const g = await client.query(
      'select coalesce(sum(amount),0)::text total, count(*)::text n from ledger_entry',
    );
    const total = BigInt(g.rows[0].total);
    w(`       ${g.rows[0].n} postings in the database, summing to ${total}`);
    w();
    w('     This is not checked by our code. It is checked by a DEFERRABLE');
    w('     trigger inside Postgres, at COMMIT. An unbalanced journal cannot be');
    w('     written — not by a bug, not by a race, not by an agent.');
    expect(total).toBe(0n);
    w();
    rule('═');
    w();
  });
});

async function one(client: Client, id: string): Promise<any> {
  const r = await client.query(
    'select status::text, journal_id from momo_transaction where id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

async function entries(client: Client, journalId: string): Promise<any[]> {
  const r = await client.query(
    `select e.amount::text as amount, a.type::text as type
       from ledger_entry e join ledger_account a on a.id = e.account_id
      where e.journal_id = $1 order by e.amount desc`,
    [journalId],
  );
  return r.rows;
}
