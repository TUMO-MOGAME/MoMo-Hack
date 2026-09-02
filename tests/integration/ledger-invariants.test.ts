/**
 * The four ledger invariants, against a real Postgres.
 *
 * `docs/02` §3.3 claims these are enforced by the DATABASE rather than by code,
 * "because a constraint the database refuses to violate holds even when an
 * agent writes code nobody reviewed carefully". That claim has been untested
 * since the schema was written — the whole suite ran against an in-memory fake
 * with no triggers in it. This is the file that either substantiates the claim
 * or exposes it.
 *
 * Every test rolls back. Nothing here leaves a row behind.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { asRole, connect, failure, hasDb, inRollback, makeAccount, makeJournal, post } from './_db';

describe.skipIf(!hasDb)('ledger invariants, against real Postgres', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  describe('I1 — a journal must balance to zero', () => {
    test('a balanced journal commits', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c, 'FARE_SPLIT');

        await post(c, journal, settlement, 1250n);
        await post(c, journal, wallet, -1250n);

        // The trigger is DEFERRED, so nothing has been checked yet. Forcing the
        // constraints here is what actually exercises it inside the rollback.
        await c.query('SET CONSTRAINTS ALL IMMEDIATE');

        const { rows } = await c.query<{ total: string }>(
          'select coalesce(sum(amount),0)::text as total from ledger_entry where journal_id = $1',
          [journal],
        );
        expect(rows[0]!.total).toBe('0');
      });
    });

    test('an UNBALANCED journal is refused at commit', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c);

        await post(c, journal, settlement, 1250n);
        await post(c, journal, wallet, -1000n); // 250 short, on purpose

        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/does not balance/i);
      });
    });

    test('a single-posting journal cannot balance either', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const journal = await makeJournal(c);
        await post(c, journal, settlement, 500n);

        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/does not balance/i);
      });
    });

    test('a zero-amount posting is refused outright', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const journal = await makeJournal(c);
        const message = await failure(() => post(c, journal, settlement, 0n));
        expect(message).toMatch(/amount_nonzero/i);
      });
    });
  });

  describe('I2 — the ledger is append-only', () => {
    test('a posting cannot be updated', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c);
        await post(c, journal, settlement, 100n);
        await post(c, journal, wallet, -100n);

        const message = await failure(() =>
          c.query('update ledger_entry set amount = 999 where journal_id = $1', [journal]),
        );
        expect(message).toMatch(/append-only/i);
      });
    });

    test('a posting cannot be deleted', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c);
        await post(c, journal, settlement, 100n);
        await post(c, journal, wallet, -100n);

        const message = await failure(() =>
          c.query('delete from ledger_entry where journal_id = $1', [journal]),
        );
        expect(message).toMatch(/append-only/i);
      });
    });

    test('a journal cannot be updated or deleted', async () => {
      await inRollback(client, async (c) => {
        const journal = await makeJournal(c);
        expect(
          await failure(() => c.query(`update journal set kind = 'X' where id = $1`, [journal])),
        ).toMatch(/append-only/i);
      });
      await inRollback(client, async (c) => {
        const journal = await makeJournal(c);
        expect(
          await failure(() => c.query('delete from journal where id = $1', [journal])),
        ).toMatch(/append-only/i);
      });
    });
  });

  describe('I3 — overdraft, in the direction each account actually runs', () => {
    test('a CREDIT-normal account cannot go positive (it would owe less than nothing)', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c);

        // Paying OUT of a wallet that was never funded.
        await post(c, journal, wallet, 500n);
        await post(c, journal, settlement, -500n);

        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/overdrawn/i);
      });
    });

    test('MOMO_SETTLEMENT is debit-normal, so the FIRST collection is allowed', async () => {
      // This is the case the version printed in docs/02 §3.3 would have
      // rejected — under that rule the system could never take a cent.
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET');
        const journal = await makeJournal(c);

        await post(c, journal, settlement, 1250n); // +, debit-normal: fine
        await post(c, journal, wallet, -1250n);

        await c.query('SET CONSTRAINTS ALL IMMEDIATE');
        const { rows } = await c.query<{ bal: string }>(
          'select coalesce(sum(amount),0)::text as bal from ledger_entry where account_id = $1',
          [settlement],
        );
        expect(rows[0]!.bal).toBe('1250');
      });
    });

    test('MOMO_SETTLEMENT cannot go negative — we cannot pay out what we do not hold', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const wallet = await makeAccount(c, 'USER_WALLET', { allowNegative: true });
        const journal = await makeJournal(c);

        await post(c, journal, settlement, -500n);
        await post(c, journal, wallet, 500n);

        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/overdrawn/i);
      });
    });

    test('allow_negative opts an account out', async () => {
      await inRollback(client, async (c) => {
        const settlement = await makeAccount(c, 'MOMO_SETTLEMENT');
        const suspense = await makeAccount(c, 'SUSPENSE', { allowNegative: true });
        const journal = await makeJournal(c);

        await post(c, journal, suspense, 700n);
        await post(c, journal, settlement, -700n);

        // Still refused, but for the SETTLEMENT account, not the suspense one.
        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/MOMO_SETTLEMENT/);
      });
    });
  });

  describe('I4 — a terminal status is immutable, and journal_id is write-once', () => {
    async function makeTxn(c: Client, status = 'PENDING'): Promise<string> {
      const id = randomUUID();
      await c.query(
        `insert into momo_transaction
           (id, product, status, amount_minor, counterparty, external_id, purpose)
         values ($1::uuid, 'COLLECTION', $2::momo_status, 1250, '46733123454', $3, 'FARE')`,
        [id, status, `int-${id.slice(0, 8)}`],
      );
      return id;
    }

    test('PENDING -> SUCCESSFUL is allowed', async () => {
      await inRollback(client, async (c) => {
        const id = await makeTxn(c);
        await c.query(`update momo_transaction set status='SUCCESSFUL' where id=$1::uuid`, [id]);
        const { rows } = await c.query<{ status: string }>(
          'select status from momo_transaction where id=$1::uuid',
          [id],
        );
        expect(rows[0]!.status).toBe('SUCCESSFUL');
      });
    });

    test('SUCCESSFUL -> FAILED is refused — a late callback cannot un-pay someone', async () => {
      await inRollback(client, async (c) => {
        const id = await makeTxn(c, 'SUCCESSFUL');
        const message = await failure(() =>
          c.query(`update momo_transaction set status='FAILED' where id=$1::uuid`, [id]),
        );
        expect(message).toMatch(/terminal status .* is immutable/i);
      });
    });

    test('every terminal status is absorbing', async () => {
      for (const terminal of ['SUCCESSFUL', 'FAILED', 'REJECTED', 'TIMEOUT']) {
        await inRollback(client, async (c) => {
          const id = await makeTxn(c, terminal);
          const message = await failure(() =>
            c.query(`update momo_transaction set status='PENDING' where id=$1::uuid`, [id]),
          );
          expect(message).toMatch(/immutable/i);
        });
      }
    });

    test('journal_id is write-once — a second journal is a double-posting', async () => {
      await inRollback(client, async (c) => {
        const id = await makeTxn(c);
        const first = await makeJournal(c);
        const second = await makeJournal(c);

        await c.query(`update momo_transaction set journal_id=$2::uuid where id=$1::uuid`, [
          id,
          first,
        ]);
        const message = await failure(() =>
          c.query(`update momo_transaction set journal_id=$2::uuid where id=$1::uuid`, [
            id,
            second,
          ]),
        );
        expect(message).toMatch(/write-once/i);
      });
    });

    test('an externalId containing a space is refused, as MTN would refuse it', async () => {
      await inRollback(client, async (c) => {
        const id = randomUUID();
        const message = await failure(() =>
          c.query(
            `insert into momo_transaction
               (id, product, amount_minor, counterparty, external_id, purpose)
             values ($1::uuid,'COLLECTION',100,'46733123454','has a space','FARE')`,
            [id],
          ),
        );
        expect(message).toMatch(/external_id_has_no_spaces/i);
      });
    });

    test('a non-positive amount is refused', async () => {
      await inRollback(client, async (c) => {
        const id = randomUUID();
        const message = await failure(() =>
          c.query(
            `insert into momo_transaction
               (id, product, amount_minor, counterparty, external_id, purpose)
             values ($1::uuid,'COLLECTION',0,'46733123454','zero-amount','FARE')`,
            [id],
          ),
        );
        expect(message).toMatch(/amount_minor/i);
      });
    });
  });

  describe('the split rule must always sum to 10000 bps', () => {
    test('a rule that does not sum is refused', async () => {
      await inRollback(client, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into split_rule (scope, version) values ('GLOBAL', 999) returning id`,
        );
        const ruleId = rows[0]!.id;
        await c.query(
          `insert into split_component (rule_id, account_type, basis_points, label)
           values ($1,'DRIVER_FLOAT',6000,'driver'), ($1,'FUEL_POOL',2000,'fuel')`,
          [ruleId],
        );
        const message = await failure(() => c.query('SET CONSTRAINTS ALL IMMEDIATE'));
        expect(message).toMatch(/8000 bps, expected 10000/);
      });
    });

    test('the real 60/25/10/5 rule is accepted', async () => {
      await inRollback(client, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into split_rule (scope, version) values ('GLOBAL', 998) returning id`,
        );
        const ruleId = rows[0]!.id;
        await c.query(
          `insert into split_component (rule_id, account_type, basis_points, label)
           values ($1,'DRIVER_FLOAT',6000,'owner'),
                  ($1,'FUEL_POOL',2500,'fuel'),
                  ($1,'INSURANCE_POOL',1000,'insurance'),
                  ($1,'PLATFORM_FEE',500,'platform')`,
          [ruleId],
        );
        await c.query('SET CONSTRAINTS ALL IMMEDIATE');
        const { rows: sum } = await c.query<{ total: string }>(
          'select sum(basis_points)::text as total from split_component where rule_id = $1',
          [ruleId],
        );
        expect(sum[0]!.total).toBe('10000');
      });
    });
  });

  describe('balances are derived, never stored', () => {
    test('no table has a balance column', async () => {
      const { rows } = await client.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name
           from information_schema.columns
          where table_schema = 'public'
            and column_name ~ '(^|_)balance($|_)'
            and table_name <> 'wallet_balance'`,
      );
      expect(rows).toEqual([]);
    });

    test('no monetary column is a floating-point or numeric type', async () => {
      const { rows } = await client.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name, data_type
           from information_schema.columns
          where table_schema = 'public'
            and data_type in ('numeric','real','double precision','money')`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('RLS — what a browser can actually reach (ADR-0010)', () => {
    test('ledger tables are unreachable by anon AND by authenticated', async () => {
      for (const table of ['ledger_account', 'journal', 'ledger_entry', 'outbox']) {
        for (const role of ['anon', 'authenticated'] as const) {
          await inRollback(client, async (c) => {
            await asRole(c, role, randomUUID(), async () => {
              // RLS with zero policies denies everything. Either the query
              // returns nothing or it is refused outright — both are a denial;
              // what must never happen is a row coming back.
              try {
                const { rows } = await c.query(`select * from ${table} limit 1`);
                expect(rows).toEqual([]);
              } catch (error) {
                expect(String(error)).toMatch(/permission denied|policy/i);
              }
            });
          });
        }
      }
    });

    test('a client cannot INSERT into the ledger', async () => {
      await inRollback(client, async (c) => {
        await asRole(c, 'authenticated', randomUUID(), async () => {
          const message = await failure(() =>
            c.query(`insert into journal (kind) values ('FORGED')`),
          );
          expect(message).toMatch(/permission denied|policy/i);
        });
      });
    });

    test('split rules ARE publicly readable — the trust story, on purpose', async () => {
      await inRollback(client, async (c) => {
        await c.query(`insert into split_rule (scope, version) values ('GLOBAL', 997)`);
        await asRole(c, 'anon', null, async () => {
          const { rows } = await c.query(`select * from split_rule where version = 997`);
          expect(rows.length).toBe(1);
        });
      });
    });

    test('a user sees only their OWN momo_transaction rows', async () => {
      await inRollback(client, async (c) => {
        // Two profiles need two auth.users rows; create them directly, inside
        // the rollback, so this leaves no account behind.
        const mine = randomUUID();
        const theirs = randomUUID();
        for (const [id, msisdn] of [
          [mine, '27820000001'],
          [theirs, '27820000002'],
        ] as const) {
          await c.query(
            `insert into auth.users (id, instance_id, aud, role, email)
             values ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
                     'authenticated', $2)`,
            [id, `${id}@example.test`],
          );
          await c.query(
            `insert into profile (id, msisdn, display_name) values ($1::uuid, $2, 'Test')`,
            [id, msisdn],
          );
        }

        for (const [owner, ext] of [
          [mine, 'rls-mine'],
          [theirs, 'rls-theirs'],
        ] as const) {
          await c.query(
            `insert into momo_transaction
               (id, product, amount_minor, counterparty, external_id, purpose, initiated_by)
             values (gen_random_uuid(),'COLLECTION',100,'46733123454',$1,'FARE',$2::uuid)`,
            [ext, owner],
          );
        }

        await asRole(c, 'authenticated', mine, async () => {
          const { rows } = await c.query<{ external_id: string }>(
            `select external_id from momo_transaction where external_id like 'rls-%'`,
          );
          expect(rows.map((r) => r.external_id)).toEqual(['rls-mine']);
        });
      });
    });

    test('a user cannot advance their own transaction to SUCCESSFUL', async () => {
      await inRollback(client, async (c) => {
        const id = randomUUID();
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email)
           values ($1::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)`,
          [id, `${id}@example.test`],
        );
        await c.query(
          `insert into profile (id, msisdn, display_name) values ($1::uuid,'27820000003','Test')`,
          [id],
        );
        await c.query(
          `insert into momo_transaction
             (id, product, amount_minor, counterparty, external_id, purpose, initiated_by)
           values (gen_random_uuid(),'COLLECTION',100,'46733123454','rls-noupdate','FARE',$1::uuid)`,
          [id],
        );

        await asRole(c, 'authenticated', id, async () => {
          // There is no UPDATE policy, so this must affect nothing. Marking
          // yourself paid is the single most valuable forgery in the system.
          try {
            const result = await c.query(
              `update momo_transaction set status='SUCCESSFUL' where external_id='rls-noupdate'`,
            );
            expect(result.rowCount).toBe(0);
          } catch (error) {
            expect(String(error)).toMatch(/permission denied|policy/i);
          }
        });
      });
    });
  });
});
