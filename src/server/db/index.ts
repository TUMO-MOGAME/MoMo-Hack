/**
 * The database handle for a request.
 *
 * Routes call `getMoneyDb()`. Nothing binds a driver yet — see `postgres.ts` —
 * so this throws a named INTERNAL error rather than pretending. That is
 * deliberate: a route that silently no-ops on a money path is far worse than a
 * route that 500s with "no database adapter configured".
 *
 * Wiring, once F4/F5 land and a driver exists in `package.json`:
 *
 * ```ts
 * setMoneyDb(createPostgresMoneyDb(myServiceRoleConnection));
 * ```
 *
 * ADR-0010: that connection uses the SERVICE-ROLE key and is only ever
 * constructed in `src/server/**`. It must never be imported by a client
 * component. In a PUBLIC repository, leaking it is the single most damaging
 * possible mistake.
 */

import { AppException } from '@/lib/errors';
import type { MoneyDb } from './types';

let configured: MoneyDb | undefined;

/** Bind the adapter. Called once at server start, and by integration tests. */
export function setMoneyDb(db: MoneyDb | undefined): void {
  configured = db;
}

export function hasMoneyDb(): boolean {
  return configured !== undefined;
}

export function getMoneyDb(): MoneyDb {
  if (!configured) {
    throw new AppException({
      kind: 'INTERNAL',
      cause:
        'no database adapter configured — bind one with setMoneyDb(createPostgresMoneyDb(...)). See STATUS.md F4/F5.',
    });
  }
  return configured;
}

export * from './types';
export { createMemoryDb, type MemoryDb } from './memory';
export {
  createPostgresMoneyDb,
  createMoneyTx,
  type SqlConnection,
  type SqlExecutor,
} from './postgres';
