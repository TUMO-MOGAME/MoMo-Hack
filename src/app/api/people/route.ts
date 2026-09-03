/**
 * `GET /api/people` — the roster on the opening screen.
 *
 * Six rows from `demo_persona`, which holds PEOPLE and no money. Every figure
 * on this screen that represents an amount of money still comes from the
 * ledger through `/api/context`; the only number here is `usualMinor`, which
 * is what you typically send someone, never a balance and never a total
 * (CLAUDE.md #14 — a roster row must not look like a ledger row).
 *
 * Empty on failure, not a 500. The opening screen must draw when the database
 * is unreachable; it drops the block rather than inventing a family.
 */

import { ensureMoneyDb } from '@/server/db/bootstrap';
import { log } from '@/server/log';
import { readRoster } from '@/server/agent/roster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  // Bind in THIS route's instance — serverless isolates each one (MISTAKES.md M8).
  ensureMoneyDb();

  try {
    const people = await readRoster();

    return Response.json(
      {
        people: people.map((p) => ({
          ...p,
          // JSON has no bigint. Serialised as a STRING so it cannot silently
          // become a float on the way through — the client parses it back.
          usualMinor: p.usualMinor === null ? null : String(p.usualMinor),
        })),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    log('error', 'people.read.failed', { error: e instanceof Error ? e.message : 'unknown' });
    return Response.json({ people: [] });
  }
}
