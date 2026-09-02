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
