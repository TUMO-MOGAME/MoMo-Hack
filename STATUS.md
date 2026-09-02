# MoMo Kasi — Status Board

**This file is the single source of truth for "where are we".**
Every PR must update it. If you are a fresh session, read this before touching anything.

- **Last updated:** 2026-09-02 (planning session)
- **Phase:** Day 1 — planning complete, repo live, build not started
- **Days to code freeze (27 Sep 2026):** 25
- **Local path:** `C:\MoMo-Hack`
- **Repo:** <https://github.com/TUMO-MOGAME/MoMo-Hack> — **public**, `main` **protected** (verified)
- **Tree state:** documentation only, no application code yet
- **Blocked on:** deadline confirmation (Q1), the frontend template Tumo is providing

---

## Right now

| | |
|---|---|
| **Current phase** | Phase 3 — Money engine |
| **Phase state** | Phases 0-1 substantially done. Money engine reviewed and merged (#10). |
| **Audits owed at close** | Phase 3: A1 A2 A3 A4 A5 A6 — **none run yet** |
| **Blocking findings** | none — the CI gate landed in #13 and all eight checks are green |
| **Days to code freeze** | 25 (27 Sep 2026) |
| **Open PRs** | #11 frontend shell + sidebar (this one). #10 and #13 merged. |

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

1. **`DATABASE_URL` — the one credential in the way.** Everything for F5 is built and green:
   the migration runner, the `pg` binding, the bootstrap that finally calls `setMoneyDb`, and
   35 integration and RLS tests. They **skip, announcing themselves**, until a connection string
   exists. Supabase → Project Settings → Database → Connection string → **Session pooler** URI.
   One line in `.env.local`, then `npm run db:migrate` and `npm run test:int`.
2. **Vercel (F7).** Needed twice over: the walking skeleton's definition is *"a real
   `requesttopay` from a **deployed** function"*, and the Telegram bot cannot work at all without
   a public HTTPS URL — Telegram will not deliver to localhost. F9's secrets also need to reach
   GitHub Secrets and Vercel, where nothing has been set yet.
3. **Telegram handler (M5a).** `/api/telegram/webhook` does not exist. See the note below.

### Why the Telegram bot does not reply

Diagnosed 2026-09-02 against the live bot. **The bot is fine; nothing is listening.** Three
separate things are missing, and all three are needed:

| | State |
|---|---|
| Bot itself | ✅ `@momokasi_demo_bot` live, `getMe` 200 |
| **Webhook URL** | ❌ **none set.** Telegram has **1 update queued** — that is the message that was sent. |
| **Handler route** | ❌ `/api/telegram/webhook` **does not exist.** M5a is not built; the only routes are `health`, `cron/reconcile` and `momo/callback`. |
| **Public HTTPS URL** | ❌ Telegram will not deliver to `localhost`. Needs F7 (Vercel). |

So a sent message is being queued by Telegram with nowhere to go. Nothing is broken — this part
of the product has not been written yet. It is Phase 4, and it is gated on F7.

One thing to change while it is queued: `/setprivacy` → **Disable** in @BotFather. Split-a-bill
needs to see who replied in a group, and the bot currently cannot read group messages.

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
| **Done to the required test level** | **16%** | 11 items. The honest floor: `docs/04` says a feature is Done only at its named test level. |
| **Weighted** (`[~]` counts half) | **24%** | The fairest single number. |
| **Started or better** | **32%** | 22 items have real code. |

**Read these with three caveats, or they will mislead you.**

1. **Items are not equal.** The money engine is one row per concept but 7,500 lines and 231
   tests; "Pitch deck" is one row and an afternoon. By item count the ledger is worth the same
   as a checkbox.
2. **The gap between 16% and 32% is almost entirely one missing thing.** Eight items sit at
   `[~]` purely because their required level is `+int` and **there is no database to integrate
   against**. The code is written and green. Applying the migrations (F5) moves more of this
   board than any other single action available.
3. **The hard part is disproportionately done.** The double-entry ledger, the integer split
   engine, the state machine and the idempotency model are the parts that are expensive to get
   right and unforgiving when wrong, and they are built and property-tested. What remains is
   mostly breadth — more surfaces over the same engine — not depth.

**Phase 3 exit criterion is not met.** It reads "the ledger always balances, under concurrency,
with property tests to prove it". Property tests: yes. **Under concurrency against a real
Postgres: not demonstrated**, because that needs F5. The in-memory adapter cannot prove the
`DEFERRABLE` triggers fire, and those triggers are the whole safety argument.

---

## Phase board

The 5th column is what each phase owes the audit suite. White circle = owed, green tick = run and
written up. Only the audits listed are run at that phase — see `PLANNING.md` §11.

| # | Phase | State | Days | Audits |
|---|---|---|---|---|
| 0 | Foundation and walking skeleton | CI gate done (#13); skeleton not joined; Supabase not migrated | 1-3 | A1 A8 ⚪ |
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
| F5 | Migration pipeline (local, CI, deploy) | `[~]` | unit | +int | #17 | **Pipeline built, not yet run against a database.** `npm run db:migrate` applies `supabase/migrations/*.sql` in order, once, and **refuses to continue if an applied file's checksum changed** (CLAUDE.md #4). `pg` is bound via `connection.ts`, and `bootstrap.ts` finally calls `setMoneyDb` — the link that did not exist. Blocked only on `DATABASE_URL`. |
| F6 | CI quality gate workflow | `[x]` | **verified** | n/a | #13, #14 | Lockfile · Typecheck · Lint · Format · Tests · Build · Money guards, each a separate named job. Guards tested against synthetic violations to prove they fire. |
| F7 | Vercel project + preview deploys | `[ ]` | none | +e2e | — | |
| F8 | GitHub Actions scheduler + keep-alive | `[ ]` | none | +int | — | ADR-0006 |
| F9 | Secrets wired (MoMo, Supabase, Telegram) | `[~]` | n/a | n/a | — | All present in `.env.local` and verified live. **None are in GitHub Secrets yet**, so nothing deployed can use them. |

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
| M1a | Chart of accounts + ledger schema | `[~]` | unit +prop | +int | #10 | Written and enforced by DB triggers (I1-I4). **Never applied to a real database** — blocked on F5. |
| M1b | Journal writer (atomic, balanced) | `[x]` | unit **+prop** | +prop | #10 | Single writer, guarded by `single-writer.test.ts`. Required level met. |
| M1c | Balance projection + hold logic | `[~]` | unit +prop | +prop | #10 | Projection done (`accountBalance`, no cached balance anywhere). **Hold logic exists only as posting builders** — the escrow service is M4a. |
| M1d | Split engine (basis points, remainder) | `[x]` | **+prop** | +prop | #3 | 6 properties, 5,000+ cases. R12.50 tie-break pinned (M3 in `MISTAKES.md`). |
| M2a | MoMo client (auth, token cache, retry) | `[~]` | unit + contract | +int | #10 | Contract tests across the response matrix, **plus live sandbox verification**. Not `+int` in the CI sense. |
| M2b | Collections `requesttopay` + status | `[~]` | contract | +int | #10 | Live-verified: `202` then `409` on a repeated `X-Reference-Id`. |
| M2c | Transaction state machine | `[x]` | **+prop** | +prop | #10 | Terminal states absorbing, machine total and closed. Accepts the undocumented `CREATED`. |
| M2d | Callback webhook handler | `[~]` | contract | +int | #10 | Replay-safe by construction — the body can only trigger a lookup, never set a status. |
| M2e | Reconciliation poller | `[~]` | unit + contract | +int | #10 | Route and poller built. **The GitHub Actions cron that calls it does not exist** (F8). |
| M3a | Disbursements `transfer` | `[ ]` | none | +int | — | Not started. Nothing pays anybody out yet. |
| M3b | Payout orchestration + outbox | `[ ]` | none | +int | — | The `outbox` table and writes exist; **nothing drains it**. |
| M4a | Escrow hold / release / refund | `[ ]` | none | +prop | — | Posting builders exist; the service and state machine do not. |
| M4b | Photo proof upload + approval | `[ ]` | none | +e2e | — | Supabase Storage |

## 2. Channels (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M5a | Telegram webhook + secret verification | `[ ]` | none | +int | — | ADR-0007 |
| M5b | Bot conversation state machine | `[ ]` | none | +prop | — | |
| M5c | Bot flows: pay, earn, stokvel, balance | `[ ]` | none | +e2e | — | |
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
| Q2 | RLS policy test suite | `[~]` | written, not yet run | — | #17 | 6 RLS tests written, using `set local role` + `request.jwt.claims` — the only way to test a policy, since the connection we hold is the owner and bypasses RLS entirely. Covers: ledger tables unreachable by `anon` **and** `authenticated`, no client INSERT, split rules publicly readable on purpose, a user sees only their own transactions, and a user **cannot mark their own transaction SUCCESSFUL** — the most valuable forgery in the system. |
| Q3 | MoMo contract tests (2xx/4xx/5xx/timeout) | `[ ]` | — | — | — | |
| Q4 | E2E critical path (Playwright) | `[ ]` | — | — | — | |
| Q5 | Load test: 500 concurrent fares | `[ ]` | — | — | — | k6, asserts balance |
| Q6 | Chaos drills (dupe/late/out-of-order webhooks) | `[ ]` | — | — | — | |
| Q7 | Accessibility pass (axe) | `[ ]` | — | — | — | Judges score design |
| Q8 | Security review (secrets, authz matrix) | `[ ]` | — | — | — | |
| D1 | MoMo emulator for demo resilience | `[ ]` | none | +int | — | ADR-0009 |
| D2 | Seed data + demo reset script | `[ ]` | none | — | — | One command |
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
| 2026-09-02 | Live spend guard (#18) | unit + **empirical** | 15 tests on the cap. Verified by pointing `.env.local` at `production` and running `npm run check:momo`: it **refused and exited before issuing a token**, then the env was restored. 331 tests pass overall. |

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
