# MoMo Kasi — Master Plan

**Living document.** Updated when scope, architecture or sequencing changes.
Day-to-day progress lives in `STATUS.md`, not here.

---

## 1. The one-sentence pitch

> MTN gave 11 million South Africans *access* to financial services.
> **MoMo Kasi turns access into daily participation** — by digitising the three things
> township money actually does every day: it is **earned** in the informal economy,
> **shared** through stokvels, and **spent** on taxis, electricity and school fees.

The MTN Group Fintech CEO said it himself on 1 September 2026:

> *"We started by giving customers access to financial services. Now we want to move from
> access to active participation."* — Serigne Dioum, MTN Group Fintech CEO

That sentence is our product spec. Access is a wallet you open when you remember it.
Participation is a wallet you open sixteen times a week because other people are counting on you.

---

## 2. The insight: what Africans share

The question "what do Africans share?" has a precise, measurable answer in South Africa:
**money, structurally.**

- **~800,000 stokvels**, **~11 million members** — one in five adults — moving **R50bn+** a year.
- These run on WhatsApp groups, a paper book, and a treasurer holding cash in a shoebox.
- Every stokvel is an **un-digitised recurring payment schedule with built-in social enforcement.**

That last line is the whole retention thesis. Nobody defaults on their stokvel, because their
aunt is in the group. It is the strongest habit mechanism in African consumer finance, and it
is almost entirely offline.

Alongside it sit the other daily sharing behaviours we digitise:
"chippa in" for a shared bill, sending money home (black tax), funding a relative's specific
need, sharing airtime and data, pooling for December groceries, burial societies.

---

## 3. The habit loop

```
                    +--------------------------------------+
                    |                                      |
                    v                                      |
   +----------------------------+                          |
   |  EARN                      |   Gigs create the income |
   |  - Kasi Gigs (escrow)      |   that funds the         |
   |  - Rank micro-work         |   spending.              |
   |  - Remittance in (diaspora)|                          |
   +-------------+--------------+                          |
                 |                                         |
                 v                                         |
   +----------------------------+                          |
   |  SHARE                     |   The obligation that    |
   |  - Stokvel pools           |   makes you open the app |
   |  - Split-a-bill / chippa in|   on a schedule.         |
   |  - Family sub-wallet       |                          |
   +-------------+--------------+                          |
                 |                                         |
                 v                                         |
   +----------------------------+                          |
   |  SPEND                     |   Daily, unavoidable,    |
   |  - Taxi fare (QR)          |   currently ~100% cash.  |
   |  - Prepaid electricity     |                          |
   |  - School fees             |   Merchant demand -------+
   |  - Airtime / data          |   creates the next gig.
   +----------------------------+
```

**Touchpoints per user per week** — this is the number that goes on the slide:

| Behaviour | Frequency | Weekly touches |
|---|---|---|
| Taxi fare (commute) | 2x/day, 5 days | 10 |
| Prepaid electricity | weekly top-up | 1 |
| Stokvel contribution | weekly | 1 |
| Airtime / data | 2x/week | 2 |
| Gig accepted or paid out | 1-3x/week | 2 |
| **Total** | | **~16 / week** |

A conventional wallet gets 1-4 touches a month. That gap is the submission.

---

## 4. Scope (MoSCoW)

Full detail in `docs/00-PRODUCT-BRIEF.md`. Cut order in `docs/05-DELIVERY-PLAN.md`.

### MUST — no demo without these

| ID | Item |
|---|---|
| M1 | Double-entry ledger + split engine (basis points, integer-exact) |
| M2 | MoMo Collections: fare/bill payment via `requesttopay`, full state machine |
| M3 | MoMo Disbursements: escrow release + revenue-split payout |
| M4 | Escrow: hold, photo proof, approve, release, with reconciliation |
| M5 | Telegram bot: the primary zero-data UI (replaces WhatsApp for this build) |
| M6 | Taxi fare QR + automatic 60/25/10/5 revenue split |
| M7 | Stokvel: create group, scheduled contributions, rotating payout |
| M8 | Prepaid electricity + school fees rails (simulated token issuance) |
| M9 | Web dashboard: commuter, worker, rank-admin views |
| M10 | CI quality gate, protected `main`, Supabase migration pipeline |

