/**
 * `GET /api/health` — liveness, and the Supabase keep-alive.
 *
 * A Supabase free project pauses after 7 days idle (STATUS.md risk register).
 * The GitHub Actions scheduler curls this on every tick, which both proves the
 * app is up and keeps the database awake.
 *
 * It is on the PUBLIC route allowlist (docs/04 §10), so it must leak nothing:
 * no version strings, no environment names, no key fragments, no counts that
 * would tell an attacker how busy we are. Booleans and a mode, and that is all.
 */

import { moneyDbAvailable } from '@/server/db/bootstrap';
import { readMomoMode } from '@/lib/momo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      // Read per-request, never captured at build time (docs/03 §5). During the
      // demo this is how we confirm which client is live before we present.
      momoMode: readMomoMode(),
      // `moneyDbAvailable()` BINDS the adapter if DATABASE_URL is present, so
      // this reports whether the app can actually reach Postgres. It used to
      // call `hasMoneyDb()`, which asked "has anything been bound" — and since
      // nothing in src/ ever called setMoneyDb, the honest answer was always
      // "unconfigured", however correct the environment was.
      database: moneyDbAvailable() ? 'configured' : 'unconfigured',
      at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
