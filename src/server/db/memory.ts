/**
 * An in-memory `MoneyDb`.
 *
 * This is a TEST DOUBLE, not a fallback for production. It exists so the
 * property suite can run forty random money operations per case, five thousand
 * cases, in CI, with no container — and so the concurrency test can launch ten
 * simultaneous resolvers and prove exactly one journal comes out.
 *
 * It reproduces the four database invariants from 0001_ledger.sql deliberately,
 * because a test double that is more permissive than the real database tests
 * nothing:
 *
 *   I1  journals balance                  — checked at commit, like DEFERRABLE
 *   I2  the ledger is append-only         — no update/delete path exists
 *   I3  no overdraft on a guarded account — checked at commit, both directions
 *   I4  terminal status is immutable, journal_id is write-once
 *
 * Two honest limitations: there is no isolation between concurrent in-flight
 * transactions (an uncommitted write is visible to a concurrent reader), and
 * rollback is an undo log rather than MVCC. Neither affects what the suite
 * asserts, because the exclusion that matters comes from `claimTransition`
 * being atomic — the same place it comes from in Postgres.
 */

import {
  type AccountRef,
  accountKey,
  allowsNegative,
  isDebitNormal,
} from '@/domain/ledger/accounts';
import { type MomoStatus, isClaimable, isTerminal } from '@/domain/ledger/state-machine';
import { AppException } from '@/lib/errors';
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

/**
 * What the database raises when a DEFERRABLE constraint trigger fires at COMMIT.
 *
 * Deliberately NOT an `AppException`: Postgres raises a plain exception with a
 * message, and a test double that wrapped a constraint violation in our own
 * error taxonomy would invite a caller to `catch` something it should never
 * have been able to cause. The messages match 0001_ledger.sql word for word.
 */
export class LedgerConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerConstraintError';
  }
}

interface AccountRow {
  readonly id: string;
  readonly ref: AccountRef;
  readonly allowNegative: boolean;
}

interface JournalRow {
  readonly id: string;
  readonly kind: string;
  readonly referenceId: string | null;
  readonly memo: string | null;
  readonly createdAt: Date;
}

interface EntryRow {
  readonly id: number;
  readonly journalId: string;
  readonly accountId: string;
  readonly amount: bigint;
}

export interface OutboxRow {
  readonly id: string;
  readonly channel: string;
  readonly recipient: string;
  readonly payload: Record<string, unknown>;
  readonly status: 'PENDING' | 'SENT' | 'DEAD';
  readonly attempts: number;
}

interface State {
  readonly accounts: Map<string, AccountRow>;
  readonly journals: Map<string, JournalRow>;
  readonly entries: EntryRow[];
  readonly transactions: Map<string, MomoTransactionRow>;
  readonly outbox: OutboxRow[];
  nextEntryId: number;
}

export interface MemoryDb extends MoneyDb {
  /** Everything in the outbox. One row per delivered effect, ever. */
  outbox(): readonly OutboxRow[];
  /** SUM over every posting. The one number that must always be zero. */
  ledgerSum(): bigint;
  journalCount(): number;
  journalsFor(referenceId: string): number;
  transaction_(id: string): MomoTransactionRow | undefined;
  accountBalance(ref: AccountRef): bigint;
  seedTransaction(row: NewMomoTransaction & { status?: MomoStatus }): MomoTransactionRow;
  reset(): void;
}

export interface MemoryDbOptions {
  /** Injected id generator, so a failing property case can be replayed exactly. */
  readonly uuid?: () => string;
  readonly now?: () => Date;
  /**
   * Yield to the microtask queue inside each operation, so concurrent callers
   * genuinely interleave. Without this the concurrency test proves nothing,
   * because a single synchronous run can never race.
   */
  readonly interleave?: boolean;
}

