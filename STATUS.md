# MoMo Kasi — Status Board

**This file is the single source of truth for "where are we".**
Every PR must update it. If you are a fresh session, read this before touching anything.

- **Last updated:** 2026-09-02 (session 4)
- **Phase:** Phase 3 — money engine. **Exit criterion met**; its six audits are still owed.
- **Local path:** `C:\MoMo-Hack`
- **Repo:** <https://github.com/TUMO-MOGAME/MoMo-Hack> — **public**, `main` **protected**, and as of
  this session **8 required status checks with `strict` on**, so a branch must be up to date with
  `main` before it merges.
- **Deployed:** <https://momo.tumoolo.tech> — live, public, and now the canonical host. The
  `mo-mo-hack.vercel.app` alias still serves the same deployment. Production deploys on every
  merge, previews on every PR.
- **Database:** live. 3 migrations applied to Supabase `edtduvwbejdfahkmfort` (`eu-west-2`).
- **Tree state:** 390 green + 2 skipped over 25 files, 0 vulnerabilities, CI enforcing all of it.
  Both skips are opt-in and announce themselves: the walking skeleton (`MOMO_SKELETON=1`) and the
  write-skew case (`allowWrites`). Both commit permanent rows, so neither runs by accident.
- **Blocked on:** nothing external. **F9 is done** and **the walking skeleton is closed** — a real
  `requesttopay` against MTN's sandbox has been resolved through the deployed function into a
  balanced double-entry journal. Money has moved end to end.

---

## Right now

| | |
|---|---|
| **Current phase** | Phase 3 — Money engine |
| **Phase state** | **Phase 0 closed** — walking skeleton proved end to end. Phase 3 exit criterion met; its six audits still owed. |
| **Audits owed at close** | Phase 3: A1 A2 A3 A4 A5 A6 — **none run yet** |
| **Blocking findings** | none — the CI gate landed in #13 and all eight checks are green |
| **Days to code freeze** | 25 (27 Sep 2026) |
| **Open PRs** | none. #10, #11, #13-#21, #23, #24, #25 merged. |

### The CI finding, kept because it changes how every merge before it was judged

`STATUS.md` said #10 and #11 were both "green". **Neither was, and CI could not have told us
either way.** All four causes are now fixed in #13, but the record matters more than the fix:

1. **`Audits / A8` failed on every push since PR #2** — `npm ci` rejected a `package-lock.json`
   out of sync with `package.json`. The real cause was the *platform*: npm resolves optional
   dependencies for the OS it runs on, so a lockfile written on Windows omits the `@emnapi/*`
   subtree Linux needs for the wasm bindings behind `sharp` and `@tailwindcss/oxide`.
   Regenerating on Windows could never have fixed it. A `Lockfile` CI job now regenerates on
   Linux and hands back the corrected file as an artifact.
2. **CI ran no tests.** `audits.yml` was the only workflow. No typecheck, no test, no build and
   no lint had ever run on a pull request, so "231 tests green" was an agent's local vitest run.
3. **`npm run lint` could never have passed.** There was no ESLint config at all, so `next lint`
   dropped into an interactive prompt — which also meant `npm run verify` could not complete.
4. **9 vulnerabilities, 3 critical.** Now **0**.

Two of our own guards were also wrong: `safe-merge.mjs` reported #10's successful merge as a
failure, and the no-floating-point guard fired on its own prose in any Windows checkout. Both
fixed, both written up in `MISTAKES.md` terms in #13.

**And the toolchain bump hid 84 tests.** vitest 4 ships Vite 8, which honours `tsconfig.json`'s
`jsx: "preserve"` — the setting Next.js requires — and so stopped transforming `.tsx` at all.
All five component test files failed at import, and the summary still read **`Tests 231 passed`**
because tests that never load cannot fail. The only tell was `Test Files 5 failed` on the line
above. Fixed with an `oxc.jsx` override in `vitest.config.ts` (the key is `oxc`, not `esbuild` —
an `esbuild` block is silently ignored under Vite 8). Two lessons worth keeping:

- **A passing test count is not evidence.** Read the file count too. "231 passed" was true and
  meaningless.
