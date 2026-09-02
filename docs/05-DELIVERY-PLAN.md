# 05 — Delivery Plan

## 1. The honest capacity assessment

Read this before the schedule, because the schedule is meaningless without it.

- **One developer**, augmented by parallel Claude agents.
- **28 calendar days**: Wed 2 Sep → Tue 29 Sep 2026.
- **Code freeze Sun 27 Sep**, submit Mon 28 Sep, one day of buffer.
- Assume **~6 focused hours/day**, more on weekends. That is roughly **170 hours**.
- Agents multiply throughput on *parallelisable, well-specified* work. They do **not** multiply
  throughput on integration, debugging, or decisions. Realistic effective gain: **1.6-2.0x** on
  build-heavy days, ~1.0x on integration days.

**The scope in `PLANNING.md` §4 is larger than 170 hours.** That is deliberate: MUST is sized to
fit, SHOULD is sized to be mostly achievable, COULD will probably not happen. The cut list in §6 is
not a contingency — it is the plan for how we finish on time.

**The one rule that protects the deadline:** if a MUST item is not done by its milestone date, a
SHOULD item gets cut *that day*, not later. Deciding late is how hackathon projects fail.

---

## 2. Sequencing principle: riskiest thing first

We do not build bottom-up. We build a **walking skeleton** — the thinnest possible end-to-end slice
through every layer — and then thicken it.

Day 3 target: a real `requesttopay` fired from a deployed Vercel function, resolved by the
reconciler, writing balanced ledger rows in Supabase, with a Telegram message landing on a phone.
Ugly, hardcoded, one route. But every integration risk in the project is retired by Friday of week one.

If that slips past Day 5, we descope immediately. Everything after it assumes it works.

---

## 3. Week 1 — Foundation and the walking skeleton
### Wed 2 Sep → Tue 8 Sep · Milestones M0, M1

| Day | Date | Focus | Deliverable |
|---|---|---|---|
| 1 | Wed 2 Sep | **Planning** (done) | This document set. Repo decisions made. |
| 2 | Thu 3 Sep | **Pipeline** | Repo public + ruleset on `main`. Next.js scaffold. Supabase staging + prod. Vercel connected. CI running the full gate on a throwaway PR. MoMo sandbox keys in GitHub Secrets. **Portal verification pass on `momoAPIs.md`.** |
| 3 | Fri 4 Sep | **Walking skeleton** | `POST /api/momo/collections` → real sandbox call → reconciler → ledger rows → Telegram message. Deployed. Recorded as a video for the pitch. |
| 4 | Sat 5 Sep | **Ledger properly** | Full schema migration, chart of accounts, invariant triggers, journal writer. Property tests P1-P3 green. |
| 5 | Sun 6 Sep | **Split engine** | Basis-point split with remainder distribution. Versioned split rules. Property tests exhaustive. |
| 6 | Mon 7 Sep | **State machine + reconciler** | Guarded transitions, retry policy, `INITIATED` re-send. Concurrency test: 10 resolvers, 1 journal. |
| 7 | Tue 8 Sep | **MoMo emulator** | Record real sandbox responses. Emulator replays them. CI switched to emulator. |

**Gate at end of week 1:** money moves end to end, the ledger always balances, CI is green, and the
build no longer depends on MTN's sandbox being up.

---

## 4. Week 2 — Money engine and channels
### Wed 9 Sep → Tue 15 Sep · Milestone M2

| Day | Date | Focus | Deliverable |
|---|---|---|---|
| 8 | Wed 9 Sep | **Disbursements** | Transfer, status, payout orchestration, outbox. |
| 9 | Thu 10 Sep | **Escrow** | Full job lifecycle: hold → proof → approve → release, plus refund and dispute branches. **M2 complete.** |
| 10 | Fri 11 Sep | **Telegram bot core** | Webhook + secret verification, conversation state machine, `/start` linking a Telegram id to a profile. |
| 11 | Sat 12 Sep | **Telegram flows** | Pay, earn, balance. Inline keyboards. `editMessageText` live status updates. |
| 12 | Sun 13 Sep | **Taxi fare + split live** | QR generation and scan, fare collection, 60/25/10/5 applied and visible. |
| 13 | Mon 14 Sep | **Web shell** | Auth, layout, design system, commuter view. |
| 14 | Tue 15 Sep | **Worker + rank views** | Job board, accept, proof upload to Storage, rank admin dashboard. |

**Risk checkpoint (Day 14):** if Telegram or escrow is not working by now, cut S1 (USSD) and S4
(trust score) immediately and reassign those days.

---

## 5. Week 3 — Depth and the things that win
### Wed 16 Sep → Tue 22 Sep · Milestone M3, M4 begins