export function createMemoryDb(options: MemoryDbOptions = {}): MemoryDb {
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const clock = options.now ?? (() => new Date());
  const yieldPoint = options.interleave === false ? async () => {} : async () => Promise.resolve();

  let state: State = emptyState();

  function emptyState(): State {
    return {
      accounts: new Map(),
      journals: new Map(),
      entries: [],
      transactions: new Map(),
      outbox: [],
      nextEntryId: 1,
    };
  }

  function balanceOf(accountId: string): bigint {
    return state.entries.reduce<bigint>(
      (a, e) => (e.accountId === accountId ? a + e.amount : a),
      0n,
    );
  }

  async function runTransaction<T>(fn: (tx: MoneyTx) => Promise<T>): Promise<T> {
    const undo: (() => void)[] = [];
    const touchedJournals = new Set<string>();
    const touchedAccounts = new Set<string>();

    const tx: MoneyTx = {
      async ensureAccount(ref) {
        await yieldPoint();
        const key = accountKey(ref);
        const existing = state.accounts.get(key);
        if (existing) return existing.id;

        const row: AccountRow = { id: uuid(), ref, allowNegative: allowsNegative(ref.type) };
        state.accounts.set(key, row);
        undo.push(() => void state.accounts.delete(key));
        return row.id;
      },

      async insertJournal(input) {
        await yieldPoint();
        const row: JournalRow = {
          id: uuid(),
          kind: input.kind,
          referenceId: input.referenceId ?? null,
          memo: input.memo ?? null,
          createdAt: clock(),
        };
        state.journals.set(row.id, row);
        undo.push(() => void state.journals.delete(row.id));
        return row.id;
      },

      async insertEntries(journalId: string, entries: readonly LedgerEntryDraft[]) {
        await yieldPoint();
        if (!state.journals.has(journalId)) {
          throw new AppException({ kind: 'NOT_FOUND', resource: `journal ${journalId}` });
        }
        const inserted: EntryRow[] = [];
        for (const e of entries) {
          if (e.amount === 0n) {
            // `constraint amount_nonzero check (amount <> 0)`
            throw new AppException({
              kind: 'VALIDATION',
              field: 'amount',
              message: 'a ledger entry cannot be zero',
            });
          }
          const row: EntryRow = {
            id: state.nextEntryId++,
            journalId,
            accountId: e.accountId,
            amount: e.amount,
          };
          state.entries.push(row);
          inserted.push(row);
          touchedAccounts.add(e.accountId);
        }
        touchedJournals.add(journalId);
        undo.push(() => {
          for (const row of inserted) {
            const at = state.entries.indexOf(row);
            if (at >= 0) state.entries.splice(at, 1);
          }
        });
      },

      /**
       * ⚠️ THE GUARDED TRANSITION, and the reason this file has no locks.
       *
       * There is NO `await` between reading the status and writing it. That is
       * the whole point: in JavaScript a synchronous check-and-set cannot be
       * interleaved, which is exactly the exclusion Postgres gives us with
       * `WHERE id = $1 AND status IN (...)` on a single row.
       *
       * Returning null (zero rows) is SUCCESS for the caller, not an error.
       */
      async claimTransition(input: ClaimInput): Promise<ClaimResult | null> {
        const row = state.transactions.get(input.id);
        if (!row) return null;
        if (!input.from.includes(row.status)) return null;
        if (isTerminal(row.status)) return null;

        const previousStatus = row.status;
        const next: MomoTransactionRow = {
          ...row,
          status: input.to,
          updatedAt: input.at,
          resolvedAt: isTerminal(input.to) ? input.at : row.resolvedAt,
        };
        state.transactions.set(row.id, next);
        undo.push(() => void state.transactions.set(row.id, row));
        return { row: next, previousStatus };
      },

      async attachJournal(transactionId, journalId) {
        // Also synchronous on purpose — write-once has to be atomic.
        const row = state.transactions.get(transactionId);
        if (!row) return false;
        if (row.journalId !== null) return false;
        const next = { ...row, journalId };
        state.transactions.set(transactionId, next);
        undo.push(() => void state.transactions.set(transactionId, row));
        return true;
      },

      async enqueueOutbox(draft: OutboxDraft) {
        await yieldPoint();
        const row: OutboxRow = {
          id: uuid(),
          channel: draft.channel,
          recipient: draft.recipient,
          payload: draft.payload,
          status: 'PENDING',
          attempts: 0,
        };
        state.outbox.push(row);
        undo.push(() => {
          const at = state.outbox.indexOf(row);
          if (at >= 0) state.outbox.splice(at, 1);
        });
        return row.id;
      },

      async insertTransaction(input: NewMomoTransaction) {
        await yieldPoint();
        if (state.transactions.has(input.id)) {
          throw new AppException({
            kind: 'CONFLICT',
            message: `momo_transaction ${input.id} already exists`,
          });
        }
        for (const existing of state.transactions.values()) {
          if (existing.externalId === input.externalId) {
            // `create unique index momo_transaction_external_id_key`
            throw new AppException({
              kind: 'CONFLICT',
              message: `external_id ${input.externalId} already used`,
            });
          }
        }
        const at = clock();
        const row: MomoTransactionRow = {
          id: input.id,
          product: input.product,
          status: 'INITIATED',
          amountMinor: input.amountMinor,
          currency: input.currency ?? 'ZAR',
          counterparty: input.counterparty,
          externalId: input.externalId,
          purpose: input.purpose,
          subjectId: input.subjectId ?? null,
          initiatedBy: input.initiatedBy ?? null,
          attemptCount: 0,
          journalId: null,
          createdAt: at,
          updatedAt: at,
          resolvedAt: null,
        };
        state.transactions.set(row.id, row);
        undo.push(() => void state.transactions.delete(row.id));
        return row;
      },

      async getTransaction(id) {
        await yieldPoint();
        return state.transactions.get(id) ?? null;
      },

      async bumpAttempt(id) {
        const row = state.transactions.get(id);
        if (!row) return 0;
        const next = { ...row, attemptCount: row.attemptCount + 1 };
        state.transactions.set(id, next);
        undo.push(() => void state.transactions.set(id, row));
        return next.attemptCount;
      },

      async listUnresolved({ limit, since }) {
        await yieldPoint();
        return [...state.transactions.values()]
          .filter((r) => isClaimable(r.status) && r.createdAt >= since)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, limit);
      },

      async ledgerSum() {
        await yieldPoint();
        return state.entries.reduce<bigint>((a, e) => a + e.amount, 0n);
      },

      async countJournalsFor(referenceId) {
        await yieldPoint();
        return [...state.journals.values()].filter((j) => j.referenceId === referenceId).length;
      },

      async accountBalance(accountId) {
        await yieldPoint();
        return balanceOf(accountId);
      },
    };

    try {
      const result = await fn(tx);
      assertCommitInvariants(touchedJournals, touchedAccounts);
      return result;
    } catch (e) {
      // Roll back in reverse order, the way a real ROLLBACK unwinds.
      for (let i = undo.length - 1; i >= 0; i--) undo[i]?.();
      throw e;
    }
  }

  /** The DEFERRABLE INITIALLY DEFERRED checks, run at commit exactly as in SQL. */
  function assertCommitInvariants(journals: Set<string>, accounts: Set<string>): void {
    for (const journalId of journals) {
      const total = state.entries.reduce<bigint>(
        (a, e) => (e.journalId === journalId ? a + e.amount : a),
        0n,
      );
      if (total !== 0n) {
        throw new LedgerConstraintError(`journal ${journalId} does not balance: ${total}`);
      }
    }

    for (const accountId of accounts) {
      const account = [...state.accounts.values()].find((a) => a.id === accountId);
      if (!account || account.allowNegative) continue;
      const balance = balanceOf(accountId);
      const overdrawn = isDebitNormal(account.ref.type) ? balance < 0n : balance > 0n;
      if (overdrawn) {
        throw new LedgerConstraintError(
          `account ${accountId} (${account.ref.type}) overdrawn: ${balance}`,
        );
      }
    }
  }

  return {
    transaction: runTransaction,

    outbox: () => state.outbox,

    ledgerSum: () => state.entries.reduce<bigint>((a, e) => a + e.amount, 0n),

    journalCount: () => state.journals.size,

    journalsFor: (referenceId) =>
      [...state.journals.values()].filter((j) => j.referenceId === referenceId).length,

    transaction_: (id) => state.transactions.get(id),

    accountBalance: (ref) => {
      const account = state.accounts.get(accountKey(ref));
      return account ? balanceOf(account.id) : 0n;
    },

    seedTransaction(input) {
      const at = clock();
      const row: MomoTransactionRow = {
        id: input.id,
        product: input.product,
        status: input.status ?? 'PENDING',
        amountMinor: input.amountMinor,
        currency: input.currency ?? 'ZAR',
        counterparty: input.counterparty,
        externalId: input.externalId,
        purpose: input.purpose,
        subjectId: input.subjectId ?? null,
        initiatedBy: input.initiatedBy ?? null,
        attemptCount: 0,
        journalId: null,
        createdAt: at,
        updatedAt: at,
        resolvedAt: null,
      };
      state.transactions.set(row.id, row);
      return row;
    },

    reset() {
      state = emptyState();
    },
  };
}
