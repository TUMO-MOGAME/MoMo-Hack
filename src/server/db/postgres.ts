/**
 * The Postgres adapter — every statement the money engine issues, in one file.
 *
 * ⚠️ NOT YET WIRED TO A DRIVER, AND SAID PLAINLY.
 * `createPostgresMoneyDb` takes a `SqlConnection` as an argument rather than
 * importing `pg` / `postgres` / `@supabase/supabase-js`, because adding any of
 * those means editing `package.json`, which is frozen for this workstream.
 * Wiring it is one line once F4/F5 land (STATUS.md). Nothing else changes.
 *
 * The SQL lives here, spelled out, for a specific reason: the two statements
 * that can lose money — the guarded transition and the write-once journal
 * attach — must be readable by an auditor without following a query builder
 * through three layers of abstraction (A1 §4, A5 §1).
 *
 * All money crosses this boundary as `bigint`. `pg` hands back `bigint` columns
 * as strings to avoid a silent precision loss at 2^53, and `toBigInt` below is
 * the only place that conversion happens.
 */

import { accountKey, allowsNegative, type AccountRef } from '@/domain/ledger/accounts';
import { isTerminal, type MomoStatus } from '@/domain/ledger/state-machine';
import { AppException } from '@/lib/errors';
import type { MomoProductEnum } from '@/lib/momo/types';
import type {
  ClaimInput,
  ClaimResult,
  LedgerEntryDraft,
  MomoTransactionRow,
  MoneyDb,
  MoneyTx,
  NewMomoTransaction,
  OutboxDraft,
} from './types';

export type SqlRow = Record<string, unknown>;