### SHOULD — this is what makes it look like a two-month build

| ID | Item |
|---|---|
| S1 | USSD fallback (`*120*KASI#`) with an on-screen feature-phone simulator |
| S2 | Offline-first fare capture (service worker + queued sync, demoed in airplane mode) |
| S3 | MoMo Remittances: diaspora funds a **purpose-locked** family sub-wallet |
| S4 | Ubuntu Trust Score (completed gigs unlock tool-lease eligibility) |
| S5 | Live webhook console — money moving on screen, in front of the judges |
| S6 | Split-a-bill / "chippa in" via a Telegram group link |
| S7 | **Conversational agent** — a chat that renders live dashboards as typed artifacts |
| S8 | **Voice** — speak and be spoken to, provider-per-language, phrase bank |

### SHOULD — decided in ADR-0017, not yet built

**Standing mandates.** *"Save R200 a month for my daughter's birthday and send it to her on the
day."* *"Every month end, buy my grandmother electricity — but ask her how much is left first."*

These are the features that turn a wallet into something people keep using, and they required
amending the project's own safety rule to allow them (ADR-0017). The resolution: a mandate is a
**debit order, not an agent decision** — signed once, bounded in rands, stated before signing,
mandatory expiry, executed by deterministic server code with no model in the call path.

Five sub-parts, in dependency order:

1. **PIN + a confirmation surface outside the chat.** A PIN typed into a Telegram message is in the
   chat history, the lock-screen preview and the bot's logs. One-time token → Telegram Mini App or
   web page → PIN posts straight to the confirm endpoint. `scrypt` from `node:crypto`.
2. **The mandate object** — signed, capped, expiring; drafted by the agent, created only by a human.
3. **The scheduler executing them** — idempotent under retry, notify-the-day-before, frictionless
   STOP.
4. **The pre-execution question** — ask a third party, parse strictly, clamp to the signed cap. The
   answer can only ever *lower* the amount.
5. **Receipts** — an immutable receipt page at a stable URL. Not a generated PDF: that needs either
   a headless browser (will not fit Vercel Hobby) or a new dependency, and "print to PDF" from a
   real page is free.

Blocked on auth (M9a), disbursements (M3a), the outbox drain (M3b) and the scheduler (F8).

### COULD — only if we are ahead of schedule

| ID | Item |
|---|---|
| C1 | Micro-insurance pool (R2/trip) with a claim flow |
| C2 | Licence-disc OCR via `tesseract.js` (client-side, zero cost, no account) |
| C3 | Alternative credit profile / Mashonisa-bypass lending simulation |
| C4 | Bulk payroll: 500 workers paid in one batch |

### WILL NOT — stated explicitly so we are not judged on them

- Real money. Sandbox only, EUR upstream, ZAR presented downstream.
- KYC/FICA/AML implementation. We model where it *would* sit and say so.
- A real taxi-association partnership, licence, or national payments integration.
- Native mobile apps. Responsive PWA plus Telegram Mini App only.
- Production key management (HSM/KMS). Env vars and GitHub Secrets.
- **WhatsApp.** Meta approval, Business Manager and business verification cannot be completed in
  the window (ADR-0007). Telegram needs no registration at all, which is the entire reason it
  won. This is settled; it does not get re-litigated the night before a demo.
- **Anything else gated on a signup, an approval, or a queue.** Same test as WhatsApp, applied
  consistently: if a third party has to say yes before it works, it is not in the demo path.

---

## 5. Architecture in one box

```
                    +------------- GitHub Actions (free, unlimited on a public repo)
                    |              - CI quality gate
                    |              - Scheduler  -- every 5 min --+
                    |                (Vercel Hobby cron is       |
                    |                 once/day, so unusable)     |
                    |              - Supabase keep-alive ping    |
                    v                                            |
  Telegram Bot --+                                               |
  Web PWA      --+--> Next.js on Vercel (Hobby)  <-- webhook ----+
  USSD sim     --+     - /app        UI                          |
                       - /api/momo   orchestration               |
                       - /api/telegram/webhook                   |
                       - /api/ussd                               |
                       - /api/cron/* (secret-guarded)  <---------+
                              |
                              v
                  Supabase Postgres (Free: staging + prod = the 2 allowed projects)
                       - double-entry ledger    - RLS deny-by-default
                       - transactional outbox   - Storage (photo proof)
                              |
                              v
                  MTN MoMo Sandbox (Collections, Disbursements, Remittances)
                       + local MoMo emulator for demo-day resilience
```

