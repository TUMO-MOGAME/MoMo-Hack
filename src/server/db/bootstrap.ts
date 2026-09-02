/**
 * Binding the adapter — the missing link between "the Postgres adapter exists"
 * and "the application can reach a database".
 *
 * Until this file, NOTHING in `src/` called `setMoneyDb`. The adapter was
 * written and unit-tested, `DATABASE_URL` could be perfectly correct, and
 * `/api/health` still reported `database: unconfigured` — because no code path
 * ever bound it. That was the walking skeleton's real missing bone, and it is
 * why the health route said "unconfigured" rather than "cannot connect".
 *
 * Call `ensureMoneyDb()` at the top of any route that touches money. It is
 * idempotent and cheap after the first call.
 *
 * WHY NOT AT MODULE SCOPE. Importing this file must not open a socket. `next
 * build` imports every route module to collect them, and a module-scoped
 * connection would mean a build failing on a missing or unreachable
 * `DATABASE_URL` — turning a deploy-time config problem into a build-time one,
 * on a plan where the build is also how we deploy.
 */

import { getMoneyDb, hasMoneyDb, setMoneyDb } from './index';
import { createPostgresMoneyDb } from './postgres';
import { createSqlConnection } from './connection';
import type { MoneyDb } from './types';

/**
 * Bind the Postgres adapter once, if `DATABASE_URL` is present.
 *
 * Returns `undefined` when there is no connection string, rather than throwing.
 * A caller that genuinely needs the database should use `getMoneyDb()`, whose
 * error message names the fix. The health route wants to REPORT the absence,
 * not crash on it.
 */
export function ensureMoneyDb(): MoneyDb | undefined {
  if (hasMoneyDb()) return getMoneyDb();
  if (!process.env.DATABASE_URL) return undefined;

  setMoneyDb(createPostgresMoneyDb(createSqlConnection()));
  return getMoneyDb();
}

/**
 * Is a real database configured AND bound?
 *
 * `hasMoneyDb()` alone answers "has something been bound", which before this
 * file was always false. This answers the question the health route actually
 * asks.
 */
export function moneyDbAvailable(): boolean {
  return ensureMoneyDb() !== undefined;
}
