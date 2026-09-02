# Vula

**The daily-money app for Mzansi.** Youth **earn** through micro-gigs, money **circulates** through
stokvels and shared bills, and is **spent** on taxi fare, electricity and school fees — all on the
MTN MoMo API suite.

Built for the MTN MoMo API Hackathon, South Africa · 2026

---

> MTN gave 11 million South Africans *access* to financial services.
> **Vula turns access into daily participation.**

---

## The problem

| | |
|---|---|
| **47.4%** | youth unemployment in South Africa, Q2 2026 — about 5 million people |
| **R90-100bn** | annual minibus taxi revenue, effectively all in cash |
| **~11 million** | stokvel members across ~800,000 groups, moving **R50bn+** a year in cash and paper books |

A wallet you open when you remember it is not financial inclusion. Vula targets **~16 transactions
per user per week** by digitising the three things township money already does every day.

## The loop

```
   EARN                 SHARE                    SPEND
   Vula Gigs      ->    Vula Stokvel      ->     Vula Ride    (taxi fare, QR)
   rank micro-work      split-a-bill             Vula Bills   (electricity, school fees, airtime)
   remittance in        family sub-wallet
      ^                                              |
      +----------- demand creates the next gig ------+
```

## Architecture

Three MoMo APIs orchestrated over a **double-entry ledger**.

| | |
|---|---|
| **Collections** | fares, bills, stokvel contributions, escrow funding |
| **Disbursements** | escrow release, revenue splits, stokvel payouts, bulk payroll |
| **Remittances** | diaspora funding of purpose-locked family sub-wallets |

Every cent is traceable to a balanced journal. Idempotent by construction — our primary key is MTN's
`X-Reference-Id`, so a retry cannot double-pay. Two independent paths to resolution: MoMo's callback,
and a reconciler that is the authority.

**Stack:** Next.js 15 · TypeScript · Supabase (Postgres, RLS, Storage, Realtime) · Vercel ·
Telegram Bot API · GitHub Actions as the scheduler. **Total infrastructure cost: R0.**

## Documentation

Start here if you are new to the repository — or a fresh agent session:

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Standing orders. The non-negotiable rules. |
| [`PLANNING.md`](PLANNING.md) | What we are building and why. Scope, milestones, decisions. |
| [`STATUS.md`](STATUS.md) | What is done, in flight, tested, and blocked. |
| [`momoAPIs.md`](momoAPIs.md) | MoMo API reference, with confidence ratings and a re-verification protocol. |

Then:

| | |
|---|---|
| [00 Product Brief](docs/00-PRODUCT-BRIEF.md) | The thesis, market evidence, personas, why this beats Zaka |
| [01 Architecture](docs/01-ARCHITECTURE.md) | System design, module boundaries, the fare flow |
| [02 Data Model](docs/02-DATA-MODEL.md) | Schema, chart of accounts, ledger invariants, RLS matrix |
| [03 MoMo Integration](docs/03-MOMO-INTEGRATION.md) | Client, idempotency, reconciliation, emulator |
| [04 Testing Strategy](docs/04-TESTING-STRATEGY.md) | Eleven test types and the quality gate |
| [05 Delivery Plan](docs/05-DELIVERY-PLAN.md) | 28-day schedule and the cut list |
| [06 Engineering Standards](docs/06-ENGINEERING-STANDARDS.md) | Git, CI, branch protection, ADR process |
| [07 Agent Playbook](docs/07-AGENT-PLAYBOOK.md) | Running parallel agents without merge chaos |
| [08 Demo Runbook](docs/08-DEMO-RUNBOOK.md) | The five-minute script and its failure playbook |
| [09 Risk Register](docs/09-RISK-REGISTER.md) | Scored, owned, dated |
| [10 Free Tier Budget](docs/10-FREE-TIER-BUDGET.md) | Every limit, and what breaks first |
| [11 API Usage Map](docs/11-API-USAGE-MAP.md) | Every external call, its trigger, its ledger effect |
| [12 Voice & Conversational AI](docs/12-VOICE-AND-CONVERSATIONAL-AI.md) | Language strategy, the phrase bank, the agent persona |
| [13 Chat, Artifacts & Generative UI](docs/13-CHAT-ARTIFACTS-UI.md) | A conversation that grows a dashboard |
| [ADRs](docs/adr/) | Ten decisions, with the options we rejected |

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in your MoMo, Supabase and Telegram values
supabase start                    # local Postgres + Studio (Docker)
supabase db reset                 # replay every migration + seed the demo world
npm run dev
```

```bash
npm run verify                    # typecheck, lint, unit, property, contract, integration, build
npm run test:e2e                  # Playwright
npm run demo:reset                # restore the seeded demo world
```

Local development runs against the **MoMo emulator** by default (`MOMO_MODE=emulator`) — no network,
no credentials, deterministic. Set `MOMO_MODE=sandbox` to hit the real MTN sandbox.

## Status

**Planning complete. Build starts Day 2 (3 Sep 2026).** See [`STATUS.md`](STATUS.md) for the live board.

## Disclaimer

This is a hackathon prototype running against the **MTN MoMo sandbox**. No real money moves.
KYC/FICA compliance, licensing and production key management are explicitly out of scope and are
documented as such in [`docs/00-PRODUCT-BRIEF.md`](docs/00-PRODUCT-BRIEF.md) §7.

---

Built by [Tumo Mogame](https://github.com/TUMO-MOGAME).