Rationale and alternatives: `docs/01-ARCHITECTURE.md` and `docs/adr/`.

---

## 6. Decisions already made

| ADR | Decision |
|---|---|
| 0001 | Single Next.js + TypeScript monolith on Vercel. No FastAPI, no separate Node service. |
| 0002 | Product name **MoMo Kasi**; modules Kasi Ride / Gigs / Stokvel / Bills. |
| 0003 | Double-entry ledger as the single source of truth for all balances. |
| 0004 | Money is `bigint` minor units; splits use integer basis points. |
| 0005 | **Repository is public** — the only way to get branch protection on GitHub Free. |
| 0006 | GitHub Actions is the scheduler, not Vercel Cron (Hobby allows once/day). |
| 0007 | Telegram replaces WhatsApp as the conversational channel for this build. |
| 0008 | Sandbox currency shim: store and present ZAR, transmit EUR to the MoMo sandbox. |
| 0009 | Ship a local MoMo emulator so the demo survives a sandbox outage. |
| 0010 | Service-role boundary: the browser can never write to ledger tables. |
| 0011 | Voice is provider-per-language. ElevenLabs supports **no** SA language — see the doc. |
| 0012 | Groq is the agent LLM; Gemini Flash is the fallback. Both free, no card. |
| 0013 | The agent emits typed, zod-validated data — never markup. |
| 0014 | **The agent cannot move money.** It proposes; a human thumb confirms. |

---

## 7. Milestones

> **⏰ INTERRUPT: there is a PRESENTATION on Thu 3 Sep at 09:30**, which the 28-day plan below did
> not know about. It is not a milestone in this table; it sits in front of all of them.
>
> **M0 and M1 are already done — on Day 1.** The repo, pipeline, CI gate, Supabase, Vercel and the
> walking skeleton all landed 2 Sep, so the table below is roughly six days ahead of itself. That
> slack is what makes the presentation survivable.
>
> What the presentation needs is in `STATUS.md` §Tomorrow 09:30, and it is deliberately narrow:
> the fare split running on the already-proven path, plus a rehearsed emulator fallback. Nothing
> in Phase 4, 5 or 6 is attempted before it.
>
> **The presentation cut adds one filter to §4's MoSCoW: anything gated on a signup, an approval
> or a queue is out**, for the same reason WhatsApp was rejected on Day 1 (ADR-0007). That is
> Africa's Talking USSD, ElevenLabs, Storage-backed proof upload, and auth. Out of *tomorrow*,
> not out of the project.

| # | Milestone | Date | Definition of done |
|---|---|---|---|
| **P** | **Presentation** | **Thu 3 Sep 09:30** | **Live: real MoMo money → 60/25/10/5 fare split → balanced journal, on the deployed function, with an emulator fallback rehearsed** |
| M0 | Repo + pipeline live | ~~Day 2, Thu 3 Sep~~ **done Day 1** | Protected `main`, CI green, staging + prod Supabase, Vercel deploying |
| M1 | **Walking skeleton** | ~~Day 3, Fri 4 Sep~~ **done Day 1** | A real `requesttopay` from deployed Vercel writes balanced ledger rows — **measured, journal `d6df990b`, sum 0** |
| M2 | Money engine complete | Day 9, Thu 10 Sep | Ledger, splits, escrow state machine, reconciliation, under property tests |
| M3 | Channels live | Day 16, Thu 17 Sep | Telegram bot + web dashboard drive the full earn/share/spend loop |
| M4 | Feature complete | Day 23, Thu 24 Sep | All MUST + SHOULD done, E2E green, load test passes |
| M5 | Code freeze | Day 26, Sun 27 Sep | Demo rehearsed 3x end to end, deck done, video recorded |
| M6 | Submitted | Day 27, Mon 28 Sep | Submission in, one day of buffer remaining |

