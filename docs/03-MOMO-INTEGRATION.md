# 03 — MoMo Integration Patterns

> **The API facts live in [`momoAPIs.md`](../momoAPIs.md)** — endpoints, headers, test MSISDNs,
> confidence ratings, re-verification protocol. This document is about *how we implement against
> them*: the client, idempotency, resolution, and the emulator.
>
> If those two documents ever disagree, `momoAPIs.md` wins and this one is stale.

---

## 1. The client

`src/lib/momo/` — the only place in the codebase that speaks HTTP to MTN.

```
src/lib/momo/
  client.ts        # request(), auth, retry, error mapping
  token.ts         # per-product token cache
  currency.ts      # the ZAR/EUR shim (momoAPIs.md §11)
  collections.ts   # requestToPay, getRequestToPayStatus
  disbursements.ts # transfer, getTransferStatus
  remittances.ts   # transfer, getTransferStatus
  emulator/        # ADR-0009
  types.ts
```

Hard rules for this tree:
- It **never touches the database.** It returns values; callers persist them.
- It **never throws raw**. Every failure becomes a `VulaError` (`docs/01` §10).
- Every function takes an explicit `referenceId` — the client never generates one, because the
  caller must have persisted it first.

### 1.1 Token cache

```ts
// One cache per product. Refresh at 80% of expires_in.
const TOKEN_TTL_SAFETY = 0.8;

async function getToken(product: MomoProduct): Promise<string> {
  const cached = cache.get(product);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const fresh = await fetchToken(product);           // POST /{product}/token/
  cache.set(product, {
    token: fresh.access_token,
    expiresAt: Date.now() + fresh.expires_in * 1000 * TOKEN_TTL_SAFETY,
  });
  return fresh.access_token;
}
```

**Serverless caveat, stated so nobody is surprised:** Vercel functions are ephemeral, so this cache
is per-instance and often cold. That is acceptable — a token call is ~300ms and we have a 10s budget.
We do **not** put tokens in the database: a shared mutable secret with no locking is worse than a
duplicated fetch. If token latency becomes a problem we will measure it first.

### 1.2 Retry policy

| Condition | Action |
|---|---|
| `401` | Refresh token, retry **once**. If it fails again, `UPSTREAM` non-retryable. |
| `409 Conflict` on a POST | The reference id was already used. **This is success** — the transaction exists upstream. Mark `PENDING` and let the reconciler resolve it. Never retry with a new id. |
| `429`, `5xx`, network error, timeout | `UPSTREAM` retryable. Do **not** retry in-request; return and let the reconciler pick it up. |
| `400`, `403`, `404` | `UPSTREAM` non-retryable. Log the full response body (minus secrets) and fail the transaction. |

**We do not retry inside the request.** One attempt, then hand off to the reconciler. This is forced
by the 10s Vercel limit and is the correct design anyway: retrying a payment inside a request that
may itself be retried by the client is how systems double-charge people.

### 1.3 Timeouts

Every outbound call gets an `AbortSignal.timeout(6000)`. Six seconds leaves ~4s of the Vercel budget
for our own work. A timeout is not a failure of the payment — the request may well have landed
upstream. It transitions to `PENDING`, never to `FAILED`.

---

## 2. Idempotency

The single most important property in this system, and we get it almost for free:

> **Our primary key is MTN's idempotency key.**
> `momo_transaction.id` (uuid v4) is sent as `X-Reference-Id`.

Consequences:
1. We must **persist before we call**. The row exists in `INITIATED` before a packet leaves.
2. A retry of the *same logical operation* reuses the same row and the same id, so MTN dedupes it.
3. A `409` from MTN means "I already have this" — which is exactly what we want to hear.
4. There is no scenario where a network failure causes a second payment, because a second payment
   would require a second uuid, and only the caller that created the row has one.

