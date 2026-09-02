# ADR-0014 — The agent cannot move money

- Status: Accepted
- Date: 2026-09-02

## Context

We are putting a large language model into a payments application. LLMs hallucinate, can be
prompt-injected, and misparse numbers. A user will say "pay Nomsa for the wash" and expect it to
happen. Making that convenient is the whole point of a conversational wallet — and it is also the
most dangerous thing in the project.

A judge **will** ask: *"what happens when your AI gets it wrong?"* We want a structural answer, not
a reassuring one.

## Options

**A. The agent executes payments directly.** Best UX, and one hallucinated amount or one injected
instruction in a job title moves real money. Unacceptable.

**B. The agent executes, with a confidence threshold or a spending cap.** A cap limits the damage
without preventing it, and "the model was confident" is not a control.

**C. The agent proposes; the user confirms with an explicit physical action.**

## Decision

**C**, enforced structurally rather than by prompt.

1. **`propose_*` tools have no database write access.** They construct and return a proposal object.
   There is no code path from the agent to the ledger. This is a capability boundary, not an
   instruction the model could be talked out of.
2. **Proposals are server-signed** — HMAC over `(amount, payee, purpose, userId, expiry)`, expiring
   in 120 seconds. The confirm endpoint re-validates server-side and ignores anything else the
   client sends.
3. **The confirmation card renders from the signed proposal, not from the chat text.** If the agent
   says "R45" but the proposal holds R450, the user sees R450 and the mismatch is logged as an
   incident.
4. **No auto-confirm, no "just do it" mode**, at any amount, even on request.
5. **Voice cannot confirm.** A spoken "yes" never moves money; the tap does. Voice is spoofable and
   a television in the background should not be able to pay someone.

## Consequences

**Easier:** the worst case of a hallucination or an injection is a wrong card that the user
declines. The failure mode is annoying, never expensive. It also gives us the strongest possible
answer to the obvious question:

> *"It can't. The agent can only propose. The proposal is server-signed, the card renders from the
> signature, and a human thumb is the only thing in the system that moves money."*

**Harder:** one extra tap on every payment. That tap is the product's integrity, and users of
financial apps expect confirmation — removing it would feel wrong, not slick.

**Tested by:** an integration test asserting `propose_payment` writes nothing; a security test that
tampers with a proposal's amount client-side and asserts server rejection; and an E2E test where the
agent's prose and the proposal disagree, asserting the card shows the proposal.
