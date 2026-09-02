# PHASE-3 — A1 Comprehensive codebase audit

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (path-resolved, no pinned sha —
see *Not measured*)
**Result:** 0 Critical · 2 High · 5 Medium · 4 Low · 0 waived · 4 not measured

**Scope:** whole repository, `src/**` (10,610 lines over 80 TS/TSX files), `supabase/migrations/**`,
`tests/**`, CI workflows. **Excluded:** `docs/**` prose (A6 covers content), `node_modules`.
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**This codebase is markedly stronger than its phase would predict, and the strength is concentrated
exactly where it should be.** The money engine — double-entry ledger, integer minor units,
guarded state transitions, idempotency by construction — is not merely correct, it is correct in a
way that is *enforced* rather than *observed*: Postgres triggers reject an unbalanced journal, a
source-reading test fails the build if a second module ever calls `insertEntries`, and the
`FOR UPDATE` + `prev.status = any(...)` pattern in `claimTransition` makes a read-then-write race
structurally impossible rather than merely unlikely. All eight of the overlay's non-negotiables
hold. I tried to break each one and could not.

The weaknesses are all in the **perimeter**, not the core: there is no authentication of any kind,
no security headers, no error or loading boundaries, and — until earlier today — no tests at all on
the agent core that fronts the whole product. That last gap produced a live incident this session
(`MISTAKES.md` M10) in which the deployed agent told a user it had prepared a money transfer that
did not exist. It is fixed and guarded, and it is the clearest available evidence for the general
shape of this repo's risk: **the money cannot go wrong; the things standing in front of the money
can, and they are the parts with the least test coverage.**

The documentation discipline deserves specific mention because it is doing real engineering work
here, not decoration. `MISTAKES.md` has ten entries each carrying an enforceable guard, and at
least three of those guards have since caught a real regression. That is a functioning immune
system, and it is rare at any scale, let alone in a 28-day solo build.

### Top 5 risks

1. **No authentication anywhere (A1-01, High).** Every endpoint answers every caller, and the
   ledger read tools are scoped to no user. Acceptable only while the database holds nothing but
   our own test rows — and the entire RLS layer, eight tables' worth, has therefore never been
   exercised against a real principal.
2. **No error or loading boundaries (A1-02, High).** A thrown Server Component renders Next's
   generic "Application error" — in front of judges, on the page that reads the ledger.
3. **The agent core is the product's front door and was shipped untested (A1-03, Medium,
   part-paid).** Thirty tests landed today; the modelled path and `grounding()` remain uncovered.
4. **The reconciler runs only when a human curls it (A1-04, Medium).** No scheduler exists, so a
   payment resolves when somebody remembers. Known, tracked as F8, and still true.
5. **In-memory rate limiting on serverless (A1-05, Medium).** Each instance keeps its own `Map`,
   so the effective limit is `20 × instances`, not 20.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A1-01 | **High** | `src/app/api/agent/route.ts:63`, `src/app/api/context/route.ts:31` | No authentication on any route or page. Both money-reading endpoints answer any caller, and the read tools take no user id | The RLS policies in `0001_ledger.sql` (8 tables) have never been exercised against a real principal — they are asserted, not proven. Every visitor sees the same ledger. The route's own docstring says this "stops being acceptable the moment a real person's money is in that table" | M9a. Until then the docstring is the correct mitigation and it is present — this is reported because *unmeasured is never a pass*, not because the code is dishonest |
