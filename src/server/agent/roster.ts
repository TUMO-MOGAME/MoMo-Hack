/**
 * The demo roster — who this operator supports, read from `demo_persona`.
 *
 * ⚠️ SERVER ONLY — opens the service-role Postgres connection (ADR-0010).
 * The TYPES live in `@/lib/roster` so that a client component can import them
 * without importing this file; see that file's header for why an `import type`
 * across this boundary was not good enough.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────────
 *
 * It is a list of PEOPLE. It holds no balances, no amounts owed and no payment
 * history, and it deliberately cannot: `usual_minor` is what you TYPICALLY
 * send someone, not what you have sent them and not what you owe them.
 * Anything resembling a balance still comes from the ledger, through
 * `tools.ts`, with a `sourceTxnId` on it (CLAUDE.md #14).
 *
 * That separation is the whole point. A roster row beside a ledger figure is
 * safe; a roster row that *carries* a figure is a number with no provenance
 * sitting on the same screen as numbers that have one, and nobody looking at
 * the screen can tell which is which.
 *
 * ── EVERY PAYOUT LANDS IN ONE WALLET, AND THE ROW SAYS SO ────────────────────
 *
 * There is one MTN account in this demo. `settlesToOperatorWallet` is carried
 * up from the database rather than assumed here, so a UI can state it instead
 * of implying six wallets that do not exist. See `0003_demo_roster.sql`.
 */

import { getPool } from '@/server/db/connection';
import {
  parseEnumArray,
  SUPPORT_KINDS,
  type KinRelation,
  type Person,
  type SupportKind,
} from '@/lib/roster';

export type { KinRelation, Person, SupportKind };
export { parseEnumArray };

export async function readRoster(): Promise<readonly Person[]> {
  const { rows } = await getPool().query(
    `select id, display_name, relation, supports, usual_minor, settles_to_operator_wallet
       from demo_persona
      order by sort_order`,
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.display_name),
    relation: r.relation as KinRelation,
    // An unknown value is DROPPED rather than rendered. If a later migration
    // adds a support kind the UI has no icon or label for, the row still
    // draws — it just does not claim a category it cannot name.
    supports: parseEnumArray(r.supports).filter((s): s is SupportKind => SUPPORT_KINDS.has(s)),
    // `bigint` all the way (CLAUDE.md #1). pg returns bigint as a string, which
    // is exactly right — `Number()` here is how cents become a float.
    usualMinor: r.usual_minor === null ? null : BigInt(r.usual_minor),
    settlesToOperatorWallet: r.settles_to_operator_wallet === true,
  }));
}
