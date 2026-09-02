# ADR-0002 — Product name **Vula**, four modules, one wallet

- Status: Accepted
- Date: 2026-09-02

## Context

Three overlapping concepts were on the table: VulaGigs (township micro-work escrow), KombiPay +
RankWorks (taxi fintech and rank youth employment), and a daily-use bill-payment wallet. Judges
reward one deep story over three shallow ones, and 25 days does not permit three products.

The user's own framing settled the centre of gravity: *daily use, habit-forming, built on what
Africans share.*

## Options

**A. Taxi-first (KombiPay).** Deepest single vertical, clearest market number (R90bn), but bills and
gigs become side tabs and the habit story narrows to commuting.

**B. Gig-first (VulaGigs).** Strongest social story, but gig frequency is weekly at best — too low
to be a habit, and the wallet stays a destination.

**C. Daily-use wallet with gigs as the earn engine.** Earn → Share → Spend as one loop. Gigs supply
income, stokvels supply the recurring obligation, taxi/electricity/school fees supply the daily
frequency.

## Decision

**C**, branded **Vula** (isiZulu/isiXhosa: *to open*), with four modules over one wallet and one
ledger: **Vula Ride**, **Vula Gigs**, **Vula Stokvel**, **Vula Bills**.

Names considered and rejected: *Sisonke* (strong meaning, less memorable), *Zwakala* (heavily
associated with a beer campaign), *Chippa* (collides with a well-known football club), *Umgalelo*
(authentic but hard to spell for a mixed panel).

## Consequences

**Easier:** one narrative — *money is earned, shared, and spent, and every step stays inside MoMo*.
"Vula" pairs naturally with MoMo's **Open** API and continues the user's original "VulaGigs" naming.
Every feature is testable against one question: *does this increase weekly touches?*

**Harder:** four modules is more surface than one. Mitigated by them sharing a single ledger and
identity — they are views over one wallet, not four applications.

**Known risk:** *Vula Mobile* is an existing South African health-tech app. Different category, low
practical confusion, and renaming costs one constant if it ever matters (R19).