- **This is the argument for the CI gate in one example.** A toolchain bump quietly disabled a
  third of the suite, including the provenance guard that stops the agent inventing a balance
  (CLAUDE.md #14). Nothing but running the whole suite would have found it.

### The next three actions

1. **Phase 3's six audits (A1 A2 A3 A4 A5 A6).** `npm run audit:plan`. None have been run, and
   the phase cannot close without them (CLAUDE.md #13). This is now the front of the queue.
2. **The scheduler (F8).** The reconciler works in production but **nothing calls it on a
   timer** — every tick so far has been a human with `curl`. Until the GitHub Actions cron exists,
   a transaction resolves only when someone pokes it. ADR-0006.
3. **Disbursements (M3a).** Nothing pays anybody out yet. Money can come in and stop; it cannot
   leave. That is the other half of every product surface.

### ✅ THE WALKING SKELETON IS CLOSED (Phase 0)

*"A real `requesttopay` from the deployed function, resolved by the reconciler, writing balanced
ledger rows."* Done, and measured rather than asserted:

```
momo_transaction  SUCCESSFUL  100  SKELETON-1788365755412  AIRTIME  attempts=1
journal d6df990b    MOMO_SETTLEMENT   +100
                    SUSPENSE          -100
                    sum:                 0
initiate → resolved: 66.4s
GLOBAL ledger sum:   0 over 8 rows
```

A second collection was then resolved through the same path (`journal a7cc179a`), which matters
more than the first — see the Critical finding below.

Driven by `tests/integration/walking-skeleton.test.ts`, opt-in behind `MOMO_SKELETON=1` because it
is the one integration test here that **cannot roll back**: `journal` and `ledger_entry` are
append-only by trigger, so a successful run leaves rows in the production project permanently. That
is what it is proving. It refuses to run against any `MOMO_TARGET_ENVIRONMENT` but `sandbox`.

```
MOMO_SKELETON=1 npx vitest run tests/integration/walking-skeleton.test.ts
```

**No seed data was needed.** `ensureAccount` upserts by natural key, so `AIRTIME` — which posts
`MOMO_SETTLEMENT` → `SUSPENSE` with no owner, driver, rank or split rule — creates both accounts
on demand. D2 is still worth having for the demo, but it was not a blocker.

**A deliberate limitation, stated because it would otherwise read as proven:** the test pokes the
deployed reconciler every 5s while waiting, and MTN's callback fires at the same time. Both paths
are live and both are safe to run concurrently (that is the single-resolver guarantee), but **which
of the two actually won the race was not instrumented**. "Resolved by the deployed function" is
proved; "the callback specifically works" is not. M2d stays `[~]` for that reason.

### CRITICAL — the ledger worked exactly once

Found on the **second** collection ever made, in production. `ensureAccount` falls back to a
`SELECT` when `on conflict do nothing` fires, and that SELECT was passed six parameters while
referencing five. Postgres refused it outright:

```
error: could not determine data type of parameter $5
  at ensureAccount           (src/server/db/postgres.ts)
  at writeJournal            (src/server/ledger/journal.ts)
  at postSuccessfulJournal   (src/server/momo/resolve.ts)
```

The failing branch runs **only when the account already exists**. So the first journal against any
account succeeded and every subsequent one threw — the first fare works, the second does not, and
the ledger is stuck forever.

**Why 361 tests missed it.** Every integration test rolls back. `inRollback` is the right default
and it is why the suite can run against the production project with no seeding and no cleanup — but
it means **no test had ever seen a committed account**, so the entire `on conflict` branch was dead
code as far as the suite was concerned. The unit suite could not help either: the in-memory adapter
has no SQL to get wrong. Written up as **M9** in `MISTAKES.md` — *a rolled-back suite proves the
first use of everything and the second use of nothing.*

Fixed, and guarded by two tests that call `ensureAccount` **twice** for the same natural key (one
subject-scoped, one for the null/null system key). Proved to fire: reintroducing the sixth parameter
fails both with the original error.

### HIGH — the MoMo callback host is fixed at provisioning, and a mismatch is a 500

`momoAPIs.md` §4.1 rated this `[P]` and guessed that a mismatched `X-Callback-Url` means
"callbacks are silently dropped". **Measured, it is worse than that: the whole payment fails.**

```
500 {"message":"Callback URL does not match the configured value.",
     "code":"INVALID_CALLBACK_URL_HOST"}
```

Proved as a controlled experiment, because a single 500 could have been the sandbox having a bad
afternoon:

| `X-Callback-Url` | API user bound to `momo-kasi` | rebound to `momo.tumoolo.tech` |
|---|---|---|
| none | 202 | 202 |
| `momo.tumoolo.tech` | **500** | **202** |
| `momo-kasi.vercel.app` | 202 | **500** |

The results invert exactly. `GET /v1_0/apiuser/{id}` confirmed both bindings directly.

**The consequence is operational, and it bites at the worst moment.** The callback host is fixed
when the API user is created and there is no documented way to change it. Moving to a new domain
is **not** an environment-variable change — it needs a **new API user and key**. So the API user
was re-provisioned against `momo.tumoolo.tech` (`MOMO_API_USER` is now `28b81c8c…`), and the new
credentials pushed to Vercel.

Note what this means about the state before today: the project was provisioned against
`momo-kasi.vercel.app`, **a host that 404s**. Requests only ever succeeded because we happened to
name that dead host, and every callback MTN sent went nowhere. The callback path had never worked
and could not have. `momoAPIs.md` §4.1 is promoted `[P]` → `[V]`, §4.3 `[P]` → `[V]`, and §7.1
gained two bullets.

### F9 is done, and the reason it looked undone was not the reason anyone assumed

The variables **had already been set on Vercel**. They were set on the **preview** target only,
and production had none — which is exactly why `momo.tumoolo.tech` reported
`database: unconfigured` while the dashboard looked populated. Not a missing step; a misfiled one.
That is worth remembering the next time an environment looks configured and behaves as though it
is not: **check the target, not just the key list**.

Now set on **production** (15 variables, read back from the API rather than trusted to a 200):
the 5 MoMo values, `DATABASE_URL`, the 3 Supabase values, `CRON_SECRET`, and 5 pinned by policy.

Three of those five are pinned deliberately rather than copied from `.env.local`, because the
local developer environment is *wrong* for production in ways that fail silently:

| Pinned | Value | Why not copied |
|---|---|---|
| `MOMO_MODE` | `sandbox` | `.env.local` says `emulator`. Correct locally, a lie in production — the deployed function would report success while touching no MoMo API at all. |
| `MOMO_CALLBACK_HOST` | `momo.tumoolo.tech` | `.env.local` says `momo-kasi.vercel.app`, which **404s `DEPLOYMENT_NOT_FOUND`**. Measured. Every `X-Callback-Url` we handed MTN would have gone nowhere, and the reconciler would have quietly covered for it. |
| `MOMO_TARGET_ENVIRONMENT` | `sandbox` | Anything else is real money against a ~R10 budget (CLAUDE.md #15). `MOMO_LIVE_MAX_MINOR=100` is pinned beside it so the R1.00 brake is present in the deployed environment rather than relying on a default. |

Repeatable as `npm run env:push` (`scripts/vercel-env.mjs`) — plan-by-default, `--yes` to apply,
`upsert` so a re-run is a rotation rather than an error. It **refuses** to set a non-sandbox
target environment without `--allow-live`, and refuses `MOMO_MODE=emulator` outright.

**Production only, not preview.** Preview URLs 302 to SSO and cannot receive a MoMo callback, so
crediting them buys little — and costs something real: every PR preview would write to the single
production ledger, where the append-only trigger makes those rows permanent. Widen to preview
when F4's second Supabase project exists; it is one flag (`--targets production,preview`).

### The Telegram bot is now wired end to end — after three bugs, none of them in the route

The route itself (#24) is well written. Everything that stopped it working was around it.

**1. The deployed route answered 200 to every request, including a wrong secret.** Its own
`readTelegramConfig()` catch is the only path that can do that — a deliberate choice, since a 500
makes Telegram retry a config problem thousands of times. So one of the two `TELEGRAM_*` values was
falsy at runtime (`requireEnv` rejects an empty string as readily as a missing one). Both keys were
listed on the `production` target but typed `sensitive`, so their values could not be read back to
confirm which. Rewriting them through `npm run env:push -- --with-telegram` (as `encrypted`) and
redeploying fixed it. Measured before and after:

| Request | Before | After |
|---|---|---|
| wrong secret | 200 | **401** |
| absent secret | 200 | **401** |
| correct secret, junk body | 200 | 200 |

**2. `scripts/telegram-setup.mjs` and `scripts/telegram-dev-bridge.mjs` could never run.** Both did
`const env = loadEnv()`, but `loadEnv()` returns `{ env, path }` — not the map. Every lookup was
`undefined`, so both exited with *"TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be
set"* while the keys sat correctly in `.env.local`. Every sibling script destructures; these two
did not. One token each.

> **This one is worth pausing on.** #24 records measurements attributed to
> `telegram-dev-bridge.mjs` — `/start` 0.75s, an agent turn 5.5s, a duplicate `update_id` 8ms, a
> wrong secret 401. **As committed, that script exits before its first network call.** Those
> numbers cannot have come from it in this state. Either they were taken against an unrecorded
> local version, or they were not taken. Same shape as M3: a figure in a document that did not come
> out of running the code that is in the repository.

**3. No webhook was registered at all.** Now set, and verified by reading it back:

```
url               https://momo.tumoolo.tech/api/telegram/webhook
secret set        yes
pending updates   0
last error        none
```

Note the host — `momo.tumoolo.tech`, not the `.vercel.app` alias #24's notes named.

**Still unproven: that the bot actually replies in production.** The route authenticates, the
webhook is registered, and the bot is healthy — but no real message has been round-tripped through
the deployment. Send one to `@momokasi_demo_bot` to close that.

### Split ownership, this session onward

A second agent owns **Telegram (M5a)** in its own worktree. This session stayed out of
`src/app/api/telegram/**` entirely.

It also stayed out of the two Telegram **environment variables**, which matters more than it
looks: a Vercel project's environment is shared mutable state with no merge step. If both owners
set `TELEGRAM_WEBHOOK_SECRET` to different values, every update Telegram delivers 401s — and the
failure is indistinguishable from a bug in the handler, in a file neither owner is looking at.
So `scripts/vercel-env.mjs` puts them behind an opt-in `--with-telegram` flag, and their one
owner is whoever builds M5a. Both were **already** on production and preview and were not touched.

### HIGH — neither money route bound the database, and one of them hid it behind a 200

Found within minutes of F9 landing, by calling the cron route with a correct bearer instead of
assuming it worked. Auth passed (401 without a bearer, 401 with a wrong one, through with the
right one) and the handler then returned **500**.

`setMoneyDb` writes a **module-scoped singleton**, and in serverless every route is its own
isolated instance. `ensureMoneyDb()` had exactly one caller in the entire codebase —
`/api/health`, indirectly through `moneyDbAvailable()`. The two routes that actually touch money
both called `getMoneyDb()` with nothing having bound it:

| Route | Behaviour before the fix |
|---|---|
| `POST /api/cron/reconcile` | **500 on every tick.** Reconciliation could never have run in production. |
| `POST /api/momo/callback/[kind]` | **200, always.** Its catch returns 200 unconditionally, and the comment on that catch names "no database adapter configured" as one of the cases it swallows. |

The second row is the dangerous one. `POST /api/momo/callback/collection → 200` has been recorded
as **verified from the public internet** since F7, and it was — the route was reachable, returned
200, and never once reached the database. **A 200 from a route that swallows its own errors is
not evidence that the route worked.**

Why nothing caught it earlier:

- **`next dev` is one process.** Hitting `/api/health` first binds the singleton for every other
  route in the same process, so the bug does not reproduce locally at all.
- **No test touches the global binding.** The integration suite connects through its own
  `tests/integration/_db.ts` helper, so it exercises the adapter without ever exercising the
  wiring that production depends on.
- **`database: configured` does not mean the database answers.** `moneyDbAvailable()` checks that
  `DATABASE_URL` is present and binds the adapter; it never opens a socket. The health route was
  telling the truth about a narrower question than it appeared to answer.

**Fixed** — `ensureMoneyDb()` at the top of both routes. **Guarded** — a static test in
`tests/unit/ledger/single-writer.test.ts` reads every `src/app/api/**/route.ts` and fails when one
calls `getMoneyDb` without `ensureMoneyDb`. **Proved the guard fires**: commenting the call out
makes it fail with `expected [ 'app/api/cron/reconcile/route.ts' ] to deeply equal []`.

### The Telegram bot now replies

Built and **verified end to end against the live bot** on 2026-09-02. The three blockers in the
previous version of this section are down to one, and it is a BotFather setting rather than code:

| | State |
|---|---|
| Bot itself | ✅ `@momokasi_demo_bot` live, `getMe` 200 |
| **Handler route** | ✅ `/api/telegram/webhook` built (M5a). Secret-verified, `update_id`-deduplicated. |
| **Agent** | ✅ Replies through Gemini `gemini-3.6-flash`, persona from `docs/12` §4.2. |
| **Public HTTPS URL** | ✅ F7 landed. **`https://momo.tumoolo.tech`** is the delivery target — the custom domain is now canonical, and it is what `MOMO_CALLBACK_HOST` and the MoMo API user are bound to. `mo-mo-hack.vercel.app` still serves the same deployment. |
| **Webhook URL** | ⏳ set with `npm run telegram:setup -- <url>` once the secrets are on Vercel. |
| **Group message reads** | ❌ `/setprivacy` → **Disable** in @BotFather. Split-a-bill needs to see who replied. |

**Proved locally before any deploy.** `scripts/telegram-dev-bridge.mjs` long-polls `getUpdates` and
POSTs each update into the local route exactly as Telegram would, secret header and all — so the
whole path is exercised with no tunnel and no deployment. Only the inbound delivery is simulated;
the route, handler, model call and outbound send are the deployed ones. Measured against the real
bot: `/start` **0.75s** (no model call), an agent turn **5.5s**, a duplicate `update_id` **8ms** and
no second reply, a wrong secret **401**.

**Two limits worth knowing before the demo.** An agent turn at 5.5s has ~4.5s of headroom under
Vercel's 10s Hobby ceiling, so a slow Gemini response is the most likely way this fails live — the
handler already degrades to a friendly fallback rather than silence. And de-duplication plus
conversation history are **per-instance and in-memory**: they hold across a warm function, not
across a cold start. Nothing here writes to the ledger, so the worst case is a repeated reply or a
forgotten sentence, never a repeated payment. Both become exact when the outbox lands (M5c).

### CRITICAL, found and fixed the first time the tests met a real database

**`anon` could `TRUNCATE` the entire ledger.** Measured, not theorised:

```
set local role anon;
truncate ledger_entry cascade;   -- SUCCEEDED
```

`0001_ledger.sql` enables RLS and deliberately gives the ledger tables **no policies**, on the
stated reasoning that "RLS with zero policies denies every role except service_role" (ADR-0010).
That is true for SELECT, INSERT, UPDATE and DELETE. **It is not true for TRUNCATE.** TRUNCATE is
not a row operation, so RLS never sees it — it is governed only by the table privilege, and
Supabase's default privileges grant **ALL** privileges on every new table in `public` to `anon`
and `authenticated`. The append-only triggers do not help either: they fire on UPDATE and DELETE,
and TRUNCATE is neither.

Not remotely exploitable today — PostgREST does not expose TRUNCATE, so the anon API key alone
cannot reach it. But ADR-0010's guarantee is meant to be **structural**, and "unreachable through
the API we happen to use" is not structural.

Fixed in `0002_lockdown_and_bigint_balances.sql`: revoke everything from `anon` and
`authenticated`, then grant back only what is deliberately public. **Verified closed** — TRUNCATE
now returns `42501` for both roles.

**Also fixed: `wallet_balance` exposed money as `numeric`, not `bigint`**, because `sum(bigint)`
returns `numeric` in Postgres. No value was ever rounded — `numeric` is exact — but it breaks the
contract rule 1 promises and that `toBigInt` is built around. Now `::bigint`, and **zero
numeric/float columns remain** in `public`.

**The lesson worth keeping: the CI "Money guards" job could not have caught either.** It greps
*migrations* for banned type names, and `sum(e.amount)` contains none of them. A static grep over
source cannot see a type the database infers, nor a privilege the platform grants behind your
back. Only a check against the live schema can, and it did on its first run.

### Phase 3's exit criterion is now met

*"The ledger always balances, under concurrency, with property tests to prove it."*

Measured against real Postgres with two connections racing the same account: **one spend
committed, one was refused, the global ledger sum is exactly `0`, and the credit-normal wallet
never went positive.** The write-skew risk flagged in #17 does not materialise here — the deferred
trigger runs its `SELECT` as a fresh statement at COMMIT, so under READ COMMITTED it sees the
other transaction's committed rows. That is a measurement of one interleaving, not a formal proof,
so it stays worth re-checking when M3a and M4a add paths that debit a wallet.

### A cost worth stating: test runs left permanent rows

The opt-in concurrency test commits, and **journals are append-only by trigger, so its rows cannot
be deleted** — 7 journals and 4 postings are in the production project for good. The ledger still
balances exactly, and nothing is wrong; but it argues for the **second Supabase project (F4)** to
exist and to be where writing tests point. The free tier allows two and we have made one.

### Decisions taken 2026-09-02

- **Q6 — Supabase region: keep `eu-west-2` (London).** Decided by Tumo. POPIA s72 is satisfied
  by the UK's adequacy under UK GDPR; the cost is that it is an argument we have to make rather
  than one we do not. Not revisited — recreating the project after migrations land is expensive
  and the free tier allows exactly two.
- **Q1 — submission deadline: dropped.** No longer tracked as a blocker.
- **The live MoMo testing budget is about R10, total.** Now CLAUDE.md rule 15, and enforced
  rather than remembered. `src/lib/momo/budget.ts` caps any amount bound for a non-sandbox
  environment at **R1.00 per transaction** (`MOMO_LIVE_MAX_MINOR`), checked inside
  `toMomoAmount` — the single chokepoint every outbound MoMo request passes through, so there is
  no path that skips it. Sandbox is uncapped; sandbox money is not real. `scripts/momo-smoke.mjs`
  additionally refuses to run against a live environment without `MOMO_ALLOW_LIVE=1`, and drops
  its amounts to R0.10 when it does. **That one script sends eight payments — R85 at the sandbox
  amounts, or eight times the entire budget.**

---

## Progress

Counted from the tables below by a script, not estimated — 69 tracked items, states read
straight out of the `[ ]`/`[~]`/`[x]` column. Recomputed whenever the board changes.

| Measure | | What it counts |
|---|---|---|
| **Done to the required test level** | **26%** | 18 items. The honest floor: `docs/04` says a feature is Done only at its named test level. |
| **Weighted** (`[~]` counts half) | **31%** | The fairest single number. |
| **Started or better** | **36%** | 25 items have real code. |

**Read these with three caveats, or they will mislead you.**

1. **Items are not equal.** The money engine is one row per concept but 7,500 lines and 231
   tests; "Pitch deck" is one row and an afternoon. By item count the ledger is worth the same
   as a checkbox.
2. **The database gap is closed.** That caveat used to read "eight items sit at `[~]` because
   there is no database to integrate against". There is now: three migrations applied, 29
   integration tests green, and the four ledger invariants verified *firing* rather than assumed.
   Strict completion moved 17% → 22% on that alone, and it is the reason the remaining `[~]`
   items are now blocked on real work rather than on a credential.
3. **The hard part is disproportionately done.** The double-entry ledger, the integer split
   engine, the state machine and the idempotency model are the parts that are expensive to get
   right and unforgiving when wrong, and they are built and property-tested. What remains is
   mostly breadth — more surfaces over the same engine — not depth.

**Phase 3's exit criterion is now met** — see the measurement above. What Phase 3 still owes is
its six audits (A1 A2 A3 A4 A5 A6), none of which have been run.

---

## Phase board

The 5th column is what each phase owes the audit suite. White circle = owed, green tick = run and
written up. Only the audits listed are run at that phase — see `PLANNING.md` §11.

| # | Phase | State | Days | Audits |
|---|---|---|---|---|
| 0 | Foundation and walking skeleton | **DONE.** Skeleton closed — real requesttopay → deployed function → balanced journal, measured | 1-3 | A1 A8 ⚪ |
| 1 | Design system and app shell | built, in PR #11 | 4-5 | A1 A2 A3 ⚪ |
| 2 | Narrative and content surfaces | landing page built, in PR #11 | 6 | A1 A6 ⚪ |
| 3 | Money engine | **in progress** — ledger/client/state machine merged (#10); no integration tests yet | 7-13 | A1 A2 A3 A4 A5 A6 ⚪ |
| 4 | Channels and products | not started | 14-19 | A1 A2 A3 A4 A5 A8 ⚪ |
| 5 | Reach — offline, USSD, voice | not started | 20-23 | A1 A2 A3 A4 A7 ⚪ |
| 6 | Hardening, demo and submission | not started | 24-28 | A1 A3 A4 A5 A6 A7 A8 S1 ⚪ |

---

## Status legend

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done and merged to `main` |
| `[!]` | Blocked |
| `[-]` | Descoped (say why) |

Test column: `none` / `unit` / `+prop` (property-based) / `+int` (integration incl. RLS) /
`+e2e` / `+load`. A feature is only **Done** when it reaches the test level named in
`docs/04-TESTING-STRATEGY.md` for its tier.

---

## 0. Foundation

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| F1 | Public GitHub repo created | `[x]` | n/a | n/a | — | `TUMO-MOGAME/MoMo-Hack`, made public 2026-09-02 |
| F2 | Ruleset protecting `main` | `[x]` | verified | n/a | — | Ruleset 22084424. Direct push **tested and rejected**. Squash-only, linear history, no bypass actors. |
| F3 | Next.js + TS + Tailwind scaffold | `[x]` | typecheck + build in CI | unit | #13, #14 | **Next 15.5.25** (bumped off 15.1.6 for 30+ advisories), React 19, Tailwind v4, strict TS + `noUncheckedIndexedAccess`. Production build green in CI on every PR. |
| F3a | Full directory structure + module boundaries | `[x]` | n/a | n/a | — | Matches `docs/01` §5 = the agent ownership map |
| F3b | Design tokens (`src/design/tokens.ts` + `@theme`) | `[x]` | none | unit | — | Architecture from Social-Assembly; brand retuned to MTN gold |
| F3c | Frozen contracts: `money`, `split`, `errors`, `artifacts/types` | `[x]` | **manual** | +prop | — | Split verified exact across 200,000 amounts. Needs the real fast-check suite (M1d). |
| F3d | Starter chat + artifact UI (mock agent) | `[x]` | manual | +e2e | — | 7 artifact renderers, chip + panel + bottom sheet, zero keys needed |
| F4 | Supabase staging + prod projects | `[~]` | none | +int | — | **Project 1 of 2 live and verified** — URL, anon and service_role all resolve to ref `edtduvwbejdfahkmfort`, service_role authenticates 200. **Region is `eu-west-2` (London)**, measured from the DB host's IPv6 against AWS's published ranges — not an African region. See Q6. |
| F5 | Migration pipeline (local, CI, deploy) | `[x]` | **+int** | +int | #20 | `npm run db:migrate` — ordered, once, each file in a transaction, and it **refuses if an applied file's checksum changed** (CLAUDE.md #4). **Three migrations applied to the live Supabase project.** |
| F6 | CI quality gate workflow | `[x]` | **verified** | n/a | #13, #14 | Lockfile · Typecheck · Lint · Format · Tests · Build · Money guards, each a separate named job. Guards tested against synthetic violations to prove they fire. |
| F7 | Vercel project + preview deploys | `[x]` | **verified live** | +e2e | — | **<https://momo.tumoolo.tech> is the canonical host** — a custom domain on the same project, verified from the public internet: `/` 200, `/api/health` 200, `POST /api/momo/callback/collection` 200. `mo-mo-hack.vercel.app` still serves the same deployment. Production deploys on every merge to `main`, previews on every PR. Note the per-deployment URLs (`…-tumo-mogames-projects.vercel.app`) 302 to SSO; only the stable aliases are public, and `momo.tumoolo.tech` is the one to give MTN and Telegram. **Caveat, now measured:** that callback 200 never proved the route worked — it returns 200 even when it fails. See the HIGH finding above. |
| F8 | GitHub Actions scheduler + keep-alive | `[ ]` | none | +int | — | ADR-0006 |
| F9 | Secrets wired (MoMo, Supabase, Telegram) | `[x]` | **verified live** | n/a | — | **15 variables on the Vercel `production` target**, read back from the API rather than trusted to a 200, and proved by behaviour: `/api/health` moved `database: unconfigured` → **`configured`**, and `POST /api/cron/reconcile` moved 401 → past auth, so `CRON_SECRET` is right. The vars had been set on **preview** only, which is why the deployment looked configured and behaved as though it were not. Repeatable as `npm run env:push`. Telegram's two are deliberately not ours — see split ownership above. **GitHub Secrets are still unset** (F8 needs `CRON_SECRET` there). |

## 1. Money engine (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
**Reconciled against the code on 2026-09-02.** These rows all said `[ ]` after #10 merged,
which was wrong — #10 shipped nine of them. `[~]` here does not mean "half-written": for most of
these it means the code is complete and green, and the row cannot reach `[x]` because the
**required test level is `+int` and no database exists to integrate against**. That distinction
is the honest one, and it is why the percentage in §Progress counts both ways.

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M1a | Chart of accounts + ledger schema | `[x]` | **+int** | +int | #10, #20 | Applied to real Postgres and **all four invariants verified firing** — I1 balance, I2 append-only, I3 overdraft in each account's own direction, I4 terminal immutability. These could never be proven against the in-memory adapter, which has no triggers. |
| M1b | Journal writer (atomic, balanced) | `[x]` | unit **+prop** | +prop | #10 | Single writer, guarded by `single-writer.test.ts`. Required level met. |
| M1c | Balance projection + hold logic | `[~]` | unit +prop | +prop | #10 | Projection done (`accountBalance`, no cached balance anywhere). **Hold logic exists only as posting builders** — the escrow service is M4a. |
| M1d | Split engine (basis points, remainder) | `[x]` | **+prop** | +prop | #3 | 6 properties, 5,000+ cases. R12.50 tie-break pinned (M3 in `MISTAKES.md`). |
| M2a | MoMo client (auth, token cache, retry) | `[x]` | **+int** | +int | #10, #25 | Contract tests across the response matrix, and now a real end-to-end collection through the deployed function. Token issue, `requesttopay`, `getStatus` and the callback-host binding all exercised against the live sandbox. |
| M2b | Collections `requesttopay` + status | `[x]` | **+int** | +int | #10, #25 | Live-verified: `202` then `409` on a repeated `X-Reference-Id`, and **two real collections resolved to `SUCCESSFUL` with balanced journals**. Also found `500 INVALID_CALLBACK_URL_HOST` — see the HIGH finding above. |
| M2c | Transaction state machine | `[x]` | **+prop** | +prop | #10 | Terminal states absorbing, machine total and closed. Accepts the undocumented `CREATED`. |
| M2d | Callback webhook handler | `[~]` | contract | +int | #10, #25 | Replay-safe by construction — the body can only trigger a lookup, never set a status. **Now reachable for the first time**: the API user is bound to `momo.tumoolo.tech`, so MTN's callback finally arrives somewhere real. Stays `[~]` because the skeleton polls the reconciler concurrently and **which path won the race was not instrumented**. |
| M2e | Reconciliation poller | `[~]` | **+int** | +int | #10, #23, #25 | Proved in production: `{"ok":true,"examined":1,...}` from the deployed route, including the resend path moving an `INITIATED` row to `CREATED`. Stays `[~]` because **nothing calls it on a timer** — every tick so far has been a human with `curl` (F8). |
| M3a | Disbursements `transfer` | `[ ]` | none | +int | — | Not started. Nothing pays anybody out yet. |
| M3b | Payout orchestration + outbox | `[ ]` | none | +int | — | The `outbox` table and writes exist; **nothing drains it**. |
| M4a | Escrow hold / release / refund | `[ ]` | none | +prop | — | Posting builders exist; the service and state machine do not. |
| M4b | Photo proof upload + approval | `[ ]` | none | +e2e | — | Supabase Storage |

## 2. Channels (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M5a | Telegram webhook + secret verification | `[~]` | **contract (27)** | +int | #24 | Built and verified against the live bot. Constant-time secret compare, `update_id` de-duplication, `200` on every path except a bad secret (`401`). `[~]` not `[x]` because the required level is `+int` and de-duplication is in-memory, not a table. |
| M5b | Bot conversation state machine | `[~]` | contract | +prop | #24 | Short per-chat history (8 turns, 30 min), reset by `/start`. **In-memory, so it survives a warm function and not a cold start.** Not a state machine yet — there are no flows to hold state for until M5c. |
| M5c | Bot flows: pay, earn, stokvel, balance | `[ ]` | none | +e2e | — | The agent explains all four; it cannot execute any of them. Needs the read tools (S7a) and the outbox. |
| M9a | Web shell + auth | `[~]` | unit | +e2e | #11 | Shell, landing page, chat surface and context sidebar shipped and serving 200. **There is no auth of any kind** — no sign-in, no session, no `auth.uid()`, so the one RLS policy we wrote cannot yet be exercised. |
| M9b | Commuter view | `[ ]` | none | +e2e | — | |
| M9c | Worker view | `[ ]` | none | +e2e | — | |
| M9d | Rank-admin view | `[ ]` | none | +e2e | — | |

## 3. Product surfaces (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M6a | Fare QR generation + scan | `[ ]` | none | +e2e | — | |
| M6b | 60/25/10/5 split applied on fare | `[ ]` | none | +prop +load | — | Load test asserts ledger balances |
| M7a | Stokvel group + membership | `[ ]` | none | +int | — | RLS-heavy |
| M7b | Contribution schedule + reminders | `[ ]` | none | +int | — | |
| M7c | Rotating payout engine | `[ ]` | none | +prop | — | |
| M8a | Prepaid electricity + token issuance | `[ ]` | none | +e2e | — | Simulated meter token |
| M8b | School fees rail | `[ ]` | none | +e2e | — | |

## 4. Depth features (SHOULD)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| S1 | USSD state machine + simulator UI | `[ ]` | none | +e2e | — | |
| S2 | Offline queue + service worker | `[ ]` | none | +e2e | — | Demo in airplane mode |
| S3 | Remittances + purpose-locked sub-wallet | `[ ]` | none | +int | — | |
| S4 | Ubuntu Trust Score | `[ ]` | none | +prop | — | |
| S5 | Live webhook console | `[ ]` | none | +e2e | — | Supabase Realtime |
| S6 | Split-a-bill via Telegram group | `[ ]` | none | +e2e | — | |

## 4b. Conversational layer (SHOULD) — `docs/12`, `docs/13`

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| S7a | Agent route (Edge, streaming, Groq) | `[ ]` | none | +int | — | Gemini Flash fallback on 429 |
| S7b | Agent tools — read-only set | `[ ]` | none | +int | — | Numbers come from the ledger, always |
| S7c | Artifact schema (zod discriminated union) | `[ ]` | none | +prop | — | **Still genuinely not done.** `src/lib/artifacts/types.ts` carries a TypeScript union and an explicit `TODO(S7c)`; **zod is not a dependency**, so there is no *runtime* validation. Harmless today because no agent produces artifacts yet — a hard blocker for S7a/S7b, which is where untrusted model output first arrives. ADR-0013. |
| S7d | Artifact registry + panel + bottom sheet | `[~]` | unit | +e2e | #11 | 11 renderers + registry, panel, drawer and skeletons. 90 unit tests from fixtures. **The provenance guard is real and tested**: an amount with no `sourceTxnId`/`sourceAccountId` renders struck-through and "unverified", and disables the confirm control (CLAUDE.md #14). Owes `+e2e` and an axe sweep. |
| S7e | In-chat chips + re-open from history | `[~]` | unit | +e2e | #11 | Chip component and artifact context shipped; re-open from history not verified end to end. |
| S7f | `propose_*` + signed confirmation card | `[ ]` | none | **+int +sec** | — | **ADR-0014 — the safety-critical one** |
| S8a | Phrase bank build script | `[ ]` | none | unit | — | Run manually, never in CI |
| S8b | ElevenLabs live TTS with a daily cap | `[ ]` | none | +int | — | Degrades to phrase bank, then text |
| S8c | Speech input (Web Speech API) | `[ ]` | none | +e2e | — | On-device; audio never leaves the phone |
| S8d | isiZulu/isiXhosa/Sesotho/Afrikaans recordings | `[ ]` | n/a | n/a | — | Needs a native speaker and a microphone |

## 5. Quality and demo

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| Q1 | Property-test suite for money invariants | `[ ]` | — | — | — | `docs/04` §3 |
| Q2 | RLS policy test suite | `[x]` | **+int** | — | #20 | 6 RLS tests, green against the live database. They found a **Critical** hole — see below. |
| Q3 | MoMo contract tests (2xx/4xx/5xx/timeout) | `[ ]` | — | — | — | |
| Q4 | E2E critical path (Playwright) | `[ ]` | — | — | — | |
| Q5 | Load test: 500 concurrent fares | `[ ]` | — | — | — | k6, asserts balance |
| Q6 | Chaos drills (dupe/late/out-of-order webhooks) | `[ ]` | — | — | — | |
| Q7 | Accessibility pass (axe) | `[ ]` | — | — | — | Judges score design |
| Q8 | Security review (secrets, authz matrix) | `[ ]` | — | — | — | |
| D1 | MoMo emulator for demo resilience | `[ ]` | none | +int | — | ADR-0009 |
| D2 | Seed data + demo reset script | `[ ]` | none | — | — | One command. **Not a blocker after all** — `ensureAccount` upserts by natural key, so the skeleton needed no seed data. Still wanted for a demo with plausible balances. |
| D3 | Demo rehearsed end to end 3x | `[ ]` | — | — | — | `docs/08` |
| D4 | Pitch deck | `[ ]` | — | — | — | |
| D5 | Demo video recorded | `[ ]` | — | — | — | Fallback if live fails |

---

## What has been tested

Nothing yet — no code exists. This section becomes a real record as PRs land.
Format: one line per merged workstream, with the evidence.

| Date | What | Test level reached | Evidence |
|---|---|---|---|
| 2026-09-02 | Branch protection on `main` | verified | Direct push rejected: `GH013 — Changes must be made through a pull request` |
| 2026-09-02 | Split engine invariant | **manual exhaustive** | 200,000 consecutive amounts × the 60/25/10/5 rule; every split summed exactly. Not yet the fast-check suite required by `docs/04` §3 — logged as debt below. |
| 2026-09-02 | TypeScript strict build | typecheck | `tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess` |
| 2026-09-02 | Starter UI renders | manual | Dev server `HTTP 200`; greeting, suggestions and composer all present in the response |
| 2026-09-02 | MoMo credentials, live | **integration** | All three products issue tokens. Idempotency confirmed against the real API: same `X-Reference-Id` twice → `202` then `409`. |
| 2026-09-02 | Sandbox test MSISDNs | **integration** | 40s poll per number. Four of six documented outcomes were wrong. `momoAPIs.md` §10 promoted `[P]` → `[V]`. Discovered the undocumented `CREATED` status. |
| 2026-09-02 | Telegram bot | **integration** | `getMe` + `getWebhookInfo` on `@momokasi_demo_bot`. Live. |
| 2026-09-02 | Money engine (PR #10) | unit + property + contract | **231 tests, 15 files.** Ledger balance, state transitions, MoMo response matrix, webhook/cron auth. Typecheck clean. |
| 2026-09-02 | Frontend (PR #11) | unit | **90 tests, 6 files.** Every artifact renders from a fixture; the provenance guard is locked in. Typecheck clean. |
| 2026-09-02 | **#10 + #11 combined** | unit + property + contract | **315 tests, 20 files** (321 less the 6 shared split tests counted once), typecheck clean, production build clean. The combination is what found the CRLF guard bug — neither PR failed alone. |
| 2026-09-02 | Money engine reviewed and merged (#10) | read, not just run | Diff read in full. Verified by hand: the overdraft trigger follows each account's normal balance; `claimTransition` takes `for update` so concurrent resolvers serialise; the callback body can only trigger a lookup and never sets a status; cron uses a constant-time compare; ledger tables carry no RLS policies at all. |
| 2026-09-02 | Supabase project 1 | **integration** | URL, anon and service_role keys all carry ref `edtduvwbejdfahkmfort`; GoTrue health 200; service_role authenticates against PostgREST 200. Region measured as `eu-west-2` (London) from the DB host's IPv6 against AWS's published ranges. |
| 2026-09-02 | `npm run check:momo` | **integration** | Dead on main (`ReferenceError: resolve is not defined`). Fixed and re-run live: token issued, all six MSISDN cases match the `[V]` table in `momoAPIs.md` §10, idempotency `202` then `409`. |
| 2026-09-02 | CI quality gate (#13) | **verified** | Typecheck, lint, full 231-test suite and production build all green locally on the bumped toolchain. Both content guards tested against a synthetic violation to prove they fire, and against this tree to prove they do not fire on prose. |
| 2026-09-02 | Dependency health | **verified** | `npm audit` 9 vulnerabilities (3 critical) → **0**. `npm ci` restored — it had been failing since PR #2. |
| 2026-09-02 | **#11 on the merged toolchain** | unit + property + contract | **315 tests, 20 files**, typecheck, lint and production build all clean. Caught vitest 4 silently not running the 84 component tests — see below. |
| 2026-09-02 | Prettier + reformat (#14) | **verified** | 41 code files reformatted. 315 tests, typecheck, lint and build all still clean afterwards. Markdown deliberately excluded — see `.prettierignore`. |
| 2026-09-02 | App runs on the merged tree | manual | `next dev` on the fully merged tree: `/` and `/chat` both **200**, `/api/health` `ok:true`. `database: unconfigured` is correct and expected — nothing binds the adapter yet (F5). |
| 2026-09-02 | Landing page photography (#15) | manual + build | Five WebP, **52MB of source JPEGs → 908KB**. Verified against the production build: `/` 200, all five `alt` texts present, `next/image` srcset emitting 8 widths, optimised variant serves 200, `aspect-ratio:4/5` generated. Originals moved to a gitignored `assets-src/` and regenerable with `npm run images`. |
| 2026-09-02 | Required status checks on `main` | **verified** | 8 checks now required — Lockfile, Typecheck, Lint, Format, Tests, Build, Money guards, A8 — with **`strict` on**, so a branch must be up to date with `main` before it merges. Read back from the API, not assumed. That last setting is what would have caught the #10 + #11 interaction *before* the merge instead of after. |
| 2026-09-02 | Telegram bot | **integration** | Re-checked live. Bot healthy; **no webhook set and 1 update queued**; `/api/telegram/webhook` does not exist (M5a). A sent message has nowhere to go. Not a fault — unbuilt, and gated on F7. |
| 2026-09-02 | DB wiring (#17) | unit + skip-verified | `pg` bound, bootstrap calls `setMoneyDb`, migration runner with checksum enforcement. **35 integration + RLS tests written**; they skip cleanly and visibly without `DATABASE_URL` (315 passed, 29 skipped). Typecheck, lint, format and build all green. |
| 2026-09-02 | **Deployed app is live** | **integration** | <https://mo-mo-hack.vercel.app> from the public internet: `/` and `/chat` 200, `/api/health` `ok:true`, and `POST /api/momo/callback/collection` **200** — MTN can reach our callback. Health also proves no env vars are set there yet. |
| 2026-09-02 | **Migrations applied to live Supabase** | **integration** | 3 migrations applied to `edtduvwbejdfahkmfort`. Connection reached via the **Session pooler** — the direct `db.<ref>.supabase.co` host is IPv6-only and does not resolve from this machine at all (`ENOTFOUND`). |
| 2026-09-02 | **Ledger invariants, real Postgres** | **integration** | **29 tests green.** All four DB invariants verified *firing*: unbalanced journal refused, ledger append-only, overdraft blocked in each account's own direction, terminal status immutable, `journal_id` write-once, split rules must sum to 10000bps. |
| 2026-09-02 | **RLS, real Postgres** | **integration** | 6 tests via `set local role` + `request.jwt.claims`. Found the **Critical** TRUNCATE hole (above), fixed in `0002`, re-verified closed. |
| 2026-09-02 | **Concurrency — Phase 3 exit criterion** | **integration** | Two connections racing one account: one spend committed, one refused, **global ledger sum exactly 0**, wallet never positive. |
| 2026-09-02 | Live spend guard (#18) | unit + **empirical** | 15 tests on the cap. Verified by pointing `.env.local` at `production` and running `npm run check:momo`: it **refused and exited before issuing a token**, then the env was restored. 331 tests pass overall. |
| 2026-09-02 | Footer rebuild + attribution | manual + build | Footer replaced: nav columns, the MTN MoMo mark and the TUMO OLO wordmark. Both logos are the owners' own assets, not traced — MoMo is MTN's `mtnmomoLogo.svg` payload (**`#FFCB05` / `#003A58`** sampled from the file), TUMO OLO is the outline served at tumoolo.tech, checked side by side against their own nav render. Screenshotted from the **production** build at 1280px and 390px. Caught a real overflow at 390px: the old small-print row pushed the copyright past the viewport edge, now stacked. Re-verified after merging `main`: **331 passed, 29 skipped**, typecheck, lint, format and build green. `/` still prerendered **static** at 6.3 kB / 112 kB First Load JS — the footer is a server component and ships no client JavaScript, though no pre-change baseline was measured to quote a delta. |
| 2026-09-02 | **Custom domain live** | **integration** | <https://momo.tumoolo.tech> from the public internet before any credentials existed: `/` **200**, `/api/health` **200**, `POST /api/momo/callback/collection` **200**. Same deployment as the `.vercel.app` alias. Also measured: the `MOMO_CALLBACK_HOST` in `.env.local` (`momo-kasi.vercel.app`) **404s `DEPLOYMENT_NOT_FOUND`** — a dead callback host, caught before it was pushed anywhere. |
| 2026-09-02 | **F9 — env vars on Vercel** | **integration** | 15 variables written to the `production` target and **read back from the API**, not trusted to a 200. Root cause of the apparent gap: they were already set on **preview** only. Verified by behaviour after a redeploy of the same commit (`11569c6`): `/api/health` `database: unconfigured` → **`configured`** on both aliases. |
| 2026-09-02 | **Cron auth, live** | **integration** | Three-way probe against the deployed function: no bearer → **401**, wrong bearer → **401**, correct `CRON_SECRET` → **through to the handler**. Proves the secret landed correctly and the constant-time compare behaves. |
| 2026-09-02 | **HIGH — money routes never bound the database** | **integration + static guard** | The same correct-bearer call returned **500**. Cause: `ensureMoneyDb()` had one caller in the codebase (`/api/health`), and `setMoneyDb` is a module-scoped singleton that serverless isolation does not share. `/api/cron/reconcile` 500'd on every tick; `/api/momo/callback/[kind]` returned **200 while never reaching the database**, because its catch swallows exactly that error. Fixed in both. Guarded by a static test over `src/app/api/**/route.ts`, and **the guard was proved to fire** against a synthetic violation. |
| 2026-09-02 | **✅ WALKING SKELETON — Phase 0 closed** | **integration, live** | A real `requesttopay` to MTN's sandbox (R1.00, MSISDN `46733123454`), resolved through the **deployed** function, writing a balanced journal. Measured: `SUCCESSFUL`, `journal d6df990b`, `MOMO_SETTLEMENT +100` / `SUSPENSE -100`, sum `0`, **initiate → resolved 66.4s**. Global ledger sum `0` over 8 rows. Driven by `tests/integration/walking-skeleton.test.ts`, opt-in behind `MOMO_SKELETON=1` because it cannot roll back. |
| 2026-09-02 | **CRITICAL — the ledger worked exactly once** | **integration + regression** | `ensureAccount`'s `on conflict` fallback passed 6 params to SQL referencing 5 → `could not determine data type of parameter $5`. That branch runs only when the account already **exists**, so the first journal against any account succeeded and every later one threw. Found on the second real collection. Missed by 361 tests because every integration test rolls back and so had never seen a committed account. Fixed; two idempotency tests added and **proved to fire** against the reintroduced bug. Second collection then resolved: `journal a7cc179a`. M9 in `MISTAKES.md`. |
| 2026-09-02 | **HIGH — MoMo callback host is bound at provisioning** | **integration, controlled experiment** | A mismatched `X-Callback-Url` returns **`500 INVALID_CALLBACK_URL_HOST`** and creates no payment — `momoAPIs.md` §4.1 had guessed "silently dropped". Proved by inversion: bound to host A, sending B is 500 and A is 202; after re-provisioning against B the results flip exactly; no callback URL is 202 either way. `GET /v1_0/apiuser/{id}` confirmed both bindings. The project had been provisioned against `momo-kasi.vercel.app`, **which 404s**, so the callback path had never worked. API user re-provisioned as `28b81c8c…` against `momo.tumoolo.tech`. §4.1 and §4.3 promoted `[P]` → `[V]`. |
| 2026-09-02 | **Telegram bot replies** (#24) | contract + **live end-to-end** | 27 contract tests, and the real bot answering from a local server via `scripts/telegram-dev-bridge.mjs`. Measured, not assumed: `/start` **0.75s** canned with no model call, an agent turn **5.5s**, a repeated `update_id` **8ms** with no second reply, a wrong or absent secret **401**. Suite **387 passed, 1 skipped** — higher than the usual 331/29 because `DATABASE_URL` was present locally, so the integration and RLS tests ran instead of skipping, and passed. |
| 2026-09-02 | Agent LLM provider | **integration** | `GROQ_API_KEY` is present in `.env.local` and **empty**, so ADR-0012's primary cannot serve a request. Fell back to Gemini (A11 in `docs/11`, already sanctioned). Model chosen by querying the live API, not from memory: `gemini-2.5-flash` **404s for new keys** and Google's own error names `gemini-3.6-flash` as the replacement. 3.6-flash is a thinking model that spends the output budget on reasoning and returns a truncated sentence until `thinkingLevel: 'low'` is set. |

---

## What needs testing (running debt)

Nothing yet. Anything merged at a lower test level than
`docs/04-TESTING-STRATEGY.md` requires is logged here with a date it must be paid down by.

| Item | Merged at | Needs | Due | Why deferred |
|---|---|---|---|---|
| ~~`src/domain/split.ts`~~ | — | ~~fast-check property suite~~ | **PAID 2026-09-02** | 6 properties green, 5,000+ generated cases |
| `src/domain/money.ts` | typecheck only | unit tests for `parseMinor` / `formatZAR` edge cases | Day 5 | as above |
| ~~Artifact renderers~~ | — | ~~fixture unit tests~~ | **PAID** | 90 tests in PR #11. axe sweep still owed. |
| Money engine (PR #10) | unit/property/contract | **integration against real Postgres** | Day 9 | Supabase does not exist yet — runs on the in-memory adapter |
| RLS policies | none | ~~write the tests~~ **run them** | Day 9 | Written in #17 (6 tests). They skip until `DATABASE_URL` exists — a skip that announces itself, never a fake pass. |
| Context sidebar | unit | drawer focus trap verified at 320px | Day 5 | Agent stopped mid-verification |
| `src/lib/agent/mock.ts` | manual | becomes the UI test fixture source | Day 18 | Replaced by the real agent route (S7a) |

---

## Risks currently live

Full register in `docs/09-RISK-REGISTER.md`. The ones actually biting right now:

| Risk | State | Mitigation status |
|---|---|---|
| MoMo sandbox instability (outages reported Jul 2026) | Live | Emulator planned (D1), not built |
| Supabase free project pauses after 7 days idle | Live | Keep-alive planned (F8), not built |
| Vercel Hobby 10s function timeout | Live | Async-by-design; enforced in `docs/01` |
| Solo dev, 25 days, large scope | Live | Cut list defined in `docs/05` §6 |

---

## Audit ledger

One row per audit run. `runner/audit.mjs` reads this to know what has already happened, so a
finding is never re-reported as new. **An audit not written here did not happen.**

| Phase | Audit | Crit | High | Med | Low | Status | Date |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | nothing run yet | — |

---

## Open findings

Critical and High block the phase gate. `runner/audit.mjs gate` fails while any row here is
unresolved — where resolved means fixed, or accepted with a written reason.

| ID | Audit | Severity | Location | Summary | Status |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

---

## Deferred debt

Findings we consciously chose not to fix now, each with the reason and the date it comes due.
Deferring is legitimate; deferring silently is not.

| ID | Audit | Severity | Summary | Why deferred | Due |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

---

## Session log

### 2026-09-02 (session 3) — the database is real, and it immediately found a Critical

**Merged #13-#21.** CI became an actual quality gate (9 checks), Prettier landed, the landing page
got photography, the board was reconciled against the code, live MoMo spend was capped, and the
database went from "written" to "running".

**The finding of the session: `anon` could `TRUNCATE` the ledger.** RLS with no policies denies
row operations; TRUNCATE is not a row operation. Supabase's default privileges had granted ALL
privileges on every table in `public` to `anon` and `authenticated`. Found within minutes of the
integration suite first reaching a real database, fixed in `0002`, verified closed.

**Second finding: `wallet_balance` was `numeric`, not `bigint`** — `sum(bigint)` widens in
Postgres. Nothing was rounded, but it broke the contract rule 1 promises.

**Neither was findable by the static CI guards**, which grep migration *text*. A type the database
infers and a privilege the platform grants are both invisible to a grep. That is the argument for
integration tests in one sentence.

**Phase 3's exit criterion is met**, measured rather than asserted: two connections racing one
account, one spend committed, one refused, global ledger sum exactly 0.

**Required status checks are on** — 8 of them, `strict`. It bit immediately and correctly: #21
was refused because the frontend agent's #20 had moved `main` underneath it.

**Still owed:** Vercel environment variables (nothing deployed has credentials), the walking
skeleton join, and Phase 3's six audits — none run.

### 2026-09-02 (session 2) — money engine merged, and CI made real

**Merged:** #10, the money engine, after reading the diff rather than trusting the test count.
The design holds up: the overdraft trigger correctly follows each account's normal balance
instead of the version printed in `docs/02`, which would have rejected the first collection ever
taken; `claimTransition` takes `for update`, so two resolvers racing the same transaction
serialise; the callback body can only ever trigger a lookup, never set a status.

**The session's real finding is that we could not have known any of that from CI.** `STATUS.md`
called both PRs green. Neither was — `Audits / A8` had been red on every branch since PR #2 —
and more importantly CI ran no tests, no typecheck, no lint and no build, so it was never in a
position to agree or disagree. Four more defects were sitting behind that: 9 vulnerabilities
including 3 critical, an ESLint setup that could not run non-interactively (so `npm run verify`
could not complete either), and `npm run check:momo` dead on `main` with a `ReferenceError`
since #9. Each was found by writing the gate, not by using the code.

**Two guards were themselves wrong, and both are now fixed.** `safe-merge.mjs` reported #10's
successful merge as a failure, because `--delete-branch` could not remove a local branch a
worktree was holding and the script concluded from the exit code instead of asking GitHub —
which is M2, committed by the script written to prevent M2. And the no-floating-point guard
fired on its own prose in any Windows checkout, because `core.autocrlf` gave it CRLF and its
comment-stripping regex cannot cross a `\r`; it passed in the tree that authored the file and on
Linux CI, which is the worst possible combination. `.gitattributes` fixes the cause.

**Supabase project 1 is live and verified** — all three values belong to ref
`edtduvwbejdfahkmfort`. It is in `eu-west-2`, London, measured from the database host's IPv6
against AWS's published ranges. That is a decision for Tumo (Q6), cheapest to reverse today.

**Still blocked:** Q1, the submission deadline. Asked a third time.

### 2026-09-02 (session 1 close) — credentials verified, money engine built, agents stopped

**Landed on main:** PRs #1-#5 and #7-#9. Planning set, code structure, frozen contracts, starter
UI, the audit suite, vitest + the split property suite, MoMo provisioning + smoke scripts, the
Telegram health check, `MISTAKES.md` with a guard per entry.

**Awaiting review:** #10 (money engine, 231 tests) and #11 (frontend shell, landing page, context
sidebar, 90 tests). Both green. Both stopped mid-task, not mid-thought — see each PR's "not
finished" section.

**Credentials:** MoMo (5 values, all three products verified live), Gemini, ElevenLabs, Telegram,
and two generated secrets. **Supabase is the only required one missing.**

**The finding that mattered:** the sandbox test MSISDN table was wrong in four of six cases, and the
sandbox emits an undocumented `CREATED` status. Caught because `momoAPIs.md` rated those facts `[P]`
and forbade coding against them. `46733123454` is the demo number — the only one that exercises a
real async resolution, ~25s.

**Mistakes recorded:** M1-M7 in `MISTAKES.md`, each with a guard. Two are now scripts
(`pr:merge`, `agent:worktree`) that make the mistake structurally hard rather than merely
remembered.

**Not started:** escrow, disbursements, outbox drain, stokvel, bills, Telegram bot handlers, the
agent route, voice, USSD, offline. No audit has been run yet.


Newest first. One short entry per working session so a fresh thread can catch up fast.

### 2026-09-02 (later) — Voice, agent and generative UI added to scope
- Repo created, made **public**, pushed, `main` protected. Protection **verified empirically**:
  a direct push was rejected by GitHub with `GH013`.
- Project moved to `C:\MoMo-Hack`.
- **Key finding: ElevenLabs supports no South African language** — not isiZulu, isiXhosa,
  Afrikaans, Sesotho or any other. Its African coverage is Swahili, Hausa, Lingala and Somali
  (Eleven v3 only). Lelapa AI's MoMo Kasivula does cover SA languages but has no free tier ($9.99/mo).
  Resolved with ADR-0011: provider-per-language voice plus a pre-generated phrase bank, which also
  brings ongoing voice cost to R0 and makes cached replies faster than live TTS.
- Studied `C:\Social-Assembly-Main` for the chat/artifact pattern. Adopted: CopilotKit generative
  UI, doc-chip-in-chat plus artifact panel, `ArtifactContext` with patch helpers, auto-open on
  stream completion, generated design tokens with a CI diff gate. Rejected: A2A multi-agent
  (violates ADR-0001) and `maxDuration = 120` (impossible on Vercel Hobby's 10s cap).
  Noted: that project has **no automated E2E tests**, so we take the flow and add the suite.
- ADRs 0011-0014 written. 0014 is the important one: **the agent cannot move money.**
- Still needed from Tumo: the frontend template, and the confirmed submission deadline.

### 2026-09-02 — Planning session
- Confirmed: 3-4 week timeline, solo + agents, daily-use wallet with gigs as the earn engine,
  single Next.js monolith.
- Verified against live sources: MoMo sandbox flow and test MSISDNs, MoMo SA strategy
  (TechCabal 1 Sep 2026), stokvel and taxi market sizing, SA Q2 2026 unemployment,
  GitHub Free branch-protection limits, Vercel Hobby cron limits, Supabase free-tier limits.
- Free GitHub account constraint surfaced mid-session, which forced ADR-0005 (public repo)
  and ADR-0006 (GitHub Actions as scheduler).
- Wrote `CLAUDE.md`, `PLANNING.md`, `STATUS.md`, `docs/00` through `docs/10`, ADRs 0001-0010.
- No code written. Next session starts at F1.
