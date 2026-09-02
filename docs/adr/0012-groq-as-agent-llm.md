# ADR-0012 — Groq as the agent LLM

- Status: Accepted
- Date: 2026-09-02

## Context

The conversational agent needs an LLM. Constraints: zero spend, no credit card, low latency (voice
conversation dies above ~1.2s of perceived silence), and it sits adjacent to a payments flow so data
handling matters.

Also relevant: Vercel Hobby caps functions at 10 seconds, so a slow model is not merely unpleasant —
it is a failed request.

## Options

| Option | Free tier | Card? | TTFT | Trains on our data? |
|---|---|---|---|---|
| **Groq** | 30 RPM, 14,400 req/day, no per-token charge | no | ~200ms | no |
| Google Gemini Flash | 10-30 RPM, 250-1,000 req/day | no | ~1.5s | **yes, on the free tier** |
| Claude / OpenAI | none | yes | — | no |

## Decision

**Groq** as the primary, **Gemini Flash as an automatic fallback** when Groq rate-limits.

## Consequences

**Easier:** sub-200ms time-to-first-token is what makes the assistant feel alive rather than dead,
and it keeps chat turns comfortably inside the 10s Vercel budget. No credit card, no credits system,
no per-token accounting to monitor. Groq does not train on API data, which is the right posture for
anything near a payments flow — and it is a question a judge may well ask.

**Harder:** Groq serves open-source models only (Llama and similar), which are weaker at complex
reasoning than frontier models. Mitigated by the fact that our agent does not need to reason hard —
it routes intent, calls tools that return real data, and phrases a short reply. **The numbers never
come from the model** (ADR-0013), so model quality affects tone and routing, not correctness.

**Watch for:** 30 RPM is shared across the organisation. Fine for a demo and development; it would
not survive real traffic. Documented as a paid exit in `docs/10-FREE-TIER-BUDGET.md`.

**Deliberately rejected:** the multi-agent A2A architecture used by the reference project. Each
additional agent hop is another slice of a 10s budget, and it violates ADR-0001. One agent with good
tools beats three agents that time out.

---

## Amendment — 2026-09-02 (same day, before implementation)

**Gemini is primary; Groq becomes the fallback.** Decided by Tumo, who has a Gemini API key.

The decision above is unchanged in substance — free tier, no card, an automatic second provider on
rate-limit. Only the order swaps.

| | Before | After |
|---|---|---|
| Primary | Groq | **Google Gemini Flash** |
| Fallback on 429 / 5xx | Gemini Flash | **Groq** |

**Why the swap is right:** a key that exists beats a key that does not. Groq's advantages were
theoretical for this project until someone signed up; Gemini's are available today. Both remain
free and card-free, so the fallback costs nothing to keep.

**What we give up, stated plainly:**

1. **Latency.** Gemini Flash is roughly 1.5s to first token against Groq's ~200ms. That is
   comfortably inside Vercel Hobby's 10s budget for text, but it is noticeable in voice, where
   perceived silence above ~1.2s makes an assistant feel dead (`docs/12` §4.4). Mitigation: the
   phrase bank answers the common cases in ~50ms without touching the model at all, so the slower
   model is hidden behind cached audio for exactly the replies said most often.
2. **Data handling.** Google's free tier may use submitted data to improve its products; Groq does
   not train on API data. For a payments-adjacent agent this matters — and it is precisely why the
   POPIA prompt scrubber (`docs/14` §7, ADR-0015) is now **load-bearing rather than belt-and-braces**.
   No MSISDN, no name, no identifier may appear in an outbound prompt. The test asserting that is
   no longer optional.

**Consequence for the build:** the scrubber moves from a Phase 4 nicety to a Phase 3 requirement,
shipped with the agent route rather than after it.
