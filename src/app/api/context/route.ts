/**
 * `GET /api/context` — the chat rail's data, from the ledger.
 *
 * The rail used to be `contextSnapshot()` from `src/lib/agent/mock.ts`: a
 * deterministic fake, honestly labelled, and completely invented. That was fine
 * while the chat beside it was also mocked. It stopped being fine the moment
 * the conversation started answering from Postgres — a sidebar stating R2,300
 * next to a reply stating R12.50, from the same database, is the contradiction
 * a judge notices before you finish the sentence.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
 *
 * `next` — the "next due" obligation. There are no bills, no stokvel schedules
 * and no contribution cadences in the ledger yet, so there is nothing true to
 * put there. It is optional in `KasiContext` and this route omits it; the rail
 * drops the block rather than counting down to an invented date.
 *
 * `queued` is `0` and will stay `0` until the offline queue exists (S2). Same
 * reasoning: a number that is honestly zero beats one that looks busier.
 */

import { ensureMoneyDb } from '@/server/db/bootstrap';
import { log } from '@/server/log';
import { readTransactions, readWallet } from '@/server/agent/tools';
import { toWire } from '@/lib/agent/wire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  // Bind in THIS route's instance — serverless isolates each one (MISTAKES.md M8).
  ensureMoneyDb();

  try {
    const [wallet, activity] = await Promise.all([readWallet(), readTransactions(365, 6)]);

    const recent =
      activity.type === 'transactions'
        ? activity.items.map((t) => ({
            id: t.id,
            label: t.label,
            at: t.at,
            direction: t.direction,
            status: t.status,
            money: t.money,
            // Tapping a row reopens the full artifact — no second model call.
            artifact: activity,
          }))
        : [];

    return Response.json(
      toWire({
        balances: wallet.type === 'wallet' ? wallet.balances : [],
        wallet,
        recent,
        queued: 0,
      }),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    log('error', 'context.read.failed', { error: e instanceof Error ? e.message : 'unknown' });
    // 200 with an empty rail, not a 500. The chat must still work when the rail
    // cannot be drawn, and the client leaves it hidden rather than faking it.
    return Response.json(toWire({ balances: [], wallet: null, recent: [], queued: 0 }));
  }
}
