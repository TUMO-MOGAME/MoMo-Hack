/**
 * `POST /api/cron/reconcile` — the reconciliation tick (docs/03 §3 path B).
 *
 * Driven by GitHub Actions every five minutes (ADR-0006), because Vercel Hobby
 * cron runs once per day and reconciliation needs minutes, not days.
 *
 * AUTHORISATION IS NOT OPTIONAL HERE. An unauthenticated cron route lets anyone
 * trigger settlement, which A5 §3 grades **High**. The bearer must match
 * `CRON_SECRET` exactly, compared in constant time — see `src/server/cron/auth`.
 */

import { getMoneyDb } from '@/server/db';
import { ensureMoneyDb } from '@/server/db/bootstrap';
import { isAuthorisedCron } from '@/server/cron/auth';
import { log } from '@/server/log';
import { reconcile } from '@/server/momo/reconcile';
import { getMomoClient } from '@/lib/momo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorisedCron(request)) {
    // No detail. A caller without the secret learns only that it was rejected.
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    // BIND THE ADAPTER FIRST. `setMoneyDb` writes a module-scoped singleton, and
    // in serverless each route is its own isolated instance — so a binding made
    // by `/api/health` does not exist here. Locally it looks fine, because
    // `next dev` is ONE process and hitting health first binds it for everybody.
    // In production this route 500s on every tick until it binds its own.
    ensureMoneyDb();

    // One tick, 50 rows, one attempt each — comfortably inside the 10s Vercel
    // Hobby budget. Anything it does not reach, the next tick does.
    const report = await reconcile({ db: getMoneyDb(), client: getMomoClient() });
    return Response.json({ ok: true, ...report });
  } catch (e) {
    log('error', 'cron.reconcile.failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
    return Response.json({ ok: false, error: 'reconcile failed' }, { status: 500 });
  }
}

/** GET is rejected: the tick has side effects, so it is never a GET. */
export async function GET(): Promise<Response> {
  return Response.json({ error: 'method not allowed' }, { status: 405 });
}