---

## 8. How we work

- **Solo developer plus parallel Claude agents.** Contracts are frozen before any fan-out.
  Agents own disjoint file trees and never merge their own work. See `docs/07-AGENT-PLAYBOOK.md`.
- **Every change is a PR.** `main` is protected; CI is the arbiter.
- **Decisions become ADRs.** If a choice constrains future work, it gets a file in `docs/adr/`.
- **No vibe coding.** Options and a recommendation before any non-obvious choice is taken.

---

## 9. Open questions

| # | Question | Blocks | Owner | Needed by |
|---|---|---|---|---|
| ~~Q1~~ | ~~Confirmed hackathon submission deadline and portal?~~ | — | — | Dropped 2026-09-02. No longer tracked. |
| ~~Q2~~ | ~~GitHub repo URL~~ | — | — | ✅ `TUMO-MOGAME/MoMo-Hack` |
| ~~Q3~~ | ~~Public repo acceptable?~~ | — | — | ✅ decided, ADR-0005 |
| Q4 | Any hackathon-mandated stack, region or template? | Scope | Tumo | Day 4 |
| Q5 | Team name / entry registration required first? | Submission | Tumo | Day 5 |
| ~~Q6~~ | ~~Supabase region~~ | — | — | Decided 2026-09-02: **keep `eu-west-2` (London)**. See below. |

**Q1 is dropped.** The dates in §7 and §10 still assume 28 Sep and remain the working plan; they
are simply no longer treated as a hard external constraint. The cut list in `docs/05` §7 stays
available if the schedule tightens.

**Q6 now has a measurement, and a deadline of its own.** The first Supabase project resolves to
AWS `eu-west-2`, London — established by matching the database host's IPv6 address against
Amazon's published `ip-ranges.json`, not by reading the dashboard. Two consequences:

- **POPIA s72 is satisfiable either way**, but not identically. A transfer to the UK rests on the
  recipient being subject to a law affording adequate protection, which UK GDPR does. That is an
  argument we would have to make; a South African region is an argument we would not have to make
  at all. `docs/14` §7 asks for the closest region to SA, and London is not it.
- **The cost of changing this only goes up.** The project is empty today, so recreating it costs
  minutes. Once migrations, storage objects and demo data exist it costs a rebuild, and the free
  tier allows exactly two projects — so a throwaway attempt burns the staging slot.

**Decided 2026-09-02: keep `eu-west-2`.** Tumo's call, taken before the first migration ran,
which is the right moment for it. The consequence to carry forward is that POPIA s72 compliance
now rests on an *argument* — the UK's adequacy under UK GDPR — rather than on the data never
leaving the country. That belongs in the submission's privacy note and in `docs/14` §7, stated
plainly rather than left for a judge to notice. Not revisited: once migrations, storage objects
and demo data exist, moving costs a rebuild, and the free tier allows exactly two projects.

---

## 10. Phase plan

The 28-day schedule (`docs/05`) expressed as the phases the audit suite gates on. Each phase
closes with the audits it owes — **only those**, never the whole catalogue. That is the whole
point: a phase gate you can actually afford to run is a phase gate you will actually run.

### Phase 0 — Foundation and walking skeleton

Days 1-3. Repo, protected `main`, CI, Supabase projects, Vercel, the directory structure and the
frozen contracts. Closes on the **walking skeleton**: a real `requesttopay` from a deployed
function, resolved by the reconciler, writing balanced ledger rows.

Exit criterion: money moves end to end, ugly but real. Every integration risk retired by Day 3.

### Phase 1 — Design system and app shell

Days 4-5. Token source of truth, the artifact renderers, the chat shell, responsive down to 320px,
first accessibility pass. Largely built already on Day 1 — this phase finishes and grades it.

Exit criterion: the critical journey renders correctly on a real phone.

### Phase 2 — Narrative and content surfaces

Day 6. The public landing page, metadata, Open Graph, the pitch copy. Small on purpose.

Exit criterion: the link is shareable and says what this is.

### Phase 3 — Money engine

Days 7-13. Ledger, split engine, escrow state machine, Collections, Disbursements, reconciler,
outbox, the MoMo emulator. The core of the submission.

