# ADR-0013 — The agent emits typed data, never markup

- Status: Accepted
- Date: 2026-09-02

## Context

The app is a chat that renders dashboards: the user says something and a rich artifact appears. The
reference implementation (`C:\Social-Assembly-Main`) does this with CopilotKit generative UI and an
`Artifact` interface using optional per-type payload fields, plus a markdown renderer that converts
model output to HTML.

Our artifacts display **balances, splits and payment confirmations**, in a **public repository**.

## Options

**A. The agent emits HTML or markdown, we render it.** Maximum flexibility. Also means an LLM
controls what goes into the DOM of a financial application. Any prompt injection — a job title, a
stokvel name, a Telegram message quoted back into context — becomes a rendering primitive.

**B. Optional-field interface, as in the reference project.** Pragmatic and works, but it permits
invalid combinations (`type: 'wallet'` with a `plan` payload) that only fail at render time.

**C. A zod discriminated union, validated at the boundary, rendered by a fixed component registry.**

## Decision

**C.** `src/lib/artifacts/schema.ts` defines a zod discriminated union. The agent's `render_artifact`
tool arguments are validated against it before anything reaches React. A `type` maps to exactly one
component in a fixed registry. There is **no `dangerouslySetInnerHTML` in the artifact path at all**.

Two additional rules specific to money:

1. **Every monetary value must carry provenance** — `MoneySchema` requires a `sourceTxnId` or
   `sourceAccountId`. The agent cannot type a number into an artifact; it can only pass through a
   number a tool read from the ledger.
2. **Validation failure renders a visible error card**, never a blank panel or a silent fallback.

## Consequences

**Easier:** prompt injection cannot produce markup. Every artifact is unit-testable from a fixture.
The design stays consistent because the agent picks from components rather than inventing layouts.
Adding an artifact type is a schema entry plus a component — a small, reviewable diff.

**Harder:** the agent can only render what we have built. It cannot improvise a novel visualisation.
For a money app that is a feature, not a limitation — improvised financial charts are exactly what we
do not want.

**Kept from the reference project:** the doc-chip-in-chat plus panel pattern, `ArtifactContext` with
patch helpers, and auto-open on stream completion. Those are good design and we adopt them directly.
