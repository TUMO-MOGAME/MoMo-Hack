# 00 — Product Brief

## 1. The thesis

MTN does not have a distribution problem in South Africa. It has a **frequency** problem.

MoMo has access. What it does not yet have is a reason for a person in Tembisa to open it on a
Tuesday morning. Every feature in Vula is chosen to answer one question: *what makes someone use
this again tomorrow?*

The answer, in South Africa, is not a better wallet UI. It is the three money behaviours that
already happen daily in cash, and one of them is social:

1. **Earn** — informal, irregular, same-day income.
2. **Share** — the stokvel, the shared bill, the money sent home.
3. **Spend** — the taxi, the electricity meter, the school fee.

Digitise all three in one loop and the wallet stops being a destination and becomes a habit.

---

## 2. Market evidence

All figures verified 2026-09-02. Sources at the end of this document. Anything we cannot source,
we do not put on a slide.

### The opportunity MTN has publicly named

| Fact | Figure |
|---|---|
| MoMo monthly active users | 70M+ across 14 markets |
| MoMo transactions, H1 2026 | 13bn+ |
| MoMo transaction value, H1 2026 | $330bn+ |
| MoMo merchants / agents | 2.3M / 1M |
| MoMo international remittances, H1 2026 | $3bn+ |
| MTN's stated SA target | the cash economy: cash-dependent consumers and small merchants |

> *"We started by giving customers access to financial services. Now we want to move from access
> to active participation."* — Serigne Dioum, MTN Group Fintech CEO, 1 September 2026

> *"The national payments infrastructure is moving very fast. This is infrastructure that we want
> to leverage to penetrate the market."* — same interview

**We are building the thing the CEO described, one day after he described it.** That framing opens
the pitch.

### The cash economy we are attacking

| Sector | Size | Cash dependence |
|---|---|---|
| Minibus taxi industry | R90-100bn/year revenue | Effectively all cash, negligible record-keeping |
| Taxi fleet / drivers / associations | ~250,000 vehicles, ~600,000 drivers, ~1,500 associations | — |
| Share of daily public transport commutes | 70-75% | — |
| Stokvels | ~800,000 groups, ~11M members (1 in 5 adults), R50bn+ | Cash and paper books |

### The social problem that gives us a workforce

| Metric (Stats SA, Q2 2026) | Figure |
|---|---|
| National unemployment | 33.6% |
| Youth (15-34) unemployment | 47.4% |
| Unemployed youth, absolute | ~5 million (up 264,000 quarter on quarter) |

Two of every five young South Africans in the labour force cannot find work, while a
R90bn transport industry and 800,000 savings groups run on cash that nobody can see.
Vula sits in the middle of those two facts.

---

## 3. Who we are building for

### Nomsa, 24, Katlehong — the earner
Matric, no formal job, has a smartphone with 500MB of data and a MoMo wallet she uses twice a
month. She washes taxis at the rank on good days and gets paid in cash, sometimes.
**What she needs:** to be paid the day she works, without arguing, and proof she did the work.
**What Vula gives her:** an escrowed job with a photo-verified release, straight to her MoMo
wallet, plus a growing Trust Score that gets her a leased pressure washer.

### Thabo, 41, taxi owner, 3 vehicles
Trusts his drivers about as far as he can count the cash they hand over. Buys tyres from a
Mashonisa at 30% a month because no bank will score him.
**What he needs:** to see his revenue without being at the rank, and to borrow at a sane rate.
**What Vula gives him:** automatic 60/25/10/5 splitting at the moment of collection, a fuel and
parts pool that fills itself, and a verifiable transaction history that *is* a credit file.

### MaDlamini, 52, Soweto — the connector
Runs a 12-member grocery stokvel. Collects R300 a week from each member, in cash, in a book.
**What she needs:** to stop carrying R3,600 in a handbag and to stop chasing three people every week.
**What Vula gives her:** a group pool with automated collection, a visible balance every member can
see, and an automatic rotating payout. She is our distribution: she brings 11 users with her.

### Sipho, 33, London — the diaspora funder
Sends money home monthly and suspects some of it does not reach the school.
**What he needs:** to fund a *purpose*, not a person.
**What Vula gives him:** a purpose-locked sub-wallet via the Remittances API. His R2,000 can pay
school fees and nothing else.

---

## 4. The product

| Module | What it does | MoMo API |
|---|---|---|
| **Vula Ride** | QR/NFC taxi fare, automatic revenue split at source, driver float, offline capture | Collections + Disbursements |
| **Vula Gigs** | Micro-work marketplace with milestone escrow, photo proof, Trust Score | Collections + Disbursements |
| **Vula Stokvel** | Group pools, scheduled contributions, rotating payouts, shared visibility | Collections + Disbursements |
| **Vula Bills** | Prepaid electricity, school fees, airtime and data, split-a-bill | Collections |
| **Vula Home** | Purpose-locked family sub-wallet funded from the diaspora | Remittances |

