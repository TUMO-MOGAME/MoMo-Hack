# ADR-0007 — Telegram replaces WhatsApp

- Status: Accepted
- Date: 2026-09-02

## Context

The conversational channel is central to the product: it is the zero-data interface for users who
will not install another app. WhatsApp is the correct choice for South Africa in production —
penetration is near-universal and it is often zero-rated.

But the WhatsApp Business Cloud API requires a Meta developer account, a Business Manager, business
verification, a phone number that cannot be an existing personal WhatsApp, and template-message
approval. That process is measured in days-to-weeks with no guaranteed outcome, inside a 25-day build.

The user directed: use Telegram for the demonstration.

## Options

**A. WhatsApp Business Cloud API.** Right for the market, wrong for the timeline. Approval risk sits
on the critical path of the primary UI.

**B. Telegram Bot API.** Instant token from BotFather, no approval, free and unlimited, richer
primitives (inline keyboards, `editMessageText`, Mini Apps), and a proper webhook secret.

**C. Build only the PWA and skip conversational entirely.** Loses the zero-data story, which is a
core differentiator.

## Decision

**B**, with the channel layer abstracted so WhatsApp is a renderer, not a rewrite.

## Consequences

**Easier:** the bot works on day one. `editMessageText` lets a payment update in place from
"Requesting…" to "Paid ✓" in the same message bubble — the single most product-like moment in the
demo. Telegram Mini Apps let the PWA run inside the chat, so one UI serves both surfaces. The
webhook is genuinely authenticated (`X-Telegram-Bot-Api-Secret-Token`), unlike the MoMo callback.

**Harder:** Telegram's South African penetration is far below WhatsApp's, so this is not the
production channel. We must say that clearly rather than let a judge assume we did not know.

**The mitigation is architectural, and it is the honest answer to the obvious question:**
the intent layer (`docs/01` §8) is channel-agnostic — Telegram, PWA and USSD are three renderers
over one core. When asked *"why not WhatsApp?"* the answer is *"approval timeline; the channel is a
renderer, here is the intent layer, WhatsApp is a new renderer and not a rewrite"* — which turns a
weakness into evidence that the architecture was thought through.