```ts
// The canonical shape. Every money-moving route follows it.
export async function initiateCollection(input: CollectionInput) {
  const id = crypto.randomUUID();

  await db.momoTransaction.insert({          //  <-- durable first
    id, product: 'COLLECTION', status: 'INITIATED',
    amountMinor: input.amountMinor, counterparty: input.msisdn,
    externalId: input.externalId, purpose: input.purpose,
  });

  try {
    await momo.collections.requestToPay(id, input);   // 202, no body
    await db.momoTransaction.markPending(id);
  } catch (e) {
    if (isConflict(e)) { await db.momoTransaction.markPending(id); }
    else if (isRetryable(e)) { /* leave INITIATED; reconciler retries */ }
    else { await db.momoTransaction.markFailed(id, e); }
  }

  return { transactionId: id };              //  <-- client subscribes to Realtime on this
}
```

Note what is **absent**: no waiting, no polling, no ledger write. Under 10s, always.

---

## 3. Resolution: two independent paths

MoMo is asynchronous. We assume the callback is a bonus, not a guarantee.

```
   Path A — callback (fast, unreliable)
     MoMo -> POST /api/momo/callback/collection
       - verify it is plausibly from MTN (see §3.1)
       - look up the transaction by reference id
       - attempt the guarded transition
       - if 0 rows changed: already resolved, return 200 and stop

   Path B — reconciler (slow, reliable, authoritative)
     GitHub Actions every 5 min -> POST /api/cron/reconcile
       - select id from momo_transaction
          where status in ('INITIATED','PENDING')
            and created_at > now() - interval '24 hours'
          order by created_at limit 50
       - for each: GET status from MoMo, attempt the same guarded transition
       - INITIATED rows older than 60s are re-sent (the original POST may never have landed)
```

Both paths call **the same function**. There is exactly one implementation of "resolve a
transaction", and it is safe to call any number of times from any number of callers.

```sql
-- The guarded transition. This is the whole concurrency story.
update momo_transaction
   set status = $2, last_response = $3, resolved_at = now(), updated_at = now()
 where id = $1 and status in ('INITIATED','PENDING')
returning *;
-- 0 rows => someone else already resolved it. Not an error. Stop.
```

On a transition to `SUCCESSFUL`, and **only** there, the ledger journal is written in the same
database transaction, and `momo_transaction.journal_id` is set. The partial unique index from
`docs/02` §3.5 makes a second journal physically impossible.

### 3.1 Callback authenticity

MTN's sandbox does not sign callbacks (**[U]** — confirm on the portal; if signing exists, use it).
Until confirmed, the callback endpoint is treated as **untrusted input that can only trigger a
lookup**, never as a source of truth:

- The callback body is **never** used to set a status directly.
- We take the reference id from it, then **call MoMo ourselves** to read the authoritative status.
- Unknown reference ids are logged and ignored, never created.
- The route is rate-limited and returns `200` unconditionally, so a probe learns nothing.

This means a forged callback can, at worst, cause us to make one extra status call about a
transaction we already own. That is an acceptable blast radius and it is defensible to a judge who
asks "what if someone POSTs to your webhook?"

---

## 4. Orchestration: escrow

The gig flow, which is where three APIs meet.

```
  CLIENT                    VULA                       WORKER
    |                        |                            |
    |-- post job ----------->|                            |
    |                        |-- job OPEN --------------->|
    |                        |<-- accept -----------------|
    |                        |                            |
    |<-- pay request --------|  requesttopay (Collections)
    |-- approve on phone --->|
    |                        |  on SUCCESSFUL:
    |                        |    journal: MOMO_SETTLEMENT +P
    |                        |             ESCROW_HOLD(job) -P
    |                        |  job -> FUNDED
    |                        |-- "money is secured" ----->|
    |                        |                            |
    |                        |<-- photo proof ------------|
    |<-- review prompt ------|                            |
    |-- approve ------------>|                            |
    |                        |  job -> APPROVED
    |                        |  transfer (Disbursements)
    |                        |  on SUCCESSFUL:
    |                        |    journal: ESCROW_HOLD(job) +P
    |                        |             PLATFORM_FEE     -fee
    |                        |             MOMO_SETTLEMENT  -(P-fee)
    |                        |  job -> RELEASED, trust_score++
    |                        |-- "you have been paid" --->|
```

