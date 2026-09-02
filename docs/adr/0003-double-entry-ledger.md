# ADR-0003 — Double-entry ledger as the source of truth

- Status: Accepted
- Date: 2026-09-02

## Context

The system moves money between commuters, drivers, owners, workers, stokvel pools, insurance pools
and escrow. A fare splits four ways. Escrow holds funds that belong to neither party yet. Remittances
are locked to a purpose. Every one of these is a place where a naive `balance` column loses money.

## Options

**A. A `balance` column per wallet, updated transactionally.** Simplest to write and to read. But
concurrent updates need careful locking, there is no audit trail, a bug is unrecoverable because the
history that would let you reconstruct the truth was never written, and "why is my balance wrong?"
has no answer.

**B. Transaction log plus a cached balance.** Better, but the cache can drift from the log and
nothing detects it.

**C. Double-entry ledger.** Balances are derived, never stored. Every movement is a set of postings
summing to zero.

## Decision

**C.** `journal` + `ledger_entry`, append-only, with the balance rule enforced by a deferred
constraint trigger. No table anywhere stores a balance.

## Consequences

**Easier:** every cent is explainable — "show me why this balance is what it is" is one query.
Escrow and locked funds need no special logic; they are simply different accounts, so a held amount
is not in the user's wallet sum by construction. Concurrency is safe because we only ever insert.
Reconciliation against MoMo is straightforward. A bug is recoverable, because a reversing entry
fixes it without destroying evidence.

**Harder:** more rows, and balance reads are aggregations. At our scale (≈1.2M fares fit in the free
500MB) this is irrelevant; if it ever mattered, a materialised view is the answer.
Developers unfamiliar with double-entry need the sign convention explained — hence `CLAUDE.md`'s
vocabulary section.

**The demo payoff:** this is the single most credible thing in the build. "Every cent traceable to a
balanced journal, enforced by the database, property-tested with 5,000 generated cases" is a
sentence that separates a payments system from a prototype.