The modules are not four apps. They share one ledger, one identity, one wallet. A fare paid in
Vula Ride is spendable in Vula Bills within the same second, because both are postings against the
same account.

---

## 5. Why this beats Zaka

Zaka won the 2023 MTN MoMo API Hackathon with cash-flow financing for informal merchants: instant
access to POS revenue. Good product, one API pipeline, one side of a market that already had money.

| Judging criterion | Zaka | Vula |
|---|---|---|
| **Beyond payments** | Cash-flow factoring on existing merchant revenue | Escrow, group savings, purpose-locked remittance, alternative credit scoring, micro-insurance pool — all on one ledger |
| **Financial inclusion** | Formalises money informal merchants already earn | Creates income for 5M unemployed youth who currently earn nothing, and digitises R50bn of stokvel money that never touched a bank |
| **MTN ecosystem value** | Velocity between shop owners and suppliers | ~16 transactions per user per week across four daily-life categories; every gig payout becomes fare and electricity spend inside MoMo |
| **Technical complexity** | One API pipeline | Three MoMo APIs orchestrated over a double-entry ledger, async state machines, idempotent webhook handling, reconciliation, offline queue, USSD fallback |
| **Design** | Polished merchant app | Telegram bot for zero-data users, PWA for smartphones, USSD for feature phones — the same ledger behind all three |

The honest one-line version: **Zaka moved existing money faster. Vula creates money that does not
exist yet, and gives it somewhere to go.**

---

## 6. What makes it look like two months of work

Judges see demos, but engineers on the panel see architecture. These are the details that read as
sustained engineering rather than a weekend build:

1. **Double-entry ledger.** Not a `balance` column. Every cent is traceable to a balanced journal.
2. **Integer basis-point splits** with explicit remainder handling. No floating-point money, anywhere.
3. **Idempotency by construction.** Our UUID is the MoMo `X-Reference-Id`. Retries cannot double-pay.
4. **Two independent paths to truth.** Webhook callback *and* a reconciliation poller, both replay-safe.
5. **RLS deny-by-default** with a test per policy, and a service-role boundary the browser cannot cross.
6. **Property-based tests on money invariants.** Splits always sum. Ledgers always balance.
7. **A load test that asserts correctness**, not just latency: 500 concurrent fares, ledger still balances.
8. **A MoMo emulator** built from recorded sandbox responses, so a live outage cannot kill the demo.
9. **Offline-first fare capture**, demonstrated live in airplane mode.
10. **Three channels, one core** — Telegram, PWA, USSD — proving the design is genuinely channel-agnostic.

---

## 7. Non-goals

Naming these protects us from being judged on things we deliberately did not build.

- No real money moves. MoMo **sandbox** only.
- No KYC/FICA/AML implementation. We show where it belongs in the architecture and stop there.
- No banking, lending or insurance licence. The credit score and insurance pool are demonstrations
  of what the data enables, clearly labelled as such.
- No taxi-association commercial agreement.
- No native apps.
- No production-grade secret management.

---

## 8. Sources

- [MTN sees South Africa's cash economy as MoMo's next frontier — TechCabal, 1 Sep 2026](https://techcabal.com/2026/09/01/mtn-momo-south-africa/)
- [MTN Mobile Money returns to SA — Connecting Africa](https://www.connectingafrica.com/mobile-money/mtn-mobile-money-returns-to-sa)
- [More than 11 million South Africans are members of stokvels — NASASA / EWN](https://www.ewn.co.za/2025/08/14/more-than-11-million-south-africans-are-members-of-stokvels-nasasa)
- [The transport industry that makes R100 billion in South Africa — TopAuto](https://topauto.co.za/news/136420/the-transport-industry-that-makes-r100-billion-in-south-africa-and-pays-almost-no-tax/)
- [Deep dive: the minibus taxi sector in South Africa — Kuba](https://blog.kubapay.com/deep-dive-the-minibus-taxi-sector-in-south-africa)
- [South Africa's unemployment crisis deepens as jobless rate rises to 33.6% — Mail & Guardian, 13 Aug 2026](https://mg.co.za/news/2026-08-13-south-africa-s-unemployment-crisis-deepens-as-jobless-rate-rises-to-33-6/)
- [Unemployment rises to 33.6% in Q2 2026 — Stats SA QLFS](https://www.statssa.gov.za/?p=19804)
- [Empowering the informal sector: Zaka at the MTN MoMo API Hackathon — IOL](https://iol.co.za/news/partnered/2023-12-13-empowering-the-informal-sector-zakas-revolutionary-solution-at-the-mtn-momo-api-hackathon/)
- [MTN MoMo API Hackathon unveils trailblazing innovations — IOL](https://www.iol.co.za/technology/techsperts/discover-the-future-mtn-momo-api-hackathon-unveils-trailblazing-innovations-695051ba-a05d-44d5-b2e0-41627d1cacd6)
