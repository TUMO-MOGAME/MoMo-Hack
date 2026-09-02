# ADR-0004 — Money as `bigint` minor units; integer basis-point splits

- Status: Accepted
- Date: 2026-09-02

## Context

A taxi fare of R12.50 splits 60/25/10/5. In floating point:
`12.50 * 0.25 = 3.125`, and `0.1 + 0.2 !== 0.3`. Do that across thousands of fares and the ledger
stops balancing — the exact failure this project cannot survive (R3).

## Options

**A. `float` / JS `number`.** Never acceptable for money. Listed only to record that it was rejected.

**B. `numeric`/`decimal` in Postgres, decimal library in TS.** Correct, but requires a library at
every boundary, and JSON serialisation silently converts to `number` unless every path is guarded.
One missed guard reintroduces the bug.

**C. `bigint` minor units.** R12.50 is `1250`. Exact by construction, native in both Postgres and
modern JS, and impossible to accidentally convert to a float without an explicit cast that is easy
to lint for.

## Decision

**C.** Every monetary column is `bigint`. Every monetary TS value is `bigint`. Splits use integer
basis points summing to exactly 10000, with remainder cents distributed deterministically
(largest fractional part first, ties broken by stable order).

## Consequences

**Easier:** arithmetic is exact. The split algorithm is provable, and property-tested exhaustively.
There is no rounding policy to argue about at three different layers.

**Harder:** `bigint` does not serialise to JSON natively — we need explicit `toString()` at API
boundaries and a `bigint`-aware parser on the way back. This is a one-time cost in a shared
serialiser, and it is *good* that it is explicit: it means every money value crossing a boundary is
consciously handled.

**Enforced by:** an ESLint rule banning `parseFloat`, `Number()` and `toFixed()` under
`src/domain/**` and `src/server/**`; a `numeric` column in a migration is a review rejection; and
the `ROUNDING` account, which should always be empty — a non-zero balance there is an alarm that the
split algorithm has drifted.