Exit criterion: the ledger always balances, under concurrency, with property tests to prove it.

**Exit criterion MET, 2026-09-02** — measured against real Postgres, not asserted: two connections
racing the same account produced one committed spend, one refusal, a global ledger sum of exactly
zero, and a credit-normal wallet that never went positive. Property tests had covered the pure
logic; only a real database could show the `DEFERRABLE` triggers actually firing.

**Phase 3 is not closed**, because it still owes its six audits (A1 A2 A3 A4 A5 A6) and none has
been run. Escrow (M4a), disbursements (M3a) and the outbox drain (M3b) are also still unbuilt —
they belong to this phase's scope even though the exit criterion is about the ledger.

### Phase 4 — Channels and products

Days 14-19. Telegram bot, the conversational agent and its artifacts, taxi fare and split,
stokvel engine, bills, remittances.

Exit criterion: the full earn -> share -> spend loop works from a phone.

### Phase 5 — Reach: offline, USSD, voice

Days 20-23. Offline-first PWA with the queued fare capture, the USSD state machine and simulator,
the English phrase bank and speech input.

Exit criterion: the loop works in airplane mode and on a feature phone.

### Phase 6 — Hardening, demo and submission

Days 24-28. Load and chaos testing, accessibility and performance passes, security review, seed
data, three rehearsals, code freeze, submit.

Exit criterion: submitted, with a day of buffer.

---

## 11. Audit suite

Audits are the shared TUMO OLO suite (`tumoOLO_Audits`), not bespoke checks. They live outside
this repo so a fix reaches every project, and so this project cannot quietly drift onto a softer
version of the accessibility standard.

**Run at the close of each phase, and only the audits that phase owes.**

| Audit | What it catches that the others do not | Runs at phases |
|---|---|---|
| A1 | Architecture, quality and UX in one sweep — the catch-all | Every phase |
| A2 | Drift from the design reference, token by token | 1, 3, 4, 5 |
| A3 | WCAG 2.2 AA beyond what axe sees — focus order, announcements, real keyboard journeys | 1, 3, 4, 5, 6 |
| A4 | Core Web Vitals, bundle weight, fonts, animation jank | 3, 4, 5, 6 |
| A5 | The whole system: headers, CSP, endpoint abuse, secrets, injection, reachability | 3, 4, 6 |
| A6 | Metadata, structured data, crawlability and copy — read from source | 2, 3, 6 |
| A7 | Offline behaviour, safe areas, platform conventions — PWA-scoped here | 5, 6 |
| A8 | CVEs, unmaintained packages, lockfile integrity, licences | 0, 4, 6 |
| A9 | Per-PR diff review — **disabled, needs a paid API key. A real gap, not a pass** | Disabled |
| S1 | The deployed site, not the source — a canonical that resolves, an index that is real | 6 |

### How a phase closes

```bash
node ../tumoOLO_Audits/runner/audit.mjs status     # where the project thinks it is
node ../tumoOLO_Audits/runner/audit.mjs plan       # what this phase owes, and why
node ../tumoOLO_Audits/runner/audit.mjs brief A5   # one self-contained brief per audit
node ../tumoOLO_Audits/runner/audit.mjs check      # A8 deterministic half
node ../tumoOLO_Audits/runner/audit.mjs gate       # fails if a Critical or High is still open
```

Each brief is run in a Claude Code session, the result written to
`docs/audits/results/PHASE-<n>-<ID>.md`, and `STATUS.md` updated — ledger row, open findings,
board cell from white to green. **An audit not written to `STATUS.md` did not happen.**

### The rules that are not negotiable

- **Report only. Never fix while auditing.** The order is audit, report, approve, fix. A fix pass
  inside the audit means nobody ever saw the finding.
- **Unmeasured is never a pass.** If a placeholder is empty or an audit did not run, it is
  reported as *Not measured*. A9 being disabled shows up as a gap on every report.
- **Project specifics go in an overlay**, `docs/audits/<ID>.project.md`, never by editing a shared
  audit. Wanting to edit a shared audit is the signal that an overlay is needed.
- **A Critical or High blocks the phase.** `gate` enforces it, so a phase cannot be declared
  closed with something real still open.
