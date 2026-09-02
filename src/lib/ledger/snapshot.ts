/**
 * The shape of a ledger read, as it crosses the server → client boundary.
 *
 * These live in `src/lib` rather than beside the query that produces them
 * (`src/server/ledger/read.ts`) for one specific reason: a `'use client'`
 * component needs them, and `tests/unit/ledger/single-writer.test.ts` fails the
 * build when any client file so much as mentions `@/server`.
 *
 * That guard is deliberately blunt — it greps the file rather than parsing the
 * imports, so even an `import type`, which TypeScript erases entirely and which
 * could never pull server code into a browser bundle, trips it. Loosening it to
 * understand `import type` would be the wrong repair. In a PUBLIC repository
 * the thing it protects is the service-role key (ADR-0010), and a guard that is
 * occasionally inconvenient is worth far more than one that reasons about
 * syntax and can therefore be reasoned around.
 *
 * So the types move to where both sides may hold them, and the guard keeps its
 * teeth.
 *
 * ── EVERY AMOUNT HERE IS A DECIMAL STRING ────────────────────────────────────
 *
 * Money is `bigint` everywhere else (CLAUDE.md #1), but `bigint` has no
 * representation in React's server → client serialisation. Narrowing it to a
 * `number` to get it across would reintroduce the floating-point bug ADR-0004
 * exists to prevent. So the wire format is a lossless decimal string, revived
 * with `BigInt()` on arrival. It is a transport encoding, not an arithmetic
 * type: nothing adds these together while they are still strings.
 */

export interface LedgerTxn {
  readonly id: string;
  readonly at: string;
  readonly purpose: string;
  readonly status: string;
  /** Minor units, as a decimal string. Revive with `BigInt()`. */
  readonly amountMinor: string;
  /** Last four digits only — POPIA s105/106, docs/14 §5. */
  readonly counterpartyMasked: string;
  readonly journalId: string | null;
}

export interface LedgerPosting {
  readonly accountId: string;
  readonly accountType: string;
  /** Minor units, signed. Positive = debit, negative = credit. */
  readonly amountMinor: string;
}

export interface LedgerSnapshot {
  readonly txns: readonly LedgerTxn[];
  readonly postings: readonly LedgerPosting[];
  readonly journalId: string | null;
  /** Every posting in the database, summed. Must be exactly `"0"`. */
  readonly globalSum: string;
  readonly postingCount: number;
  readonly accountCount: number;
}
