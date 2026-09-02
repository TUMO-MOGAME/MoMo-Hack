/**
 * The database port.
 *
 * `src/server/**` owns every write to the ledger (docs/01 §5). It talks to
 * Postgres through this narrow interface rather than through a driver, for two
 * reasons that are not "testability" hand-waving:
 *
 *  1. The property and concurrency suites need to run thousands of ledger
 *     operations per second, in CI, with no container. `memory.ts` gives that.
 *  2. Every statement that can lose money — the guarded transition, the
 *     write-once journal attach — is written out ONCE, in `postgres.ts`, where
 *     an auditor can read it in full (A1 §4, A5 §1).
 *
 * NOT YET WIRED, AND SAID PLAINLY: `postgres.ts` is written against a generic
 * `SqlExecutor`. No driver is bound to it, because binding one means adding a
 * dependency to `package.json`, which is frozen for this workstream. See
 * STATUS.md M1a. `createPostgresMoneyDb()` takes the executor as an argument,
 * so wiring it is one line once F4/F5 land.
 */

import type { AccountRef } from '@/domain/ledger/accounts';
import type { MomoStatus } from '@/domain/ledger/state-machine';
import type { MomoProductEnum } from '@/lib/momo/types';

/** A `momo_transaction` row, camel-cased. Money is always `bigint`. */
export interface MomoTransactionRow {
  readonly id: string;
  readonly product: MomoProductEnum;
  readonly status: MomoStatus;
  readonly amountMinor: bigint;
  readonly currency: string;
  /** MSISDN. Never logged in full — use `maskMsisdn` (POPIA s105/106). */
  readonly counterparty: string;
  readonly externalId: string;
  readonly purpose: string;
  readonly subjectId: string | null;
  readonly initiatedBy: string | null;
  readonly attemptCount: number;
  readonly journalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;
}

export interface NewMomoTransaction {
  /** WE generate this, and it IS the `X-Reference-Id`. Never defaulted by the DB. */
  readonly id: string;
  readonly product: MomoProductEnum;
  readonly amountMinor: bigint;
  readonly counterparty: string;
  readonly externalId: string;
  readonly purpose: string;
  readonly subjectId?: string | null;
  readonly initiatedBy?: string | null;
  readonly requestBody?: unknown;
  readonly currency?: string;
}

export interface OutboxDraft {
  readonly channel: 'TELEGRAM' | 'SMS' | 'PUSH';
  readonly recipient: string;
  readonly payload: Record<string, unknown>;
}

export interface LedgerEntryDraft {
  readonly accountId: string;
  readonly amount: bigint;
}

/** The result of the one guarded UPDATE that decides who resolves a transaction. */
export interface ClaimResult {
  readonly row: MomoTransactionRow;
  /** The status the row held BEFORE the claim. Feeds `postsLedger()`. */
  readonly previousStatus: MomoStatus;
}

export interface ClaimInput {
  readonly id: string;
  /** The statuses the row is allowed to be in. Anything else = we lost the race. */
  readonly from: readonly MomoStatus[];
  readonly to: MomoStatus;
  readonly response?: unknown;
  readonly at: Date;
}

/**
 * Everything the money engine does inside ONE database transaction.
 *
 * The whole concurrency story is `claimTransition`: zero rows updated means
 * someone else won the race, and that is SUCCESS, not an error.
 */
export interface MoneyTx {
  /** Find or create an account by natural key. Idempotent. */
  ensureAccount(ref: AccountRef): Promise<string>;

  insertJournal(input: {
    readonly kind: string;
    readonly referenceId?: string | null;
    readonly memo?: string | null;
  }): Promise<string>;

  /**
   * ⚠️ THE ONLY WRITE PATH INTO `ledger_entry` IN THE ENTIRE CODEBASE.
   * Called from exactly one place: `src/server/ledger/journal.ts`.
   * `tests/unit/ledger/single-writer.test.ts` fails the build if that changes.
   */
  insertEntries(journalId: string, entries: readonly LedgerEntryDraft[]): Promise<void>;

  /** The guarded transition. `null` means zero rows changed. */
  claimTransition(input: ClaimInput): Promise<ClaimResult | null>;

  /** `SET journal_id = $2 WHERE id = $1 AND journal_id IS NULL`. Write-once. */
  attachJournal(transactionId: string, journalId: string): Promise<boolean>;

  enqueueOutbox(draft: OutboxDraft): Promise<string>;

  insertTransaction(row: NewMomoTransaction): Promise<MomoTransactionRow>;

  getTransaction(id: string): Promise<MomoTransactionRow | null>;

  /** `attempt_count = attempt_count + 1`. Bumped before every outbound send. */
  bumpAttempt(id: string): Promise<number>;

  /** The reconciler's working set (docs/03 §3 path B). */
  listUnresolved(input: {
    readonly limit: number;
    readonly since: Date;
  }): Promise<readonly MomoTransactionRow[]>;

  /** SUM(amount) over the whole ledger. Must always be 0n. */
  ledgerSum(): Promise<bigint>;

  /** Journals written for a reference id. Must never exceed 1. */
  countJournalsFor(referenceId: string): Promise<number>;

  /** SUM(amount) for one account. There is no cached balance anywhere. */
  accountBalance(accountId: string): Promise<bigint>;
}

export interface MoneyDb {
  /** Everything inside `fn` commits together or not at all. */
  transaction<T>(fn: (tx: MoneyTx) => Promise<T>): Promise<T>;
}
