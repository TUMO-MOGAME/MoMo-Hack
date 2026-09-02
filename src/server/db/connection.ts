/**
 * The driver binding. This is the "one line once F4/F5 land" that
 * `postgres.ts` promised, and it is the only file in the codebase that imports
 * `pg`.
 *
 * WHY `pg` AND NOT `postgres` / `@supabase/supabase-js`:
 *
 *   - `pg` returns `int8` columns as STRINGS by default. That is not a quirk to
 *     work around, it is the behaviour we need: a `bigint` amount that arrives
 *     as a JS `number` has already been through a float, and `toBigInt` in
 *     postgres.ts refuses it outright (ADR-0004). A driver that "helpfully"
 *     parsed int8 into a number would turn every amount above 2^53 into a
 *     silent rounding bug, which is the exact failure this project is built to
 *     make impossible.
 *   - `@supabase/supabase-js` speaks PostgREST, which cannot express
 *     `select ... for update`, cannot hold an explicit transaction across
 *     statements, and cannot defer a constraint trigger. All three are
 *     load-bearing: `claimTransition` needs the row lock, and I1/I3 are
 *     `DEFERRABLE INITIALLY DEFERRED` and only checked at COMMIT. The ledger is
 *     unimplementable over PostgREST.
 *
 * CONNECTION POOLING. Serverless functions are many and short-lived, and a
 * Supabase free project allows a small number of direct connections. So the
 * pool is small, module-scoped (reused across invocations on a warm Lambda) and
 * created lazily — a build that never queries never opens a socket.
 */

import { Pool, types, type PoolClient } from 'pg';
import type { SqlConnection, SqlExecutor, SqlRow } from './postgres';

/**
 * Belt and braces on the point above.
 *
 * `pg` already returns int8 (oid 20) as a string, but that is a default and
 * defaults get changed by transitive code. Pinning the parser here means a
 * money column cannot become a `number` even if something else in the process
 * reconfigures `pg`. It costs one line and removes a whole class of silent
 * corruption.
 */
types.setTypeParser(20, (value: string) => value);

/** `numeric` (1700) too — nothing should be numeric, but if it appears, no float. */
types.setTypeParser(1700, (value: string) => value);

let pool: Pool | undefined;

export interface PoolOptions {
  readonly connectionString: string;
  /**
   * Small on purpose. Vercel runs many concurrent instances and a Supabase free
   * project has a modest connection ceiling; a large per-instance pool is how
   * you exhaust it and start failing on `too many clients already`.
   */
  readonly max?: number;
}

export function getPool(options?: PoolOptions): Pool {
  if (pool) return pool;

  const connectionString = options?.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. The money engine cannot reach Postgres. See STATUS.md F5.',
    );
  }

  pool = new Pool({
    connectionString,
    max: options?.max ?? 3,
    // A hung connection must not hold a serverless invocation open to its
    // timeout: fail fast and let the reconciler pick the work up.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    // Supabase terminates TLS with its own CA. `rejectUnauthorized: false` is
    // what the Supabase docs specify for the pooled endpoints; the connection
    // is still encrypted, we simply do not pin their chain.
    ssl: { rejectUnauthorized: false },
  });

  return pool;
}

/** For tests and for a clean shutdown. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = undefined;
  await p.end();
}

function executor(client: PoolClient | Pool): SqlExecutor {
  return {
    async query<T extends SqlRow = SqlRow>(
      text: string,
      params?: readonly unknown[],
    ): Promise<T[]> {
      const result = await client.query(text, params ? [...params] : undefined);
      return result.rows as T[];
    },
  };
}

/**
 * A `SqlConnection` over the pool.
 *
 * `transaction` takes ONE client for the whole unit of work. That is the part
 * that matters: `claimTransition` issues `select ... for update` and the writer
 * then inserts postings, and if those ran on different pooled connections the
 * row lock would be held by one and the insert attempted by another — the lock
 * would protect nothing. ROLLBACK is attempted on failure and its own error is
 * swallowed, because the original error is the one worth reporting and a
 * rollback failure on a dead connection is noise.
 */
export function createSqlConnection(options?: PoolOptions): SqlConnection {
  const p = getPool(options);

  return {
    ...executor(p),

    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(executor(client));
        await client.query('COMMIT');
        return out;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* the original error is the interesting one */
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
