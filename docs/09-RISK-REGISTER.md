# 09 — Risk Register

Scored L(1-5) × I(1-5). Anything ≥ 12 gets an owned, dated mitigation. Reviewed at every milestone.

---

## Critical (score ≥ 15)

### R1 — MoMo sandbox outage during the demo · L4 × I5 = **20**
Outages were reported on the collections sandbox in July 2026 (`momoAPIs.md` §13). We have no
control over it and no SLA.

**Mitigation:** the emulator (ADR-0009), built from *recorded real responses*, selected by an
environment variable read per-request so it can be switched in ~20 seconds without a redeploy.
Rehearsed in `docs/08` §4.
**Trigger:** any sandbox call failing twice in a row on demo day.
**Residual:** we may demo on the emulator. Acceptable, and we say so out loud.
**Status:** planned (D1), not built. Due Day 7.

### R2 — Scope exceeds available hours · L4 × I4 = **16**
The scope is honestly larger than 170 hours (`docs/05` §1).

**Mitigation:** MoSCoW with a pre-agreed cut list in strict order (`docs/05` §7). The rule that if a
MUST slips, a SHOULD is cut **the same day**.
**Trigger:** any milestone missed by more than one day.
**Residual:** COULD items almost certainly do not ship. Fine — they were never in the demo.
**Status:** controlled by process.

### R3 — A money bug found late · L3 × I5 = **15**
A split that loses cents or a double-payout discovered in week four is unfixable in the time left,
and it is the one class of bug that destroys credibility with this specific panel.

**Mitigation:** database-level invariants that make the bug *impossible to commit*, not merely
detectable — deferred constraint triggers for journal balance and overdraft (`docs/02` §3.3) — plus
property tests from day 4 and a load test whose pass criterion is correctness.
**Trigger:** any non-zero `ROUNDING` or `SUSPENSE` balance at end of day.
**Status:** designed in. Due Day 4-5.

---

## High (score 9-14)

### R4 — Supabase free project pauses · L3 × I4 = **12**
Free projects pause after 7 days without an API request. If the demo project pauses the night
before, the app is dead until manually resumed.

**Mitigation:** `/api/health` pinged every 5 minutes by the GitHub Actions scheduler. Plus a
pre-authenticated terminal tab with `supabase projects resume` ready on demo day.
**Trigger:** any 5xx from Supabase.
**Status:** planned (F8). Due Day 2. **This must not slip** — it is a two-line mitigation for a
project-ending failure.

### R5 — GitHub Actions scheduler is best-effort · L4 × I3 = **12**
Scheduled workflows can be delayed by minutes under platform load.

**Mitigation:** every cron route is idempotent and catches up, so delay costs latency, not
correctness. `workflow_dispatch` gives a manual trigger for the demo.
**Residual:** reconciliation may occasionally lag past 5 minutes. Acceptable — the callback path
usually resolves first anyway.
**Status:** accepted by design.

### R6 — Undocumented MoMo behaviour breaks an integration · L4 × I3 = **12**
Disbursements and Remittances are rated **[P]** in `momoAPIs.md` — inferred from secondary sources,
not confirmed on the portal, because the portal needs a signed-in session.

**Mitigation:** the Day 1 portal verification checklist (`momoAPIs.md` §14). Contract tests built
from *recorded* responses, not guessed ones. The re-verification protocol.
**Trigger:** any response shape not in our fixtures.
**Status:** open. **Highest-value first task on Day 2.**

### R7 — Vercel Hobby 10s timeout under demo load · L2 × I4 = **8→12 on demo day**
Twelve stokvel collections firing at once could contend.

**Mitigation:** no handler waits for MoMo. Collections are fired and returned; the scheduler
resolves. The stokvel run dispatches through the outbox rather than inline.
**Trigger:** any function timeout in the Vercel logs.
**Status:** designed in.

### R8 — Solo developer unavailable · L2 × I5 = **10**
Illness, load-shedding, a family obligation. There is no second developer.

**Mitigation:** everything is in the repo, not in one head — `CLAUDE.md`, `PLANNING.md`, `STATUS.md`
exist precisely so a cold session can resume. Work is pushed daily. Load-shedding: keep the laptop
charged, phone hotspot as backup, and schedule integration work for daylight hours.
**Residual:** two lost days would force cuts 1-4 immediately.

### R9 — Public repo exposes the idea to other entrants · L3 × I3 = **9**
The repo must be public for branch protection and Actions minutes on the free plan (ADR-0005).

**Mitigation:** none technically available without paying. Judged execution, not ideas — and a
public, conventionally-committed history is itself evidence for the "this is a real build" claim.
**Residual:** accepted, with the user's explicit decision on 2026-09-02.

---

## Medium (score 5-8)

### R10 — Supabase 1GB storage exhausted by proof photos · L2 × I3 = 6
Client-side compression to 1280px / 200KB. `demo:reset` purges the bucket. ~5,000 photos of headroom.

### R11 — Telegram bot token leaked in the public repo · L2 × I4 = 8
`gitleaks` pre-commit and in CI. Rotate immediately if it ever happens; assume compromise, do not
rely on rewriting history.

### R12 — Migration breaks production near the deadline · L2 × I4 = 8
Additive-first migrations. Staging deploys before production. Migration replay tested in CI on every
PR. **Freeze rule: no schema changes after Day 24.**

### R13 — E2E suite becomes flaky and gets ignored · L3 × I2 = 6
Only 5 specs are blocking; the rest run nightly. Any flaky spec is quarantined within 24 hours, not
retried in a loop. A suite people ignore is worse than no suite.

### R14 — Africa's Talking sandbox unavailable · L3 × I2 = 6
The USSD simulator drives our own handler directly. AT is a nice-to-have, never a dependency
(`docs/11` §7).

### R15 — Agent PRs conflict and cost a day · L3 × I2 = 6
Disjoint ownership map, contracts frozen first, one merge at a time, max three agents
(`docs/07`).

### R16 — The demo works on the laptop but not in the room · L2 × I4 = 8
Test screen mirroring in the actual venue. Hotspot ready. Backup video local. Rehearse three times.

---

## Low (score ≤ 4)

| # | Risk | Score | Handling |
|---|---|---|---|
| R17 | Vercel Hobby bandwidth exceeded | 3 | 100GB. We will use a fraction. Monitored. |
| R18 | npm dependency vulnerability blocks CI | 4 | `npm audit` gates on high+. Pin versions. |
| R19 | Name collision ("MoMo Kasi Mobile" is an existing SA health app) | 4 | Different category. Renaming is one constant (ADR-0002). |
| R20 | Judges ask for a live production deployment | 2 | Explicitly out of scope; stated in `docs/00` §7. |

---

## Review log

| Date | Milestone | Changes |
|---|---|---|
| 2026-09-02 | Planning | Register created. R1, R4, R6 flagged as needing Day 2 action. |
