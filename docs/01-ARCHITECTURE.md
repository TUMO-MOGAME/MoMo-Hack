# 01 — Architecture

## 1. Constraints that shaped this design

Architecture is mostly the shadow cast by constraints. Ours, verified 2026-09-02:

| Constraint | Consequence |
|---|---|
| Vercel Hobby: **10s function timeout** | No request may wait for MoMo to reach a terminal state. Everything payment-related is async by force. |
| Vercel Hobby: **cron runs once per day, max 2 jobs** | Vercel Cron is useless for reconciliation. GitHub Actions becomes our scheduler (ADR-0006). |
| GitHub Free: branch protection **only on public repos** | The repo is public (ADR-0005). Which also gives us unlimited Actions minutes. |
| Supabase Free: **2 projects**, pauses after 7 idle days | Exactly staging + prod. A keep-alive ping is mandatory, not optional. |
| Supabase Free: **500MB DB, 1GB storage** | Photo proof must be compressed client-side. Ledger rows are small; we have room. |
| MoMo sandbox: **async, EUR-only, historically flaky** | Currency shim (ADR-0008) and a local emulator (ADR-0009). |
| Solo developer, 25 days | One language, one runtime, one deploy target. No microservices. |

---

## 2. Context

```
   +---------------+     +---------------+     +---------------+
   |   Commuter    |     |    Worker     |     |  Rank admin   |
   |  (Telegram /  |     |  (Telegram /  |     |  (Web only)   |
   |   PWA / USSD) |     |   PWA / USSD) |     |               |
   +-------+-------+     +-------+-------+     +-------+-------+
           |                     |                     |
           +---------------------+---------------------+
                                 |
                                 v
                    +-------------------------+
                    |          VULA           |
                    |  Next.js on Vercel      |
                    |  Supabase Postgres      |
                    +------------+------------+
                                 |
              +------------------+------------------+
              |                  |                  |
              v                  v                  v
      +---------------+  +---------------+  +---------------+
      |  MTN MoMo     |  |   Telegram    |  |  Africa's     |
      |  Sandbox      |  |   Bot API     |  |  Talking      |
      |  Collections  |  |               |  |  (USSD)       |
      |  Disbursements|  |               |  |               |
      |  Remittances  |  |               |  |               |
      +---------------+  +---------------+  +---------------+
```

---

## 3. Containers

```
+--------------------------------------------------------------------------+
|  GitHub (public repo)                                                     |
|                                                                           |
|  Actions: CI quality gate     Actions: scheduler (*/5 * * * *)            |
|  - typecheck, lint            - POST /api/cron/reconcile                  |
|  - unit + property            - POST /api/cron/stokvel-run                |
|  - integration + RLS          - POST /api/cron/escrow-sweep               |
|  - build, e2e-critical        - GET  /api/health  (Supabase keep-alive)   |
|  - migration replay           all guarded by CRON_SECRET bearer token     |
+---------------------------------+----------------------------------------+
                                  |
                                  v
+--------------------------------------------------------------------------+
|  Vercel (Hobby) — Next.js 15 App Router, TypeScript                       |
|                                                                           |
|  app/(marketing)          public landing + pitch                          |
|  app/(app)                authenticated PWA: commuter, worker, rank       |
|  app/ussd-simulator       feature-phone simulator (demo surface)          |
|  app/console              live webhook console (Supabase Realtime)        |
|                                                                           |
|  api/momo/collections     initiate requesttopay                           |
|  api/momo/disbursements   initiate transfer                               |
|  api/momo/remittances     initiate remittance                             |
|  api/momo/callback/[kind] MoMo -> us. Replay-safe.                        |
|  api/telegram/webhook     Telegram -> us. Secret-token verified.          |
|  api/ussd                 Africa's Talking callback format                |
|  api/cron/*               scheduler targets, CRON_SECRET guarded          |
|                                                                           |
|  src/domain/*             PURE. No I/O. Ledger, splits, state machines.   |
|  src/lib/momo/*           MoMo HTTP client + emulator                     |
|  src/lib/telegram/*       Bot framework                                   |
|  src/lib/ussd/*           USSD state machine (shared with simulator)      |
|  src/server/*             DB access, service-role only                    |
+---------------------------------+----------------------------------------+
                                  |
                                  v
+--------------------------------------------------------------------------+
|  Supabase Postgres                                                        |
|  ledger_account, ledger_entry, journal      <- service role only, RLS deny |
|  wallet, profile, job, stokvel, ...         <- RLS per-owner              |
|  momo_transaction                           <- service role only          |
|  outbox                                     <- service role only          |
|  Storage: proof/                            <- signed URLs only           |
|  Realtime: journal, momo_transaction        <- powers the live console    |
+--------------------------------------------------------------------------+
```