/** Whatever driver we bind, it must be able to do this and nothing more. */
export interface SqlExecutor {
  query<T extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface SqlConnection extends SqlExecutor {
  /** BEGIN / COMMIT / ROLLBACK around `fn`. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** The nil uuid, matching `ledger_account_natural_key` in 0001_ledger.sql. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    // A money column that arrived as a JS number has already been through a
    // float, which is exactly the bug ADR-0004 exists to prevent. Refuse it.
    throw new AppException({
      kind: 'INTERNAL',
      cause:
        'money column arrived as a number; configure the driver to return bigint columns as text',
    });
  }
  return BigInt(String(value));
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function toNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

function mapTransaction(row: SqlRow): MomoTransactionRow {
  return {
    id: String(row.id),
    product: String(row.product) as MomoProductEnum,
    status: String(row.status) as MomoStatus,
    amountMinor: toBigInt(row.amount_minor),
    currency: String(row.currency),
    counterparty: String(row.counterparty),
    externalId: String(row.external_id),
    purpose: String(row.purpose),
    subjectId:
      row.subject_id === null || row.subject_id === undefined ? null : String(row.subject_id),
    initiatedBy:
      row.initiated_by === null || row.initiated_by === undefined ? null : String(row.initiated_by),
    attemptCount: Number(row.attempt_count),
    journalId:
      row.journal_id === null || row.journal_id === undefined ? null : String(row.journal_id),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    resolvedAt: toNullableDate(row.resolved_at),
  };
}

function one<T extends SqlRow>(rows: readonly T[]): T | undefined {
  return rows[0];
}

export function createMoneyTx(sql: SqlExecutor): MoneyTx {
  return {
    /**
     * Find or create an account by natural key.
     *
     * `on conflict do nothing` plus a follow-up select, rather than
     * `on conflict (…) do update`, because the uniqueness lives in an
     * EXPRESSION index (the coalesce dance around nullable owner/subject) and
     * inferring an expression index in an upsert is brittle across versions.
     */
    async ensureAccount(ref: AccountRef): Promise<string> {
      const params = [
        ref.type,
        ref.ownerId ?? null,
        ref.subjectId ?? null,
        ref.currency ?? 'ZAR',
        allowsNegative(ref.type),
      ];

      const inserted = await sql.query<{ id: string }>(
        `insert into ledger_account (type, owner_id, subject_id, currency, allow_negative)
         values ($1::account_type, $2::uuid, $3::uuid, $4, $5)
         on conflict do nothing
         returning id`,
        params,
      );
      const created = one(inserted);
      if (created) return created.id;

      const found = await sql.query<{ id: string }>(
        `select id from ledger_account
          where type = $1::account_type
            and coalesce(owner_id,   $6::uuid) = coalesce($2::uuid, $6::uuid)
            and coalesce(subject_id, $6::uuid) = coalesce($3::uuid, $6::uuid)
            and currency = $4
          limit 1`,
        [...params, NIL_UUID],
      );
      const row = one(found);
      if (!row) {
        throw new AppException({
          kind: 'INTERNAL',
          cause: `cannot resolve account ${accountKey(ref)}`,
        });
      }
      return row.id;
    },

    async insertJournal(input): Promise<string> {
      const rows = await sql.query<{ id: string }>(
        `insert into journal (kind, reference_id, memo)
         values ($1, $2::uuid, $3)
         returning id`,
        [input.kind, input.referenceId ?? null, input.memo ?? null],
      );
      const row = one(rows);
      if (!row)
        throw new AppException({ kind: 'INTERNAL', cause: 'journal insert returned no row' });
      return row.id;
    },

    /**
     * ⚠️ THE ONLY INSERT INTO `ledger_entry` IN THE CODEBASE.
     *
     * One statement for the whole journal, via `unnest`, so all the postings
     * land together. The DEFERRABLE constraint triggers (I1 balance, I3
     * overdraft) then fire once at COMMIT with the complete picture.
     */
    async insertEntries(journalId: string, entries: readonly LedgerEntryDraft[]): Promise<void> {
      if (entries.length === 0) return;
      await sql.query(
        `insert into ledger_entry (journal_id, account_id, amount)
         select $1::uuid, e.account_id, e.amount
           from unnest($2::uuid[], $3::bigint[]) as e(account_id, amount)`,
        [
          journalId,
          entries.map((e) => e.accountId),
          // Serialised as text: a bigint that goes through a JS number loses
          // precision above 2^53, and this is money.
          entries.map((e) => e.amount.toString()),
        ],
      );
    },

    /**
     * ⚠️ THE GUARDED TRANSITION. The whole concurrency story is these lines.
     *
     *   - `for update` takes the row lock, so concurrent resolvers serialise
     *     here rather than both reading 'PENDING' and both posting.
     *   - `prev.status = any($2)` is the guard. It is parameterised rather than
     *     an inlined `IN (…)` list on purpose; the statuses come from a closed
     *     enum, and interpolating them would be a needless injection surface.
     *   - ZERO ROWS RETURNED IS SUCCESS. It means someone else won the race
     *     (momoAPIs.md §12 rule 2). The caller must not treat it as an error.
     *   - `resolved_at` is only stamped on a terminal status, so a poll that
     *     says "still pending" does not look like a resolution.
     */
    async claimTransition(input: ClaimInput): Promise<ClaimResult | null> {
      const rows = await sql.query(
        `with prev as (
           select id, status from momo_transaction where id = $1::uuid for update
         )
         update momo_transaction m
            set status        = $3::momo_status,
                last_response = coalesce($4::jsonb, m.last_response),
                resolved_at   = case when $5 then $6::timestamptz else m.resolved_at end,
                updated_at    = $6::timestamptz
           from prev
          where m.id = prev.id
            and prev.status = any($2::momo_status[])
        returning m.*, prev.status as previous_status`,
        [
          input.id,
          input.from,
          input.to,
          input.response === undefined ? null : JSON.stringify(input.response),
          isTerminal(input.to),
          input.at.toISOString(),
        ],
      );

      const row = one(rows);
      if (!row) return null;
      return {
        row: mapTransaction(row),
        previousStatus: String(row.previous_status) as MomoStatus,
      };
    },

    /**
     * ⚠️ WRITE-ONCE. `and journal_id is null` is what makes a second journal
     * for one transaction physically impossible; the BEFORE UPDATE trigger in
     * 0001_ledger.sql refuses it a second time for good measure.
     */
    async attachJournal(transactionId: string, journalId: string): Promise<boolean> {
      const rows = await sql.query(
        `update momo_transaction
            set journal_id = $2::uuid
          where id = $1::uuid
            and journal_id is null
        returning id`,
        [transactionId, journalId],
      );
      return rows.length === 1;
    },

    async enqueueOutbox(draft: OutboxDraft): Promise<string> {
      const rows = await sql.query<{ id: string }>(
        `insert into outbox (channel, recipient, payload)
         values ($1, $2, $3::jsonb)
         returning id`,
        [draft.channel, draft.recipient, JSON.stringify(draft.payload)],
      );
      const row = one(rows);
      if (!row)
        throw new AppException({ kind: 'INTERNAL', cause: 'outbox insert returned no row' });
      return row.id;
    },

    /**
     * Persist BEFORE the network call, always (docs/03 §2). `id` is supplied by
     * the caller because it is about to become the `X-Reference-Id`; there is
     * no database default for it.
     */
    async insertTransaction(input: NewMomoTransaction): Promise<MomoTransactionRow> {
      const rows = await sql.query(
        `insert into momo_transaction
           (id, product, amount_minor, currency, counterparty, external_id,
            purpose, subject_id, initiated_by, request_body)
         values ($1::uuid, $2::momo_product, $3::bigint, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::jsonb)
         returning *`,
        [
          input.id,
          input.product,
          input.amountMinor.toString(),
          input.currency ?? 'ZAR',
          input.counterparty,
          input.externalId,
          input.purpose,
          input.subjectId ?? null,
          input.initiatedBy ?? null,
          input.requestBody === undefined ? null : JSON.stringify(input.requestBody),
        ],
      );
      const row = one(rows);
      if (!row) {
        throw new AppException({
          kind: 'INTERNAL',
          cause: 'momo_transaction insert returned no row',
        });
      }
      return mapTransaction(row);
    },

    async getTransaction(id: string): Promise<MomoTransactionRow | null> {
      const rows = await sql.query(`select * from momo_transaction where id = $1::uuid`, [id]);
      const row = one(rows);
      return row ? mapTransaction(row) : null;
    },

    async bumpAttempt(id: string): Promise<number> {
      const rows = await sql.query<{ attempt_count: number }>(
        `update momo_transaction
            set attempt_count = attempt_count + 1
          where id = $1::uuid
        returning attempt_count`,
        [id],
      );
      return Number(one(rows)?.attempt_count ?? 0);
    },

    /** docs/03 §3 path B, verbatim: the reconciler's working set. */
    async listUnresolved({ limit, since }): Promise<readonly MomoTransactionRow[]> {
      const rows = await sql.query(
        `select * from momo_transaction
          where status in ('INITIATED','CREATED','PENDING')
            and created_at > $2::timestamptz
          order by created_at
          limit $1`,
        [limit, since.toISOString()],
      );
      return rows.map(mapTransaction);
    },

    async ledgerSum(): Promise<bigint> {
      const rows = await sql.query<{ total: string }>(
        `select coalesce(sum(amount), 0)::text as total from ledger_entry`,
      );
      return toBigInt(one(rows)?.total ?? '0');
    },

    async countJournalsFor(referenceId: string): Promise<number> {
      const rows = await sql.query<{ n: number }>(
        `select count(*)::int as n from journal where reference_id = $1::uuid`,
        [referenceId],
      );
      return Number(one(rows)?.n ?? 0);
    },

    async accountBalance(accountId: string): Promise<bigint> {
      const rows = await sql.query<{ balance: string }>(
        `select coalesce(sum(amount), 0)::text as balance
           from ledger_entry where account_id = $1::uuid`,
        [accountId],
      );
      return toBigInt(one(rows)?.balance ?? '0');
    },
  };
}

export function createPostgresMoneyDb(connection: SqlConnection): MoneyDb {
  return {
    transaction: (fn) => connection.transaction((sql) => fn(createMoneyTx(sql))),
  };
}
