/**
 * `POST /api/momo/callback/[kind]` — the MoMo callback (docs/03 §3.1, A5 §3).
 *
 * THIS ROUTE IS UNTRUSTED BY DESIGN.
 *
 * MTN's sandbox does not sign callbacks (**[U]** — momoAPIs.md §14 has it on the
 * portal checklist; if signing turns out to exist, use it). Until that is
 * confirmed, the body is treated as untrusted input that can only trigger a
 * LOOKUP:
 *
 *   - the body is NEVER used to set a status directly
 *   - we take the reference id from it, then call MoMo OURSELVES to read the
 *     authoritative status
 *   - unknown reference ids are logged and ignored, never created
 *   - the route is rate-limited and returns 200 unconditionally, so a probe
 *     learns nothing
 *
 * The worst a forged callback can do is make us ask MTN about a transaction we
 * already own. That is the whole blast radius, and it is the answer to "what if
 * someone POSTs to your webhook?"
 *
 * The callback is a LATENCY OPTIMISATION, not a correctness requirement. If MTN
 * never calls us, the reconciler resolves everything within five minutes.
 */

import { getMoneyDb } from '@/server/db';
import { log } from '@/server/log';
import { createRateLimiter, extractReferenceId, isCallbackKind } from '@/server/momo/callback';
import { resolveTransaction } from '@/server/momo/resolve';
import { getMomoClient } from '@/lib/momo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rateLimited = createRateLimiter();

export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind } = await context.params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Every exit from here is `200 OK` with an empty body. A probe cannot tell a
  // valid reference id from an invalid one, an existing transaction from a
  // missing one, or a rate limit from a success.
  try {
    if (!isCallbackKind(kind) || rateLimited(`${ip}:${kind}`)) return ok();

    const body: unknown = await request.json().catch(() => null);
    const referenceId = extractReferenceId(body, new URL(request.url));

    if (!referenceId) {
      log('info', 'momo.callback.unusable', { kind });
      return ok();
    }

    if (kind !== 'collection') {
      // Disbursements and remittances are M3a/S3. Acknowledge and drop — the
      // reconciler picks the transaction up regardless.
      log('info', 'momo.callback.unsupported_kind', { kind, correlation_id: referenceId });
      return ok();
    }

    // AUTHORITATIVE READ. The callback told us WHICH transaction to look at and
    // nothing more; MTN tells us what happened to it.
    const status = await getMomoClient().collections.getStatus(referenceId);

    const result = await resolveTransaction(
      { db: getMoneyDb() },
      { referenceId, observed: status.status, response: status.raw },
    );

    log('info', 'momo.callback.resolved', {
      correlation_id: referenceId,
      kind,
      observed: status.status,
      applied: result.applied,
      reason: result.reason,
    });
  } catch (e) {
    // Including "no database adapter configured" and any upstream failure. The
    // reconciler is the authoritative path, so a failed callback costs latency
    // and nothing else.
    log('warn', 'momo.callback.failed', {
      kind,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return ok();
}

function ok(): Response {
  return new Response(null, { status: 200 });
}
