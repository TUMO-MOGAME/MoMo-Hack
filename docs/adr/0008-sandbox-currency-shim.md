# ADR-0008 — ZAR ledger, EUR at the MoMo boundary

- Status: Accepted
- Date: 2026-09-02

## Context

The MTN MoMo sandbox accepts **EUR only** (`momoAPIs.md` §11). Our users are South African, our
market numbers are in rand, and every screen a judge sees must say **R**.

## Options

**A. Store EUR everywhere.** The ledger would be in a currency the product does not use, every
screen needs conversion, and the market story reads wrong.

**B. Store ZAR, convert with a real FX rate at the boundary.** Superficially "correct", but it means
our ledger and MTN's records hold different numbers, so reconciliation requires reversing a rate —
and any rate drift becomes an unexplainable discrepancy. A technical judge would spot this
immediately.

**C. Store ZAR, transmit the same numeric value under the EUR label, 1:1, no rate.**

## Decision

**C.** The ledger and every UI surface are ZAR minor units. At the MoMo boundary — and only there —
the amount is emitted unchanged with `currency: "EUR"` when `MOMO_TARGET_ENVIRONMENT=sandbox`.
`1250` ZAR cents becomes `"12.50"` EUR. No exchange rate is applied.

The mapping exists in exactly one file, `src/lib/momo/currency.ts`, and one test. The string `EUR`
appears nowhere else in the codebase.

## Consequences

**Easier:** reconciliation is exact — the same number appears on both sides, so a MoMo status
response can be compared to a ledger posting with no arithmetic. Demo amounts stay legible (R12.50
is a real Johannesburg taxi fare; €12.50 would be absurd). In production the shim collapses to a
formatter and nothing else changes.

**Harder:** it is technically a lie to the sandbox about the currency. It is a *sandbox*, no value
moves, and the alternative (a fake FX rate) is worse in every way that matters.

**The one-sentence answer when asked:** *"The sandbox is EUR-only, so we transmit the same numeric
value under the EUR label and reconcile 1:1. In production the label becomes ZAR and nothing else
changes."* Rehearsed in `docs/08` §5 — it is the most likely technical question we will get.