---

## 4. The one flow that matters: a taxi fare

This is the flow we demo, and the flow every architectural decision serves.

```
 1. Commuter scans the QR on the dashboard
        |
 2. POST /api/momo/collections
        |  - validate, resolve rank + vehicle + fare
        |  - INSERT momo_transaction (id = uuidv4, status = INITIATED)
        |  - COMMIT                                 <-- durable before any network call
        |
 3. POST sandbox /collection/v1_0/requesttopay
        |  X-Reference-Id: <that same uuid>          <-- idempotency key
        |  X-Callback-Url: https://vula.../api/momo/callback/collection
        |  amount in EUR (shim), currency EUR
        |  <- 202 Accepted, no body
        |
 4. UPDATE momo_transaction SET status = PENDING
        |
 5. Return 202 to the client in well under 10s.     <-- Vercel Hobby constraint met
        |  Client subscribes to Supabase Realtime for this transaction id.
        |
        +-- path A: MoMo calls our callback  (fast, unreliable)
        +-- path B: reconciler polls status  (slow, reliable, every 5 min via GH Actions)
        |
 6. Whichever arrives first wins, via a guarded transition:
        UPDATE momo_transaction
           SET status = 'SUCCESSFUL'
         WHERE id = $1 AND status = 'PENDING'        <-- 0 rows = already handled, stop
        |
 7. In the SAME database transaction:
        - write the journal: 4 balanced postings
             debit  momo_settlement        +1250
             credit owner_wallet:Thabo      -750   (6000 bps)
             credit driver_float:Sipho      -312   (2500 bps)
             credit fuel_pool:rank-42       -125   (1000 bps)
             credit insurance_pool:rank-42   -63   ( 500 bps, +1 remainder cent)
        - INSERT outbox rows (notify commuter, notify driver, notify owner)
        - COMMIT
        |
 8. Outbox worker (same GH Actions cron) delivers Telegram messages, at-least-once,
    deduplicated by outbox id.
        |
 9. Live console shows every step as it happens, on screen, to the judges.
```

**Why step 2 commits before step 3:** if the network call succeeds but our process dies, the
transaction row already exists and the reconciler will find it. If we called MoMo first, we would
have money moving with no record — the single worst failure mode in a payments system.

---

## 5. Module boundaries

These boundaries exist for correctness, and they double as the **agent ownership map**
(`docs/07-AGENT-PLAYBOOK.md`). Two agents never work inside the same tree in the same wave.

| Tree | Owns | May import | Must never |
|---|---|---|---|
| `src/domain/**` | Pure business rules: ledger maths, splits, state machines, trust score | nothing outside `src/domain` | do I/O, read env, import React, touch the DB |
| `src/lib/momo/**` | MoMo HTTP client, auth/token cache, retries, emulator | `src/domain/types` | write to the database |
| `src/lib/telegram/**` | Bot framework, keyboards, message rendering | `src/domain`, `src/server` | call MoMo directly |
| `src/lib/ussd/**` | USSD menu state machine | `src/domain`, `src/server` | call MoMo directly |
| `src/server/**` | Repositories, journal writer, outbox, service-role client | `src/domain`, `src/lib/momo` | be imported by client components |
| `app/api/**` | HTTP edges: validation, authz, orchestration | `src/server`, `src/lib/*` | contain business rules |
| `app/(app)/**` | UI | `src/server` via server components only | import the service-role client |
| `supabase/migrations/**` | Schema | — | be edited after merging |

`src/domain` being pure and I/O-free is what makes property-based testing cheap. Protect it.

---

## 6. Async is not optional

The 10s Vercel Hobby timeout is a gift disguised as a limitation: it forces the architecture a real
payments system needs anyway.