| A1-02 | **High** | `src/app/**` — no `error.tsx`, `loading.tsx` or `not-found.tsx` anywhere | No React error boundary and no loading UI. Verified: `find src/app -name "error.tsx" -o -name "loading.tsx"` returns nothing | `/ledger` is a dynamic Server Component doing a Postgres round trip measured at **722–1432 ms**; until it resolves the user sees nothing, and if `readWallet()` throws, production renders Next's generic error page. Both on the screen built to prove the ledger is real | Add `src/app/(app)/ledger/loading.tsx` with the existing `ChipSkeleton`, and an `error.tsx` at the `(app)` segment that says what failed without leaking the message |
| A1-03 | Medium | `src/server/agent/respond.ts`, `src/server/agent/tools.ts` | The agent core shipped with zero tests in #32. Part-paid today: `tests/unit/agent/refusal.test.ts` (30 tests) covers routing and refusal; the **modelled** path, `grounding()` and all three read tools remain uncovered | This is the module the whole product speaks through, and the untested part is precisely where M10 occurred. `tools.ts` reads money out of Postgres and is exercised only by hand | Stub `createAgentClient` to test the modelled path and the fallback swap; add integration coverage for the three read tools alongside the existing `tests/integration/` suite |
| A1-04 | Medium | `src/app/api/cron/reconcile/route.ts` | The reconciler is correct and authorised, and **nothing calls it on a timer**. No workflow in `.github/workflows` schedules it | A `PENDING` transaction stays pending until a human runs `curl`. The callback is documented as a latency optimisation with the reconciler as the correctness guarantee — so the guarantee is currently manual | F8, ADR-0006. A `schedule:` cron in GitHub Actions holding `CRON_SECRET` |
| A1-05 | Medium | `src/server/momo/callback.ts:63-75` | `createRateLimiter` keeps a per-process `Map`. On Vercel each concurrent instance has its own | The documented limit (20/min for `/api/agent`, default for the callback) is multiplied by the instance count. For `/api/agent` that gates a paid-tier-adjacent model call | Acceptable for a hackathon and worth writing down. A durable limiter needs Postgres or Upstash — the latter is out on free-tier grounds (`docs/10`); a `rate_limit` table with a unique key per (ip, minute) costs one insert |
| A1-06 | Medium | `src/lib/artifacts/types.ts` | The artifact union is a TypeScript type with a `TODO`; there is no runtime validation | Compile-time only. Harmless today because the server constructs every artifact from ledger reads — and a hard blocker the moment any artifact is parsed from model output or from the wire. S7c | Zod schemas mirroring the union, validated at the `/api/agent` boundary and in `reviveTurn` |
| A1-07 | Medium | `src/app/api/agent/route.ts` | The route accepts a cross-origin POST. Verified live: `Origin: https://evil.example` → `200` | No ACAO header means a browser will not let the attacker *read* the reply, but the request still executes and still spends a Gemini call. A third-party page can drain the free-tier quota through its visitors' browsers | Check `Origin` against an allowlist for the POST, or require a same-origin fetch header. See A5-03 |
| A1-08 | Low | `src/app/(app)/chat/page.tsx:185` | `lg:max-w-[520px]` — an arbitrary Tailwind value, the only one in the codebase | A magic number outside the token system. Small, but it is the seam where token discipline starts to erode | Promote to a named token, or comment the reasoning |
| A1-09 | Low | `src/app/layout.tsx:20` | `themeColor: '#000000'` — the one literal colour, hand-kept in step with `--background` | The comment acknowledges `<meta name="theme-color">` cannot take a CSS variable, which is correct. But nothing tests the two agree, so a palette change drifts silently | A unit test asserting the literal equals the dark `--background` in `tokens.ts` |
| A1-10 | Low | `src/app/(app)/layout.tsx:1-13` | `AppLayout` returns `children` unchanged and exists only to hold `metadata` | Harmless, and worth a comment saying so — an empty layout reads like an unfinished refactor to the next person | One line of docstring |
| A1-11 | Low | `src/lib/agent/mock.ts` (427 lines) | Still imported by the live chat for `SUGGESTIONS` and the `KasiContext` type, though the agent itself is real | The largest file in `src/lib` is now a fixture wearing the name "mock", imported by production code. The overlay says not to report the mock as debt, and this is not that — it is the *naming* that will mislead | Move `SUGGESTIONS` and `KasiContext` to `src/lib/agent/types.ts`; leave the mock genuinely unused |

