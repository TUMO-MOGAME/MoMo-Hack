/**
 * ⚠️ THE SINGLE LEDGER WRITER.
 *
 * This is the only function in the codebase that writes to `ledger_entry`.
 * Not "the only one we know about" — the only one, enforced three ways:
 *
 *   1. `tests/unit/ledger/single-writer.test.ts` scans `src/**` and fails the
 *      build if `insertEntries` is called anywhere else.
 *   2. `ledger_entry` has RLS enabled and NO policies, so only the service-role
 *      client can reach it at all (ADR-0010).
 *   3. The database refuses an unbalanced journal at COMMIT (0001_ledger.sql,
 *      trigger I1), so even a rogue writer cannot leave the books wrong.
 *
 * A second write path is a **Critical** finding (A1 §3, A5 §1). Everything that
 * moves money calls in here.
 */

import { accountKey } from '@/domain/ledger/accounts';
import { type JournalDraft, assertWritable, mergePostings } from '@/domain/ledger/journal';
import type { LedgerEntryDraft, MoneyTx } from '@/server/db/types';

export interface WriteJournalResult {
  readonly journalId: string;
  readonly entries: number;
  /** Always 0n. Returned so callers can assert it without a second query. */
  readonly total: bigint;
}

/**
 * Write one balanced journal, atomically, inside the caller's transaction.
 *
 * The caller MUST already be inside `db.transaction(...)`. That is not a style
 * preference: on the resolve path the postings and the `PENDING -> SUCCESSFUL`
 * status change have to commit together, or a crash between them leaves a
 * transaction marked paid with no money recorded (docs/01 §6 rule 4).
 */
export async function writeJournal(tx: MoneyTx, draft: JournalDraft): Promise<WriteJournalResult> {
  // Merge first, THEN validate: merging can cancel two postings to zero, and a
  // zero posting is illegal. Validating first would reject a legitimate journal
  // that credits and debits the same account.
  const postings = mergePostings(draft.postings);
  const normalised: JournalDraft = { ...draft, postings };

  // Fails here, at the call site, naming the kind and the drift — rather than
  // as a Postgres exception at COMMIT with nothing but a journal uuid.
  assertWritable(normalised);

  const journalId = await tx.insertJournal({
    kind: normalised.kind,
    referenceId: normalised.referenceId ?? null,
    memo: normalised.memo ?? null,
  });

  const entries: LedgerEntryDraft[] = [];
  for (const posting of postings) {
    // Sequential, not Promise.all: `ensureAccount` is an upsert on a natural
    // key, and firing eleven of them concurrently inside one transaction is how
    // you deadlock on the unique index.
    const accountId = await tx.ensureAccount(posting.account);
    entries.push({ accountId, amount: posting.amount });
  }

  await tx.insertEntries(journalId, entries);

  return {
    journalId,
    entries: entries.length,
    total: entries.reduce<bigint>((a, e) => a + e.amount, 0n),
  };
}

/**
 * Human-readable one-liner for the console and the structured logs. Contains
 * account TYPES and amounts, never an MSISDN and never a name.
 */
export function describeJournal(draft: JournalDraft): string {
  const parts = draft.postings.map((p) => `${accountKey(p.account)}=${p.amount}`);
  return `${draft.kind}[${parts.join(' ')}]`;
}
