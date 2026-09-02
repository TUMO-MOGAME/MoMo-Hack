/**
 * `POST /api/agent` — the web chat's half of the agent (S7a).
 *
 * Thin on purpose. Everything that decides anything lives in
 * `src/server/agent/respond.ts`, which the Telegram handler calls too. This
 * route validates input, rate-limits, and serialises — nothing else. That is
 * what keeps the two channels answering identically: there is only one answer.
 *
 * ── WHAT THIS ROUTE CANNOT DO ────────────────────────────────────────────────
 *
 * Move money. Not "will not" — cannot. `respond()` reaches three read-only
 * tools and there is no write tool in the module graph below it (ADR-0014,
 * CLAUDE.md #11). The worst a hostile message achieves is a wrong card and one
 * model call.
 *
 * ── UNAUTHENTICATED, AND SAYING SO ───────────────────────────────────────────
 *
 * There is no auth in this product yet (M9a), so this endpoint answers anyone
 * and every caller sees the same demo ledger. That is acceptable only because
 * the ledger currently holds nothing but our own test transactions, and because
 * the tools are read-only and scoped to no user.
 *
 * **It stops being acceptable the moment a real person's money is in that
 * table.** When auth lands, this route takes a session and the tools take a
 * user id — and until then the honest thing is to write that down here rather
 * than discover it later.
 */

import { createRateLimiter } from '@/server/momo/callback';
import { ensureMoneyDb } from '@/server/db/bootstrap';
import { log } from '@/server/log';
import { respond } from '@/server/agent/respond';
import { toWire } from '@/lib/agent/wire';
import type { AgentMessage } from '@/lib/agent/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A model call per request, on a free tier. Twenty a minute per IP is plenty. */
const rateLimited = createRateLimiter(20);

const MAX_MESSAGE = 500;
const MAX_HISTORY = 8;

function readHistory(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m): m is { role: string; text: string } =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as { text?: unknown }).text === 'string' &&
        typeof (m as { role?: unknown }).role === 'string',
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === 'model' ? ('model' as const) : ('user' as const),
      text: m.text.slice(0, MAX_MESSAGE),
    }));
}

/**
 * Is this request from one of our own pages? (A5-03)
 *
 * The audit found this route answering `200` to a POST carrying
 * `Origin: https://evil.example`. No `Access-Control-Allow-Origin` means a
 * browser will not let that page READ the reply — so this was never data theft.
 * It was **resource theft**: any third-party page could make its visitors'
 * browsers spend our Gemini free-tier quota, at 20/min per IP across an
 * unbounded number of IPs. A quota exhausted by someone else's site, on the
 * morning of a demo, is indistinguishable from a broken product.
 *
 * A MISSING `Origin` is allowed. Browsers always send it on a cross-origin POST,
 * so absence means a non-browser client — `curl`, the demo script, a health
 * probe — which is not the attack this defends against and is a caller we
 * actively want to keep working. This closes the browser vector, which is the
 * only one that can be pointed at strangers en masse; the rate limiter remains
 * the answer for a determined direct caller.
 */
function fromOurOwnPage(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  // The request's own host covers production, the Vercel alias, every preview
  // deployment and localhost on any port — without a list to keep in step with
  // deployment reality, which is a list that goes stale silently.
  if (host === new URL(request.url).host) return true;
  return host === 'momo.tumoolo.tech' || /^localhost(:\d+)?$/.test(host);
}

export async function POST(request: Request): Promise<Response> {
  if (!fromOurOwnPage(request)) {
    log('warn', 'agent.origin.rejected', {});
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return Response.json({ error: 'slow down' }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  const message =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message.slice(0, MAX_MESSAGE).trim()
      : '';

  if (message.length === 0) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  // Bind the adapter in THIS route's instance. Serverless isolates every route,
  // so a binding made by /api/health does not exist here (see MISTAKES.md M8).
  ensureMoneyDb();

  try {
    const turn = await respond(message, {
      history: readHistory((body as { history?: unknown }).history),
    });
    log('info', 'agent.turn', { tool: turn.tool, modelled: turn.modelled });
    return Response.json(toWire(turn), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    log('error', 'agent.turn.failed', { error: e instanceof Error ? e.message : 'unknown' });
    // Never a blank reply. The chat must always say something true.
    return Response.json({
      reply:
        'Something went wrong reaching the ledger just then. Nothing was changed — I only ever read.',
      tool: 'none',
      modelled: false,
    });
  }
}

/** GET is not a conversation. */
export async function GET(): Promise<Response> {
  return Response.json({ error: 'method not allowed' }, { status: 405 });
}
