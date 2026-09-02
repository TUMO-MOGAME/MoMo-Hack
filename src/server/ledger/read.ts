/**
 * READ-ONLY ledger queries, for surfaces that display money.
 *
 * ⚠️ SERVER ONLY. This module opens a Postgres connection with the credentials
 * in `DATABASE_URL` and must never be imported by a `'use client'` file
 * (ADR-0010, CLAUDE.md #5). The browser never touches the ledger.
 *
 * ── WHY EVERY AMOUNT LEAVES HERE AS A STRING ─────────────────────────────────
 *
 * Money is `bigint` everywhere in this codebase (CLAUDE.md #1) and **`bigint`
 * cannot cross a Server Component → Client Component boundary**: React's
 * serialisation has no representation for it, so the page throws at render.
 * Rounding it into a `number` to get it across would reintroduce exactly the
 * floating-point bug ADR-0004 exists to prevent — at the last possible moment,
 * in the one place a judge is looking.
 *
 * So the boundary carries decimal STRINGS, which are lossless, and the client
 * revives them with `BigInt()` before anything renders. The string is a
 * transport encoding, never an arithmetic type: nothing here adds, and nothing
 * downstream may either until it is a `bigint` again.
 *
 * ── AND WHY EVERY ROW CARRIES ITS SOURCE ─────────────────────────────────────
 *
 * CLAUDE.md #14: no number reaches an artifact without provenance. Each row
 * below carries the `momo_transaction.id` or `ledger_account.id` it came from,
 * so the renderer's provenance guard can prove it was read rather than
 * invented. An amount without one renders struck through and marked unverified
 * — which is the behaviour we want if this file is ever bypassed.
 */

// No `import 'server-only'` here, deliberately: it is a dependency, a new
// dependency means regenerating the lockfile on LINUX (STATUS.md, the CI
// finding), and that is not a risk worth taking for a marker import. The
// boundary is already enforced by a test that fails the build — "no client
// component can reach the service-role client" in
// `tests/unit/ledger/single-writer.test.ts` greps every `'use client'` file for
// `@/server`. A guard that runs in CI beats a marker that only documents.
import { getPool } from '@/server/db/connection';
import type { LedgerSnapshot } from '@/lib/ledger/snapshot';

export type { LedgerTxn, LedgerPosting, LedgerSnapshot } from '@/lib/ledger/snapshot';

/**
 * The last four digits only, and never the rest.
 *
 * An MSISDN is personal information (POPIA s105/106, docs/14 §5) and this one
 * renders in a browser. `momo_transaction.counterparty` holds the full number
 * because reconciliation needs it; nothing that leaves this function does.
 */
function maskMsisdn(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 4 ? '••••' : `•••• ${digits.slice(-4)}`;
}

/**
 * One round trip per question, four questions, no N+1.
 *
 * Returns empty rather than throwing when the ledger is untouched: a fresh
 * database is a legitimate state, and a demo surface that 500s on "nothing has
 * happened yet" is worse than one that says so.
 */
export async function readLedgerSnapshot(limit = 6): Promise<LedgerSnapshot> {
  const pool = getPool();

  const txns = await pool.query(
    `select id, created_at, purpose, status::text as status,
            amount_minor::text as amount_minor, counterparty, journal_id
       from momo_transaction
      order by created_at desc
      limit $1`,
    [limit],
  );

  // The newest journal that actually posted, so the page always has something
  // real to show even when the latest transaction is still resolving.
  const latest = txns.rows.find((r) => r.journal_id) ?? null;
  const journalId: string | null = latest ? String(latest.journal_id) : null;

  const postings = journalId
    ? await pool.query(
        `select e.account_id, a.type::text as type, e.amount::text as amount
           from ledger_entry e
           join ledger_account a on a.id = e.account_id
          where e.journal_id = $1
          order by e.amount desc`,
        [journalId],
      )
    : { rows: [] as Record<string, unknown>[] };

  const totals = await pool.query(
    `select coalesce(sum(amount), 0)::text as total,
            count(*)::text as postings,
            (select count(*)::text from ledger_account) as accounts
       from ledger_entry`,
  );

  const t = totals.rows[0] ?? { total: '0', postings: '0', accounts: '0' };

  return {
    txns: txns.rows.map((r) => ({
      id: String(r.id),
      at: new Date(String(r.created_at)).toISOString(),
      purpose: String(r.purpose),
      status: String(r.status),
      amountMinor: String(r.amount_minor),
      counterpartyMasked: maskMsisdn(String(r.counterparty ?? '')),
      journalId: r.journal_id ? String(r.journal_id) : null,
    })),
    postings: postings.rows.map((r) => ({
      accountId: String(r.account_id),
      accountType: String(r.type),
      amountMinor: String(r.amount),
    })),
    journalId,
    globalSum: String(t.total),
    postingCount: Number(t.postings),
    accountCount: Number(t.accounts),
  };
}