---

## 3. Not measured

| Check | Why |
|---|---|
| **Audit-suite commit sha** | `audits.config.json` records `suite.ref: "main"` with the path resolved at runtime; no sha is captured, so this result is not reproducible against a pinned audit version. Worth fixing in the config — it is the one line that makes every future result verifiable |
| **RLS policy behaviour under a real authenticated principal** | Requires auth (M9a). The 6 RLS tests in `tests/integration/` skip without `DATABASE_URL` and, when they run, run as service-role. The policies are asserted by their SQL, never observed denying a real user |
| **Runtime behaviour under concurrency in production** | `tests/integration/concurrency.test.ts` covers the write-skew case, but it is opt-in (`allowWrites`) and commits permanent rows, so it does not run in CI. Production concurrency is untested |
| **Bundle composition** | Build output gives totals (103 kB shared, 112–119 kB first load) but no per-dependency breakdown; no analyzer is installed and adding one costs a dependency (`docs/10`). Totals are healthy — see A4 |

---

## 4. Waived

None. No finding in this report was waived.

---

## 5. Remediation roadmap

**Quick wins (< 1 day)**
- A1-02 — `loading.tsx` + `error.tsx`. Perhaps an hour, and it removes the worst thing a judge could
  see. **Do this before the presentation.**
- A1-09, A1-10, A1-08 — comments and one small test.
- Pin the audit-suite sha in `audits.config.json`.

**Medium**
- A1-03 — finish the agent core's tests (stubbed client, the three read tools).
- A1-06 — zod artifact schemas (S7c), which is also a prerequisite for the agent write path.
- A1-07 / A5-03 — origin check on `/api/agent`.
- A1-04 — the scheduler (F8).

**Structural**
- A1-01 — authentication (M9a). It is the single unblock with the widest reach: RLS, mandates
  (ADR-0017), signed proposals (S7f) and all three role views (M9b–d) sit behind it.
- A1-05 — a durable rate limiter, if this ever carries real users.

---

## 6. What is genuinely good

Specific, and each verified rather than taken from a docstring:

- **One ledger writer, proved by a test that reads the source tree.** `insertEntries` has exactly
  one caller — `src/server/ledger/journal.ts:63` — and `tests/unit/ledger/single-writer.test.ts`
  fails the build if that ever changes. This is the difference between a rule and a guarantee.
- **`claimTransition` is a genuinely correct optimistic transition.** `SELECT … FOR UPDATE` inside
  a CTE, then `UPDATE … WHERE prev.status = any($2)`, returning the previous status. A read-then-write
  race cannot be expressed here. `resolved_at` is stamped only on terminal states, so a poll that
  says "still pending" does not masquerade as a resolution.
- **Domain purity holds.** `src/domain/**` imports nothing but `src/domain/**`. No `fs`, no
  `process`, no React, no database client. This is what keeps the property tests cheap, and it is
  intact.
- **No client component reaches the server layer.** Checked properly — by first-line `'use client'`
  directive, not by substring, because this repo has twice been bitten by guards matching their own
  prose. Nineteen real client modules, none importing `@/server/**` or a service-role key. In a
  public repo that is the mistake that would end the project, and it has not been made.
- **The callback route's threat model is written down and correct.** The body can only trigger a
  *lookup*; status comes from asking MTN directly. The blast radius of a forged callback is "we ask
  MTN about a transaction we already own", and the code matches that claim.
- **The logger's MSISDN scrubber has a lookaround that protects the correlation id.** Someone
  noticed that a naive twelve-digit mask would shred `00000000-0000-4000-8000-000000000001` and
  destroy the one field that traces a payment end to end. That is the kind of detail that is only
  ever found by thinking about it.
- **Secret hygiene is clean.** `.gitignore` covers `.env*`, only `.env.example` is tracked, and a
  scan for key-shaped strings across all tracked non-lockfile files returns nothing.
