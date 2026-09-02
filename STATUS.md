# Vula — Status Board

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

## Right now — the next three actions

1. **MoMo portal verification pass** — sign in at <https://momodeveloper.mtn.com/API-collections>
   and work through the `momoAPIs.md` §14 checklist. Promote the `[P]` ratings to `[V]`.
   Highest-value first task: Disbursements and Remittances are both unverified (R6).
2. Subscribe to Collections + Disbursements + Remittances; put the three
   `Ocp-Apim-Subscription-Key` values, `MOMO_API_USER` and `MOMO_API_KEY` into GitHub Secrets.
3. Scaffold Next.js + Supabase + CI and land it through a PR. Then the walking skeleton (M1).

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
| F3 | Next.js + TS + Tailwind scaffold | `[ ]` | none | unit | — | |
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
| — | — | — | — |

---

## What needs testing (running debt)

Nothing yet. Anything merged at a lower test level than
`docs/04-TESTING-STRATEGY.md` requires is logged here with a date it must be paid down by.

| Item | Merged at | Needs | Due | Why deferred |
|---|---|---|---|---|
| — | — | — | — | — |

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

## Session log

Newest first. One short entry per working session so a fresh thread can catch up fast.

### 2026-09-02 (later) — Voice, agent and generative UI added to scope
- Repo created, made **public**, pushed, `main` protected. Protection **verified empirically**:
  a direct push was rejected by GitHub with `GH013`.
- Project moved to `C:\MoMo-Hack`.
- **Key finding: ElevenLabs supports no South African language** — not isiZulu, isiXhosa,
  Afrikaans, Sesotho or any other. Its African coverage is Swahili, Hausa, Lingala and Somali
  (Eleven v3 only). Lelapa AI's Vulavula does cover SA languages but has no free tier ($9.99/mo).
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