**Rules:**
1. No HTTP handler ever polls MoMo in a loop waiting for a terminal state.
2. Every MoMo interaction is: persist intent, fire, return. Resolution happens out of band.
3. Every state transition is guarded (`WHERE status = <expected>`) so concurrent resolvers are safe.
4. Ledger postings are written **only** on the transition into `SUCCESSFUL`, in the same DB
   transaction as that transition. There is no other place in the codebase that writes to the ledger.
5. Side effects (Telegram messages, push, SMS) go through the **outbox**, never inline. A webhook
   that gets replayed five times must not send five messages.

---

## 7. Scheduling without a scheduler

Vercel Hobby cron runs once per day. Reconciliation needs minutes, not days. GitHub Actions on a
public repo gives unlimited free minutes and 5-minute granularity.

```yaml
# .github/workflows/scheduler.yml  (design; implemented in F8)
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:          # so we can trigger it live during the demo
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          for job in reconcile escrow-sweep outbox-drain stokvel-run; do
            curl -fsS -X POST "$BASE/api/cron/$job" \
              -H "Authorization: Bearer $CRON_SECRET"
          done
          curl -fsS "$BASE/api/health"   # keeps Supabase from pausing
```

Caveats we accept and document:
- GitHub's scheduled workflows are best-effort and can be delayed under load. Reconciliation is
  idempotent and catches up, so delay costs latency, not correctness.
- Scheduled workflows are disabled after 60 days of repo inactivity. Our project lives 25 days.
- `workflow_dispatch` gives us a manual trigger on stage, which is genuinely useful in the demo.

---

## 8. Channels share one core

```
   Telegram        PWA          USSD
       |            |            |
       +------------+------------+
                    |
          +---------------------+
          |   Intent layer      |   "pay fare", "accept job", "check balance"
          |   channel-agnostic  |
          +----------+----------+
                     |
          +---------------------+
          |   src/domain        |   pure rules
          +----------+----------+
                     |
          +---------------------+
          |   src/server        |   ledger, outbox, repositories
          +---------------------+
```

A new channel is a renderer over the intent layer, not a new application. This is what lets us
credibly demo the same job acceptance from a smartphone and a feature phone.

---

## 9. Environments

| Environment | Frontend | Database | MoMo | Purpose |
|---|---|---|---|---|
| Local | `next dev` | `supabase start` (Docker) | Emulator by default | Development, fast tests |
| CI | build only | ephemeral Supabase in the runner | Emulator, always | Deterministic gate |
| Preview | Vercel preview per PR | Supabase **staging** | Sandbox | Manual review, E2E |
| Production | Vercel `main` | Supabase **prod** | Sandbox | The demo |

There is no environment where real money moves. "Production" here means "the environment the
judges see".

---

## 10. Error taxonomy

One shared error shape across every boundary, so agents write consistent code.

```ts
type VulaError =
  | { kind: 'VALIDATION';    field: string; message: string }        // 400, user fixable
  | { kind: 'AUTHZ';         message: string }                        // 403
  | { kind: 'NOT_FOUND';     resource: string }                       // 404
  | { kind: 'CONFLICT';      message: string }                        // 409, e.g. state transition lost
  | { kind: 'INSUFFICIENT';  available: bigint; required: bigint }    // 422
  | { kind: 'UPSTREAM';      provider: 'momo' | 'telegram'; retryable: boolean; status?: number }
  | { kind: 'INTERNAL';      cause: unknown }
```

Rules:
- `UPSTREAM` with `retryable: true` is never surfaced to a user. It is retried by the reconciler.
- `CONFLICT` on a guarded state transition is **normal**, not an error. It means someone else won
  the race. Log at debug, return success.
- No error message ever contains a subscription key, token, or MSISDN in full.

---

## 11. Observability on a free tier

No paid APM. What we do instead:

- **Structured JSON logs** to Vercel's log drain, always including `correlation_id`
  (= the `momo_transaction.id` where one exists).
- **`momo_transaction` is the audit log.** Every attempt, every status, every timestamp.
- **The live console** (`app/console`) is Supabase Realtime over `journal` and `momo_transaction`.
  It is both a debugging tool and the single most persuasive thing in the demo.
- **A `system_check` table** written by each cron tick, so "is the scheduler alive" is a query.