**The two-phase structure is the product.** The client's money leaves their wallet at *funding*, not
at *approval* — which is what makes the worker willing to start. The worker's money is guaranteed at
*funding*, not at *release* — which is what makes the trust real rather than rhetorical.

Failure branches, all of which need to work in the demo:
- Client never approves the collection → job returns to `OPEN` after 15 min, worker notified.
- Worker never submits proof → escrow auto-refunds to client after the job deadline.
- Client never reviews → auto-approve after 48h (stated in the UI up front).
- Disbursement fails → funds **stay in escrow**, job goes `DISPUTED`, rank admin can intervene.
  Money never evaporates; it sits in a named account with an owner.

---

## 5. The emulator (ADR-0009)

`src/lib/momo/emulator/` implements the same interface as the real client.

**Why this is not over-engineering:** the sandbox had reported outages in July 2026
(`momoAPIs.md` §13). A hackathon demo that dies because someone else's sandbox is down is an
unforced loss. The emulator also makes CI deterministic and fast, which we need anyway.

Design:
- **Built from recorded real responses.** A `npm run momo:record` script captures genuine sandbox
  responses into `src/lib/momo/emulator/fixtures/*.json`. The emulator replays those, so its
  behaviour is real behaviour, not our guess at it.
- Honours the test MSISDN table exactly (`momoAPIs.md` §10).
- Simulates asynchrony: `requestToPay` returns 202, then the status flips after a configurable delay.
- Can fire genuine callbacks at our own webhook, so the callback path is exercised locally.
- Configurable failure injection: `MOMO_EMULATOR_FAIL_RATE`, `MOMO_EMULATOR_LATENCY_MS`.

Selection:
```ts
export const momo = process.env.MOMO_MODE === 'emulator'
  ? createEmulatorClient()
  : createSandboxClient();
```

| Environment | `MOMO_MODE` | Why |
|---|---|---|
| Local dev | `emulator` | Fast, offline, deterministic |
| CI | `emulator` | Tests must never depend on a third party |
| Preview | `sandbox` | Real integration verification |
| Production / demo | `sandbox`, **switchable to `emulator` by env var without a redeploy** | Demo insurance |

> The switch is an environment variable read per-request, not a build-time constant. If the sandbox
> dies ninety seconds before we present, we flip it in the Vercel dashboard and the demo continues.
> Rehearse this. It is in `docs/08-DEMO-RUNBOOK.md`.

**Integrity commitment:** if we present against the emulator, we say so out loud. The pitch line is
*"we built a recorded-response emulator so the demo is deterministic; here is the same flow against
the live sandbox"* — which reads as engineering maturity. Pretending an emulator is the live sandbox
would be dishonest and, in front of MTN engineers, a losing move.

---

## 6. Environment variables

```bash
# MoMo — three subscriptions, one identity (momoAPIs.md §3)
MOMO_COLLECTION_SUBSCRIPTION_KEY=
MOMO_DISBURSEMENT_SUBSCRIPTION_KEY=
MOMO_REMITTANCE_SUBSCRIPTION_KEY=
MOMO_API_USER=
MOMO_API_KEY=
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com
MOMO_CALLBACK_HOST=momo-hack.vercel.app          # host only
MOMO_MODE=sandbox                                 # sandbox | emulator

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=                        # server only, never NEXT_PUBLIC_

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Scheduler
CRON_SECRET=
```

Rules:
- Nothing secret is ever prefixed `NEXT_PUBLIC_`. A lint rule enforces this.
- `.env.example` is committed with every key present and every value blank. `.env.local` is ignored.
- CI runs `gitleaks` on every PR. A leaked key fails the build.
- If a key is ever committed, it is rotated immediately — the repo is **public** (ADR-0005), so
  assume anything pushed is compromised the moment it lands.
