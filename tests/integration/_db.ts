/**
 * Shared plumbing for the integration suite.
 *
 * These tests exist because the in-memory adapter CANNOT prove the thing the
 * money engine actually rests on. The ledger's safety comes from four database
 * triggers — a journal must balance, the ledger is append-only, an account that
 * forbids it never goes negative, a terminal status is immutable — and every
 * one of those is `DEFERRABLE INITIALLY DEFERRED`, checked at COMMIT, inside
 * Postgres. A TypeScript fake can imitate the behaviour but it cannot fire the
 * trigger, so a passing unit suite says nothing about whether the constraint is
 * really there.
 *
 * Skipped, not failed, when `DATABASE_URL` is absent. CI has no database and
 * should not pretend otherwise: a skipped test that says it skipped is honest,
 * a test that fakes a pass is not.
 */

import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDb = Boolean(DATABASE_URL);

export async function connect(): Promise<Client> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Run `fn` in a transaction and ALWAYS roll back.
 *
 * Every test therefore leaves the database exactly as it found it, so the suite
 * can run against the real project without seeding or cleaning, and running it
 * twice gives the same answer. Nothing here is destructive.
 */
export async function inRollback<T>(client: Client, fn: (c: Client) => Promise<T>): Promise<T> {
  // Clear anything a previous test left on this connection BEFORE starting.
  //
  // The suite deliberately provokes errors — half these tests assert that
  // Postgres refuses something — and an error inside a transaction ABORTS it:
  // every later statement returns 25P02 until a ROLLBACK. Combined with a
  // shared connection, an escape leaks into the NEXT test, which then fails
  // with "current transaction is aborted" pointing at code that is perfectly
  // fine. The same applies to `SET LOCAL ROLE`, which made one test insert as
  // `authenticated` and report "permission denied for table profile" while
  // looking like a policy bug.
  //
  // Both symptoms appear one test away from their cause, so this resets at the
  // START as well as the end. Belt and braces is cheap here; an afternoon lost
  // to a phantom RLS failure is not.
  // One round trip, not two. Every statement here crosses to eu-west-2 and back
  // at roughly 200ms, and a test that opens eight transactions was spending
  // most of its budget on latency alone — enough to blow the 5s default timeout
  // and, worse, to have its queries still running on the shared connection
  // afterwards, which corrupted the NEXT test.
  await client.query('ROLLBACK; RESET ROLE').catch(() => {});

  await client.query('BEGIN');
  try {
    return await fn(client);
  } finally {
    await client.query('ROLLBACK; RESET ROLE').catch(() => {});
  }
}

/** Capture the Postgres error message for an operation expected to fail. */
export async function failure(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected this to fail, and it did not');
}

/**
 * Create a `ledger_account` row and return its id.
 *
 * `subject_id` is randomised so parallel tests cannot collide on the natural
 * key, even though each one rolls back.
 */
export async function makeAccount(
  client: Client,
  type: string,
  options: { allowNegative?: boolean } = {},
): Promise<string> {
  const rows = await client.query<{ id: string }>(
    `insert into ledger_account (type, subject_id, allow_negative)
     values ($1::account_type, $2::uuid, $3)
     returning id`,
    [type, randomUUID(), options.allowNegative ?? false],
  );
  return rows.rows[0]!.id;
}

export async function makeJournal(client: Client, kind = 'TEST'): Promise<string> {
  const rows = await client.query<{ id: string }>(
    `insert into journal (kind, memo) values ($1, 'integration test') returning id`,
    [kind],
  );
  return rows.rows[0]!.id;
}

export async function post(
  client: Client,
  journalId: string,
  accountId: string,
  amount: bigint,
): Promise<void> {
  await client.query(
    `insert into ledger_entry (journal_id, account_id, amount) values ($1,$2,$3)`,
    [journalId, accountId, amount.toString()],
  );
}

/**
 * Run a block as a Supabase role, with an optional `auth.uid()`.
 *
 * This is how RLS is actually exercised. The connection we hold is the owner
 * and BYPASSES row level security entirely, so a naive query proves nothing
 * about a policy. `set local role` plus `request.jwt.claims` puts the session
 * in the same position as a browser holding an anon or a user token, which is
 * the only way to test what a real client can reach.
 */
export async function asRole(
  client: Client,
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: () => Promise<void>,
): Promise<void> {
  await client.query(`set local role ${role}`);
  if (userId) {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role }),
    ]);
  }
  try {
    await fn();
  } finally {
    // `RESET ROLE`, not `SET LOCAL ROLE NONE`. Both are swallowed on an aborted
    // transaction, which is common here, so `inRollback` resets again either
    // side of every test rather than trusting this line.
    await client.query('RESET ROLE').catch(() => {});
  }
}
