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
| **Current phase** | Phase 0 — Foundation and walking skeleton |
| **Phase state** | In progress. Repo, structure, contracts and starter UI done; walking skeleton not yet built. |
| **Audits owed at close** | A1 A8 |
| **Blocking findings** | none |
| **Days to code freeze** | 25 (27 Sep 2026) |

### The next three actions


1. **MoMo portal verification pass** — sign in at <https://momodeveloper.mtn.com/API-collections>
   and work through the `momoAPIs.md` §14 checklist. Promote the `[P]` ratings to `[V]`.
   Highest-value first task: Disbursements and Remittances are both unverified (R6).
2. Subscribe to Collections + Disbursements + Remittances; put the three
   `Ocp-Apim-Subscription-Key` values, `MOMO_API_USER` and `MOMO_API_KEY` into GitHub Secrets.
3. Scaffold Next.js + Supabase + CI and land it through a PR. Then the walking skeleton (M1).

---

## Phase board

The 5th column is what each phase owes the audit suite. White circle = owed, green tick = run and
written up. Only the audits listed are run at that phase — see `PLANNING.md` §11.

| # | Phase | State | Days | Audits |
|---|---|---|---|---|
| 0 | Foundation and walking skeleton | in progress | 1-3 | A1 A8 ⚪ |
| 1 | Design system and app shell | not started | 4-5 | A1 A2 A3 ⚪ |
| 2 | Narrative and content surfaces | not started | 6 | A1 A6 ⚪ |
| 3 | Money engine | not started | 7-13 | A1 A2 A3 A4 A5 A6 ⚪ |
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
| F3 | Next.js + TS + Tailwind scaffold | `[~]` | typecheck | unit | — | Next 15.1.6, React 19, Tailwind v4, strict TS + `noUncheckedIndexedAccess`. Dev server verified 200. |
| F3a | Full directory structure + module boundaries | `[x]` | n/a | n/a | — | Matches `docs/01` §5 = the agent ownership map |
| F3b | Design tokens (`src/design/tokens.ts` + `@theme`) | `[x]` | none | unit | — | Architecture from Social-Assembly; brand retuned to MTN gold |
| F3c | Frozen contracts: `money`, `split`, `errors`, `artifacts/types` | `[x]` | **manual** | +prop | — | Split verified exact across 200,000 amounts. Needs the real fast-check suite (M1d). |
| F3d | Starter chat + artifact UI (mock agent) | `[x]` | manual | +e2e | — | 7 artifact renderers, chip + panel + bottom sheet, zero keys needed |
| F4 | Supabase staging + prod projects | `[ ]` | none | +int | — | Free tier allows exactly 2 |
| F5 | Migration pipeline (local, CI, deploy) | `[ ]` | none | +int | — | |
| F6 | CI quality gate workflow | `[ ]` | none | n/a | — | |
| F7 | Vercel project + preview deploys | `[ ]` | none | +e2e | — | |
| F8 | GitHub Actions scheduler + keep-alive | `[ ]` | none | +int | — | ADR-0006 |
| F9 | Secrets wired (MoMo, Supabase, Telegram) | `[ ]` | n/a | n/a | — | |

## 1. Money engine (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M1a | Chart of accounts + ledger schema | `[ ]` | none | +int | — | `docs/02` |
| M1b | Journal writer (atomic, balanced) | `[ ]` | none | +prop | — | Invariant: sum = 0 |
| M1c | Balance projection + hold logic | `[ ]` | none | +prop | — | |
| M1d | Split engine (basis points, remainder) | `[ ]` | none | +prop | — | Invariant: parts = total |
| M2a | MoMo client (auth, token cache, retry) | `[ ]` | none | +int | — | `docs/03` |
| M2b | Collections `requesttopay` + status | `[ ]` | none | +int | — | |
| M2c | Transaction state machine | `[ ]` | none | +prop | — | Terminal states immutable |
| M2d | Callback webhook handler | `[ ]` | none | +int | — | Must be replay-safe |
| M2e | Reconciliation poller | `[ ]` | none | +int | — | Runs on GH Actions cron |
| M3a | Disbursements `transfer` | `[ ]` | none | +int | — | |
| M3b | Payout orchestration + outbox | `[ ]` | none | +int | — | |
| M4a | Escrow hold / release / refund | `[ ]` | none | +prop | — | |
| M4b | Photo proof upload + approval | `[ ]` | none | +e2e | — | Supabase Storage |

## 2. Channels (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M5a | Telegram webhook + secret verification | `[ ]` | none | +int | — | ADR-0007 |
| M5b | Bot conversation state machine | `[ ]` | none | +prop | — | |
| M5c | Bot flows: pay, earn, stokvel, balance | `[ ]` | none | +e2e | — | |
| M9a | Web shell + auth | `[ ]` | none | +e2e | — | |
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
| S7c | Artifact schema (zod discriminated union) | `[ ]` | none | +prop | — | ADR-0013 |
| S7d | Artifact registry + panel + bottom sheet | `[ ]` | none | +e2e | — | Phone-first; **template pending from Tumo** |
| S7e | In-chat chips + re-open from history | `[ ]` | none | +e2e | — | Pattern from Social-Assembly |
| S7f | `propose_*` + signed confirmation card | `[ ]` | none | **+int +sec** | — | **ADR-0014 — the safety-critical one** |
| S8a | Phrase bank build script | `[ ]` | none | unit | — | Run manually, never in CI |
| S8b | ElevenLabs live TTS with a daily cap | `[ ]` | none | +int | — | Degrades to phrase bank, then text |
| S8c | Speech input (Web Speech API) | `[ ]` | none | +e2e | — | On-device; audio never leaves the phone |
| S8d | isiZulu/isiXhosa/Sesotho/Afrikaans recordings | `[ ]` | n/a | n/a | — | Needs a native speaker and a microphone |

## 5. Quality and demo

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| Q1 | Property-test suite for money invariants | `[ ]` | — | — | — | `docs/04` §3 |
| Q2 | RLS policy test suite | `[ ]` | — | — | — | One test per policy |
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

---

## What needs testing (running debt)

Nothing yet. Anything merged at a lower test level than
`docs/04-TESTING-STRATEGY.md` requires is logged here with a date it must be paid down by.

| Item | Merged at | Needs | Due | Why deferred |
|---|---|---|---|---|
| `src/domain/split.ts` | manual exhaustive check | **fast-check property suite** (`docs/04` §3, P1-P2) | Day 5 | Vitest not yet installed; the algorithm was needed to build the UI against |
| `src/domain/money.ts` | typecheck only | unit tests for `parseMinor` / `formatZAR` edge cases | Day 5 | as above |
| Artifact renderers | manual | fixture unit tests + axe | Day 22 | Skin will change when the template lands |
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
