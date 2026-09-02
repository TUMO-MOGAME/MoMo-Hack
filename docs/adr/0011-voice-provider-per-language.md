# ADR-0011 — Provider-per-language voice with a pre-generated phrase bank

- Status: Accepted
- Date: 2026-09-02

## Context

The product should feel like talking to a friend, in the user's own language, starting with South
Africa and expanding across Africa. ElevenLabs was requested as the voice provider.

Verified against ElevenLabs' language documentation on 2026-09-02:

- **Eleven v3** (74 languages) includes **Swahili, Hausa, Lingala, Somali**.
- **No ElevenLabs model supports isiZulu, isiXhosa, Afrikaans, Sesotho, Setswana, Xitsonga,
  siSwati, Tshivenda, isiNdebele or Sepedi.**

Separately, the ElevenLabs free tier is 10,000 credits/month (~15 minutes of conversational agent
time), carries no commercial rights, and watermarks output. Three demo rehearsals would exhaust it.

Lelapa AI's **Vulavula** — a South African company — does support isiZulu, Afrikaans, Sesotho and
English, but has **no free tier** ($9.99/month minimum).

## Options

**A. ElevenLabs for everything.** Would mean synthesising isiZulu with an English-phonetics model.
To an isiZulu speaker that sounds worse than not trying, in a product whose entire thesis is *built
for Africans*. Rejected on quality and on principle.

**B. English only.** Safe, and abandons the language goal entirely.

**C. Pay for Lelapa AI Vulavula.** The right long-term partner, and it breaks the R0 constraint.

**D. Provider-per-language, with a pre-generated phrase bank.**

## Decision

**D.** A `speak(phrase, slots, lang)` interface with the provider selected per language:

| Tier | Languages | Provider |
|---|---|---|
| 1 | English, Swahili, Hausa, Lingala, Somali | ElevenLabs |
| 2 | isiZulu, isiXhosa, Sesotho, Afrikaans | Human-recorded phrase bank |
| 3 | remaining SA official languages | Web Speech API on-device, else text |

**Understanding is universal** — the LLM handles input and text replies in every South African
language, including code-switching. Only *spoken output* is tiered.

Voice output is assembled from **pre-generated fragments plus number clips**, cached in Supabase
Storage. Live TTS is reserved for genuinely novel replies, capped at 500 characters/day.

## Consequences

**Easier:** ongoing voice cost is **R0** — clips are generated once and replayed forever. Cached
clips start in ~50ms versus 400-800ms for live TTS, so the free path is also the fastest one. Human
recordings give perfect isiZulu pronunciation, which no TTS currently can. Adding a language, or
swapping a provider when ElevenLabs adds isiZulu, is a config change.

**Harder:** every spoken sentence must be expressible as templated fragments, which constrains how
freely the agent can speak aloud. Accepted — it also keeps the voice consistent and on-brand.
Someone has to record ~60 phrases per Tier 2 language.

**The honest pitch line, which is stronger than pretending:** *"ElevenLabs does not yet support South
African languages. We found that, and built a provider-per-language voice layer around it. Today
isiZulu is a human voice; the day ElevenLabs or Lelapa AI covers it, it is a config change."*

---

## Amendment — 2026-09-02 (same day, before implementation)

**ElevenLabs is English only for v1.** Decided by Tumo.

The decision above is unchanged: voice remains provider-per-language, assembled from a
pre-generated phrase bank. What narrows is the initial roster.

| | Before | After |
|---|---|---|
| ElevenLabs | en, sw, ha, ln, so | **en only** |
| Human recordings (zu, xh, st, af) | SHOULD, Tier 2 | **COULD, deferred** |
| Web Speech API | Tier 3 fallback | **Tier 2** — any language the device has |
| Understand + reply in text | all SA languages | **unchanged, all SA languages** |

**Why this is a good trade.** The multilingual claim never depended on ElevenLabs. Understanding and
text replies in isiZulu, isiXhosa, Sepedi and the rest run on the LLM at zero marginal cost, and
that is the part a South African panel actually cares about. Voice was carrying reputational risk
(mangled pronunciation) and a scheduling dependency (finding native speakers in week three) for a
capability that was never the differentiator.

Narrowing to English makes voice **purely additive polish** rather than load-bearing on the language
story. It also halves the phrase-bank work and removes a people-dependency from the critical path.

**The constraint this creates:** we must not claim spoken isiZulu in the deck, the demo or the
README. We claim *understanding*, which is real. The roadmap wording is in `docs/12` §2.

Superseding this amendment requires a new ADR, per `docs/06` §10.
