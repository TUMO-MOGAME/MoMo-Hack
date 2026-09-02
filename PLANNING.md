# Vula — Master Plan

**Living document.** Updated when scope, architecture or sequencing changes.
Day-to-day progress lives in `STATUS.md`, not here.

---

## 1. The one-sentence pitch

> MTN gave 11 million South Africans *access* to financial services.
> **Vula turns access into daily participation** — by digitising the three things
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
   |  - Vula Gigs (escrow)      |   that funds the         |
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
| S1 | USSD fallback (`*120*VULA#`) with an on-screen feature-phone simulator |
| S2 | Offline-first fare capture (service worker + queued sync, demoed in airplane mode) |
| S3 | MoMo Remittances: diaspora funds a **purpose-locked** family sub-wallet |
| S4 | Ubuntu Trust Score (completed gigs unlock tool-lease eligibility) |
| S5 | Live webhook console — money moving on screen, in front of the judges |
| S6 | Split-a-bill / "chippa in" via a Telegram group link |
| S7 | **Conversational agent** — a chat that renders live dashboards as typed artifacts |
| S8 | **Voice** — speak and be spoken to, provider-per-language, phrase bank |

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
| 0002 | Product name **Vula**; modules Vula Ride / Gigs / Stokvel / Bills. |
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

| # | Milestone | Date | Definition of done |
|---|---|---|---|
| M0 | Repo + pipeline live | Day 2, Thu 3 Sep | Protected `main`, CI green, staging + prod Supabase, Vercel deploying |
| M1 | **Walking skeleton** | Day 3, Fri 4 Sep | A real `requesttopay` from deployed Vercel writes balanced ledger rows |
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
| Q1 | Confirmed hackathon submission deadline and portal? | Freeze date | Tumo | Day 2 |
| Q2 | GitHub repo URL (to be supplied) | Ruleset setup | Tumo | Day 1 |
| Q3 | Is a public repo acceptable under the competition rules? | ADR-0005 | Tumo | Day 1 |
| Q4 | Any hackathon-mandated stack, region or template? | Scope | Tumo | Day 2 |
| Q5 | Team name / entry registration required first? | Submission | Tumo | Day 5 |