| Day | Date | Focus | Deliverable |
|---|---|---|---|
| 15 | Wed 16 Sep | **Stokvel engine** | Groups, membership, schedule, contribution collection, rotating payout. The retention story. |
| 16 | Thu 17 Sep | **Bills** | Prepaid electricity with token issuance, school fees, airtime. **M3 complete.** |
| 17 | Fri 18 Sep | **Remittances + locked wallet** | Diaspora funding, purpose-locked spend enforcement. |
| 18 | Sat 19 Sep | **USSD** | State machine plus the feature-phone simulator UI. |
| 19 | Sun 20 Sep | **Offline-first** | Service worker, IndexedDB queue, sync on reconnect. Airplane-mode E2E test. |
| 20 | Mon 21 Sep | **Live console + trust score** | Realtime webhook console. Ubuntu Trust Score. Split-a-bill. |
| 21 | Tue 22 Sep | **Load + chaos** | k6 fare storm with the correctness assertion. Chaos drills: duplicate, late, out-of-order callbacks. |

---

## 6. Week 4 — Harden, rehearse, submit
### Wed 23 Sep → Tue 29 Sep · Milestones M4, M5, M6

| Day | Date | Focus | Deliverable |
|---|---|---|---|
| 22 | Wed 23 Sep | **Polish + a11y** | axe pass, Slow 3G pass, 320px pass, empty states, error states. |
| 23 | Thu 24 Sep *(Heritage Day)* | **Feature complete** | **M4.** All MUST + SHOULD done. Full E2E suite green. Security review. |
| 24 | Fri 25 Sep | **Seed + demo build** | Demo world seeded, `demo:reset` working, demo script written as an executable E2E spec. |
| 25 | Sat 26 Sep | **Rehearsal 1 + deck** | Full run-through, timed. Pitch deck built. Fix whatever broke. |
| 26 | Sun 27 Sep | **Rehearsals 2 & 3 + video. CODE FREEZE 18:00.** | **M5.** Backup video recorded. After freeze: documentation and deck only. |
| 27 | Mon 28 Sep | **Submit** | **M6.** Submission in by midday. |
| 28 | Tue 29 Sep | **Buffer** | Exists to be unused. |

> **Heritage Day (Thu 24 Sep) is a public holiday in South Africa** — a full uninterrupted day.
> It is deliberately placed on the feature-complete milestone.

---

## 7. The cut list

If we are behind, cut **in this order**, without debate. The order is chosen so that each cut
removes the most hours for the least damage to the demo narrative.

| Order | Cut | Hours saved | What we lose | Mitigation in the pitch |
|---|---|---|---|---|
| 1 | C1-C4 (all COULD items) | ~20 | Nothing demoed | Never mentioned |
| 2 | S4 Trust Score | ~6 | A slide's worth of "beyond payments" | Show the data model that enables it |
| 3 | S6 Split-a-bill | ~5 | One sharing behaviour | Stokvel already proves the sharing thesis |
| 4 | S2 Offline-first | ~10 | The airplane-mode moment | Say it is designed for, show the queue schema |
| 5 | S3 Remittances | ~10 | One of the three APIs | **Painful — this weakens "multi-API orchestration"** |
| 6 | S1 USSD | ~12 | The feature-phone moment | Show the simulator mockup only |
| 7 | M8b School fees | ~4 | One bill rail | Electricity carries the bills story |
| 8 | M9d Rank admin view | ~8 | Rank-side visibility | Drive it from the Telegram bot instead |

**Never cut:** the ledger, the split engine, escrow, collections, disbursements, Telegram, the
taxi fare flow, stokvel, or the test suite. Those are the submission.

**Cutting S3 (Remittances) hurts most** because "three MoMo APIs orchestrated" is a core claim
against Zaka. If it comes to it, a minimal remittance — one endpoint, one flow, one screen — beats
cutting it entirely. Budget 4 hours for that fallback rather than 10 for the full feature.

---

## 8. Daily rhythm

```
Morning    (30 min)  Read STATUS.md. Pick the day's slice. Write the agent briefs.
Mid-morning (2-3 h)  Agents run in parallel on disjoint trees. You do the integration work
                     that cannot be parallelised.
Afternoon  (2-3 h)   Review agent PRs. Merge green ones. Fix what CI caught.
Evening    (30 min)  Update STATUS.md. Write an ADR if a decision was made.
                     Push everything. Never end a day with unpushed work.
```

**Every day ends with `main` deployable.** Not "nearly". If `main` is broken at the end of a day,
fixing it is the first thing tomorrow, before any new work.

---

## 9. Definition of Done

A workstream is Done when **all** of these are true. No exceptions, no "I'll add tests later".

1. Code merged to `main` through a PR with a green quality gate.
2. Test level meets the tier in `docs/04` (money paths need property tests, not just unit tests).
3. Migrations applied to staging and production.
4. `STATUS.md` updated: state, test level, PR link.
5. `momoAPIs.md` updated if any MoMo behaviour was learned or confirmed.
6. An ADR exists if a constraining decision was made.
7. It works on a real phone, not just on the desktop.

---

## 10. Progress tracking

`STATUS.md` is the board and it is updated **in the PR**, not afterwards. At each milestone, add a
line to the session log with:
- What actually shipped versus what was planned
- Hours spent versus estimated (so later estimates get better)
- What was cut and why

Falling behind is normal and fine. **Falling behind silently is what kills the deadline** — by the
time it is visible, the cut list is no longer enough.
