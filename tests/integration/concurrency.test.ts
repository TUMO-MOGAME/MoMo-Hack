/**
 * Concurrency, against real Postgres. This is Phase 3's exit criterion —
 * "the ledger always balances, UNDER CONCURRENCY" — and it is the one claim the
 * in-memory suite structurally cannot make, because a single-threaded fake has
 * no two connections to race.
 *
 * Two different questions are asked here, and they have different answers:
 *
 *   1. Can two resolvers both settle the SAME transaction? No — `claimTransition`
 *      takes `select ... for update`, so the second blocks until the first
 *      commits and then finds nothing left to claim. Tested by blocking, with
 *      no writes committed.
 *
 *   2. Can two transactions each spend from the SAME account and both pass the
 *      overdraft check? This one is genuinely open. I3 is a DEFERRABLE
 *      constraint trigger that sums `ledger_entry` at COMMIT — and it sums
 *      within its own snapshot, so under READ COMMITTED neither transaction can
 *      see the other's uncommitted postings. That is textbook write skew. It
 *      cannot bite today, because the only journal-writing path is a collection
 *      which CREDITS a wallet. It can bite the moment disbursements (M3a) or
 *      escrow release (M4a) land, which is exactly when it would cost money.
 *
 * The second test COMMITS, so it is opt-in behind `INTEGRATION_ALLOW_WRITES=1`.
 * The ledger is append-only by trigger, so its rows cannot be cleaned up
 * afterwards — running it against a database you care about leaves them there
 * for good. That is the correct default for a project with two free Supabase
 * projects and no third.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { connect, hasDb, inRollback, makeAccount, makeJournal, post } from './_db';

const allowWrites = process.env.INTEGRATION_ALLOW_WRITES === '1';

describe.skipIf(!hasDb)('concurrency, against real Postgres', () => {
  let a: Client;
  let b: Client;

  beforeAll(async () => {
    a = await connect();
    b = await connect();
  });

  afterAll(async () => {
    await a?.end();
    await b?.end();
  });

  test('`for update` serialises two resolvers on the same transaction', async () => {
    const id = randomUUID();

    // Committed so both connections can see it, then removed at the end.
    // momo_transaction has no append-only trigger, so this cleans up fully.
    await a.query(
      `insert into momo_transaction
         (id, product, amount_minor, counterparty, external_id, purpose)
       values ($1::uuid,'COLLECTION',1250,'46733123454',$2,'FARE')`,
      [id, `conc-${id.slice(0, 8)}`],
    );

    try {
      await a.query('BEGIN');
      await a.query('select id, status from momo_transaction where id = $1::uuid for update', [id]);

      // B must not be able to take the same lock while A holds it.
      await b.query('BEGIN');
      await b.query("set local lock_timeout = '750ms'");

      let blocked = false;
      try {
        await b.query('select id from momo_transaction where id = $1::uuid for update', [id]);
      } catch (error) {
        blocked = /lock timeout|canceling statement/i.test(String(error));
      }

      expect(blocked).toBe(true);

      await b.query('ROLLBACK');
      await a.query('ROLLBACK');
    } finally {
      await a.query('delete from momo_transaction where id = $1::uuid', [id]).catch(() => {});
    }
  });

  test('the guarded UPDATE lets exactly one caller win', async () => {
    const id = randomUUID();
    await a.query(
      `insert into momo_transaction
         (id, product, amount_minor, counterparty, external_id, purpose)
       values ($1::uuid,'COLLECTION',1250,'46733123454',$2,'FARE')`,
      [id, `race-${id.slice(0, 8)}`],
    );

    try {
      const guarded = `update momo_transaction
                          set status = 'SUCCESSFUL', resolved_at = now()
                        where id = $1::uuid
                          and status in ('INITIATED','CREATED','PENDING')`;

      // Sequential rather than parallel: the second call is the interesting one
      // either way, and this asserts the guard itself rather than the scheduler.
      const first = await a.query(guarded, [id]);
      const second = await a.query(guarded, [id]);

      expect(first.rowCount).toBe(1); // won
      expect(second.rowCount).toBe(0); // lost, and that is success, not an error
    } finally {
      await a.query('delete from momo_transaction where id = $1::uuid', [id]).catch(() => {});
    }
  });

  test('a deferred trigger is checked at COMMIT, not at INSERT', async () => {
    // The property the whole design leans on: postings arrive one row at a time
    // and are only meaningful together.
    await inRollback(a, async (c) => {
      const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
      const wallet = await makeAccount(c, 'USER_WALLET');
      const journal = await makeJournal(c);

      // Momentarily unbalanced, and accepted, because the check is deferred.
      await post(c, journal, settlement, 1250n);

      const { rows } = await c.query<{ n: string }>(
        'select count(*)::text as n from ledger_entry where journal_id = $1',
        [journal],
      );
      expect(rows[0]!.n).toBe('1');

      // Balance it and the constraint is satisfied.
      await post(c, journal, wallet, -1250n);
      await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    });
  });

  describe.skipIf(!allowWrites)('write-skew on the overdraft check (opt-in, COMMITS rows)', () => {
    test('two concurrent spends from one account: does I3 still hold?', async () => {
      // Fund a wallet with 1000, then try to spend 800 twice, concurrently.
      // If the deferred check is snapshot-bound, both commit and the account
      // ends at +600 against a credit-normal account that forbids it.
      const settlement = await makeAccount(a, 'MOMO_SETTLEMENT');
      const wallet = await makeAccount(a, 'USER_WALLET');

      const fund = await makeJournal(a, 'CONC_FUND');
      await post(a, fund, settlement, 1000n);
      await post(a, fund, wallet, -1000n);

      const spend = async (client: Client, amount: bigint) => {
        await client.query('BEGIN');
        const { rows } = await client.query<{ id: string }>(
          `insert into journal (kind) values ('CONC_SPEND') returning id`,
        );
        const j = rows[0]!.id;
        await client.query(
          `insert into ledger_entry (journal_id, account_id, amount) values ($1,$2,$3)`,
          [j, wallet, amount.toString()],
        );
        await client.query(
          `insert into ledger_entry (journal_id, account_id, amount) values ($1,$2,$3)`,
          [j, settlement, (-amount).toString()],
        );
        return client.query('COMMIT');
      };

      const results = await Promise.allSettled([spend(a, 800n), spend(b, 800n)]);
      const committed = results.filter((r) => r.status === 'fulfilled').length;

      const { rows } = await a.query<{ bal: string }>(
        'select coalesce(sum(amount),0)::text as bal from ledger_entry where account_id = $1',
        [wallet],
      );
      const balance = BigInt(rows[0]!.bal);

      // The ledger must balance globally regardless.
      const { rows: global } = await a.query<{ total: string }>(
        'select coalesce(sum(amount),0)::text as total from ledger_entry',
      );
      expect(global[0]!.total).toBe('0');

      // And a credit-normal account must never end up positive.
      // If this fails, the overdraft trigger does NOT survive concurrency and
      // M3a/M4a need row locking on the account before posting.
      expect(balance <= 0n).toBe(true);
      expect(committed).toBeLessThanOrEqual(1);
    });
  });
});
