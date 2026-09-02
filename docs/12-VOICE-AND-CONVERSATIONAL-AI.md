# 12 — Voice and Conversational AI

The product should feel like **talking to a friend who happens to run your money** — not like
operating a banking app. This document covers the voice layer, the agent, and the language strategy.

---

## 1. The finding that shapes everything here

**ElevenLabs does not support any South African indigenous language.**

Verified 2026-09-02 against ElevenLabs' own language documentation:

| Model | Languages | African languages included |
|---|---|---|
| Eleven v3 | 74 | **Swahili, Hausa, Lingala, Somali** |
| Multilingual v2 | 29 | none |
| Flash v2.5 | 32 | none |
| Flash v2 | English only | none |

**Not supported by any model:** isiZulu, isiXhosa, Afrikaans, Sesotho, Setswana, Xitsonga,
siSwati, Tshivenda, isiNdebele, Sepedi — nor Yoruba, Igbo or Amharic.

That is a direct conflict with "start with all the South African languages". Feeding isiZulu text to
an English or multilingual model produces English phonetics applied to Zulu orthography, which to an
actual isiZulu speaker sounds worse than not trying. For a product whose entire thesis is *built for
Africans*, shipping mangled isiZulu is a bigger risk than shipping English.

**So we do not pretend.** We build a **provider-per-language** architecture, and we are explicit
about which languages have which quality of voice today.

### The alternatives, and what they cost

| Option | SA languages | Free? | Verdict |
|---|---|---|---|
| **ElevenLabs** | none | 10k credits/mo, no commercial rights, watermarked | ✅ **English only for v1** (decision, 2026-09-02) |
| **Lelapa AI (MoMo Kasivula)** — a South African company | isiZulu, Afrikaans, Sesotho, English | **no free tier**, $9.99/mo Dev Pass | ⏸ ideal partner, costs money |
| **Browser Web Speech API** | device-dependent (`af-ZA`, `zu-ZA` on many Android builds) | **free, on-device, offline** | ✅ fallback, zero cost, zero data |
| **Human-recorded phrase bank** | any, perfectly | **free** (a person and a microphone) | ⏸ deferred, see §2 |

---

## 2. The language strategy

**Scope decision, 2026-09-02: ElevenLabs is English only for v1.**
The provider-per-language architecture stays — that is what makes the roadmap credible and what
makes adding a language a config change. What narrows is the *initial roster*.

```
                        ┌──────────────────────────────────────┐
                        │  User speaks or types, any language  │
                        └──────────────────┬───────────────────┘
                                           v
                        ┌──────────────────────────────────────┐
                        │  UNDERSTAND   ← UNCHANGED, ALL LANGS │
                        │  LLM handles isiZulu, isiXhosa,      │
                        │  Sepedi, Afrikaans, code-switching   │
                        │  ("ngifuna ukukhokha my electricity") │
                        └──────────────────┬───────────────────┘
                                           v
                        ┌──────────────────────────────────────┐
                        │  RESPOND      ← UNCHANGED, ALL LANGS │
                        │  text, in the user's own language    │
                        └──────────────────┬───────────────────┘
                                           v
                        ┌──────────────────────────────────────┐
                        │  SPEAK        ← NARROWED FOR v1      │
                        └──────────────────────────────────────┘
                                    │                  │
                  ┌─────────────────┘                  └──────────────────┐
                  v                                                       v
       ┌────────────────────────┐                          ┌──────────────────────┐
       │  ElevenLabs — ENGLISH  │                          │  Web Speech API      │
       │  phrase bank + capped  │                          │  device fallback,    │
       │  live TTS              │                          │  any language it has │
       └────────────────────────┘                          └──────────────────────┘
```

**This is the important part: the multilingual claim does not weaken.** A user still talks to MoMo Kasi
in isiZulu and still gets an isiZulu reply — in text. Only the *spoken* reply is English in v1.
The LLM handles every South African language at **zero marginal cost**, so the thing that actually
differentiates us for a South African panel is fully intact.

### Tier 1 — synthetic voice (ElevenLabs)
**English only**, South African-accented voice.

### Tier 2 — on-device voice (Web Speech API)
Any language the user's phone can speak, including `af-ZA` and `zu-ZA` on many Android builds.
Free, offline, no API. Quality varies by device, so it is a bonus rather than a promise.

### Tier 3 — text
Every other language. Always available, always in the user's own language.

### Deferred, not cancelled
- **Human recordings** for isiZulu, isiXhosa, Sesotho, Afrikaans (was Tier 2). Still the best
  quality available to us at zero cost, and still the right thing to do. Moved to COULD — it needs
  a native speaker and a microphone, which is a scheduling dependency we do not want in week three.
  If the schedule allows, isiZulu alone is worth recording: it is the demo language.
- **Swahili, Hausa, Lingala, Somali** via ElevenLabs. These were the honest evidence for the
  pan-African claim. Now roadmap rather than demoed — see the wording below.

### The roadmap line (adjusted for English-only v1)
*"MoMo Kasi understands and replies in every South African language today — that runs on the LLM and
costs nothing. Spoken voice is English in v1 because ElevenLabs does not yet support any South
African language; we verified that. The voice layer is provider-per-language, so isiZulu speech is a
config change the day ElevenLabs adds it, or the day we can fund Lelapa AI's MoMo Kasivula — a South
African company that already does isiZulu, Sesotho and Afrikaans."*

That still reads as research and engineering judgement rather than a gap. **Do not claim spoken
isiZulu in the deck or the demo.** Claim understanding, which is real and demonstrable.

That is a stronger pitch beat than pretending the problem does not exist. It shows we researched the
market, found a real gap, and engineered for it.

---

## 3. Making ElevenLabs free: the phrase bank

ElevenLabs Free gives **10,000 credits/month ≈ 20,000 characters ≈ ~15 minutes of conversational
agent time**, with no commercial rights and an attribution requirement. Three demo rehearsals would
consume the entire monthly allowance.

**The insight: almost nothing we say is unique.** Our voice output is a small set of templates with
variable numbers.

```
"You have been paid R{amount} for {job}."
"Your stokvel contribution of R{amount} is due tomorrow."
"R{amount} is secured in escrow. You can start work."
"Your fare of R{amount} was split: R{a} to the owner, R{b} to the driver."
```

So we **pre-generate once and cache forever**:

```
1. Extract every phrase template from the codebase.        (~60 phrases)
2. Split each into fixed fragments and {slots}.
3. Generate audio for every fixed fragment.                (~60 clips)
4. Generate audio for numbers 0-99, "hundred", "thousand",
   "rand", "cents", and the 12 month names.                (~120 clips)
5. Store as MP3 in Supabase Storage, keyed by hash.
6. At runtime, concatenate fragments client-side.          (zero API calls)
```

**Cost after the first generation run: R0, forever.**
English only, so this is a single pass: ~180 clips at ~40 characters ≈ **7,200 characters, about 36%
of one month's free allowance**, spent once. That leaves comfortable headroom for regeneration when
phrasing changes, and for the capped live TTS below. Regeneration is gated behind
`npm run voice:build` — never in CI, never at runtime.

```ts
// src/lib/voice/phrase-bank.ts
export async function speak(template: PhraseKey, slots: Record<string, string>, lang: Lang) {
  const fragments = resolveFragments(template, slots, lang);   // ['paid_prefix','R','45','rand']
  const urls = fragments.map(f => clipUrl(f, lang));           // all pre-generated, cached
  return playSequence(urls);                                    // no network call to ElevenLabs
}
```

**Live TTS is used for exactly one thing:** the free-form conversational reply when the agent says
something genuinely novel. That is metered, capped, and degrades to text when the budget is spent.

```ts
const VOICE_BUDGET_CHARS_PER_DAY = 500;   // ~15k/month, inside the free tier
// on exhaustion: fall back to the phrase bank, then to text. Never fail, never bill.
```

### The commercial-rights problem, stated plainly
The ElevenLabs free tier grants **no commercial usage rights** and requires attribution. This is a
hackathon prototype, not a commercial deployment, so free-tier use is appropriate — and we credit
ElevenLabs in the UI and the deck. **If this were ever to ship commercially, the $6/month Starter
plan is required.** That is documented in `docs/10-FREE-TIER-BUDGET.md` §4 as a known paid exit.

> **Recommendation:** if R110/month (~$6) is ever acceptable, ElevenLabs Starter is the single
> highest-value paid upgrade in this project — it removes the watermark, grants commercial rights,
> and triples the credits. It is not required for the build or the demo.

---

## 4. The agent: talking to a friend

### 4.1 Which LLM

| Option | Free? | Card? | Verdict |
|---|---|---|---|
| **Google Gemini Flash** | 10-30 RPM, 250-1,000 req/day | **no card** | ✅ **chosen — key in hand** |
| Groq | 30 RPM, 14,400 req/day, no per-token charge | no card | ✅ fallback on rate-limit |
| Claude / OpenAI | paid from the first call | yes | ❌ |

**Gemini Flash is primary** — Tumo has a key, and a key that exists beats one that does not. Free,
no credit card, and comfortably inside Vercel's 10s budget. **Groq is the automatic fallback** on
rate-limit: also free, also card-free, and roughly seven times faster to first token.

Two consequences we carry deliberately (ADR-0012 amendment):

- **Latency.** ~1.5s to first token against Groq's ~200ms. Fine for text; noticeable in voice. The
  phrase bank hides it — the most common replies play from cache in ~50ms and never reach the model.
- **Data handling.** Google's free tier may use submitted data to improve its products. This makes
  the POPIA prompt scrubber (`docs/14` §7) **load-bearing, not belt-and-braces**: no MSISDN, no name,
  no identifier may leave in a prompt, and the test asserting that ships with the agent route.

### 4.2 Persona

Not a bank. A knowledgeable friend at the rank who happens to be good with money.

```
You are MoMo Kasi — a warm, brief, practical money assistant for South Africans.

VOICE
- Speak like a friend, not a bank. Short sentences. No corporate hedging.
- Match the user's language and register, including code-switching. If they mix
  isiZulu and English, you mix isiZulu and English.
- Use the greeting that fits: "Sawubona", "Molo", "Dumela", "Howzit".
- Never say "I am an AI language model". You are MoMo Kasi.
- Celebrate small wins. Getting paid R60 matters.

MONEY — NON-NEGOTIABLE
- You NEVER move money, and you NEVER claim to have moved, sent, prepared,
  set up, scheduled or queued a payment. Saying you did is the same failure as
  doing it: the user believes money is on its way when nothing happened.
- You NEVER tell someone to confirm, approve or check a payment. Nothing you
  say puts a confirmation on anyone's screen.
- You NEVER state a balance or an amount you did not read from a tool call.
  If you do not have the number, say so and offer to fetch it.
- You NEVER give financial, tax, legal or credit advice.
- You NEVER ask for a PIN, a password or an OTP. Say so if a user offers one.

WHEN YOU ARE UNSURE
Say you are unsure and offer the nearest thing you can do.
```

### 4.3 Tools the agent can call

Read-only tools return real data from the ledger. Write tools **only ever return a proposal** that
the user must confirm in the UI.

| Tool | Type | Returns |
|---|---|---|
| `get_balance` | read | Wallet, escrow, locked sub-wallets |
| `get_transactions` | read | Recent, filterable |
| `explain_split` | read | The exact bps breakdown of a specific fare |
| `get_stokvel_status` | read | Pool, members, who is next, what is due |
| `get_jobs` | read | Open jobs near the user; the user's own jobs |
| `get_trust_score` | read | Score and what would raise it |
| `propose_payment` | **propose** | A confirmation card. **No money moves.** |
| `propose_stokvel_join` | **propose** | A confirmation card |
| `propose_job_accept` | **propose** | A confirmation card |
| `render_artifact` | UI | A canvas spec (`docs/13`) |

> **The hard rule: the agent cannot move money.** Every value-moving action is a *proposal* that
> renders a confirmation card the user must physically tap, with the amount and recipient shown in
> plain text. An LLM hallucination can therefore, at absolute worst, show a wrong card — which the
> user declines. This is the answer to the question a judge will certainly ask, and it is enforced
> structurally: `propose_*` tools have no database write access at all.

### 4.4 Latency budget

Voice conversation dies above ~1.2s of perceived silence.

| Stage | Budget | How |
|---|---|---|
| Speech to text | 400ms | Web Speech API on-device, streaming, free |
| Agent turn | 500-1500ms | Gemini Flash, streaming; Groq fallback is ~200ms TTFT |
| First audio out | 300ms | Phrase bank clips are pre-generated — instant |
| **Total to first sound** | **~1.2s cached / ~2.2s live** | The phrase bank is what keeps the common path fast |

The phrase bank is not only a cost decision. **A cached clip starts playing in ~50ms**, where live
TTS takes 400-800ms. For the most common replies, the free approach is also the fastest one.

---

## 5. Speech input

**Web Speech API (`SpeechRecognition`), on-device, free, no API key.** Chrome on Android supports
`en-ZA`, `af-ZA` and `zu-ZA` on many builds; we detect and degrade gracefully.

ElevenLabs Scribe is available as a paid upgrade path for accurate multilingual transcription, and
Lelapa AI's MoMo Kasivula is the right choice specifically for South African code-switched speech. Both
are documented as paid exits, neither is a dependency.

Every voice interaction has a text equivalent. **Voice is never the only way to do anything** —
ranks are loud, some users are deaf, and a demo room can be noisy.

---

## 6. Privacy

Voice in a financial app is sensitive, and a judge may ask.

- Speech-to-text runs **on the device**. Raw audio never reaches our servers.
- Only the resulting text reaches the agent, and only for the current turn.
- No audio is stored. Ever.
- Conversation history is per-session and not used for training (Groq does not train on API data).
- The agent's tool calls are logged with a correlation id for debugging; **message content is not**.
- A visible, always-available "type instead" toggle.

---

## 7. Build sequence

Voice is **SHOULD**, not MUST. It is added after the money engine works, and it is on the cut list.

| Item | Day | Depends on |
|---|---|---|
| V1 Agent + tools + persona, **multilingual text** | 17-18 | Ledger, read repositories |
| V2 Generative UI artifacts (`docs/13`) | 18-19 | V1 |
| V3 Phrase bank build script + storage, **English** | 19 | V1 |
| V4 Speech input (Web Speech API) | 20 | V1 |
| V5 ElevenLabs live TTS with budget cap, **English** | 21 | V3 |
| ~~V6~~ Human recordings for SA languages | **COULD** | V3 — deferred 2026-09-02 |

**Cut order if behind:** V5, then V4. V1 and V2 stay — a multilingual text agent that renders live
dashboards is most of the value, and it works without any voice at all.

Note the ordering consequence of English-only: **V1 already delivers the multilingual story**, since
understanding and text replies need no voice provider. Voice is now purely additive polish rather
than the thing carrying the language claim. That is a lower-risk shape than we had before.

---

## 8. Sources

- [ElevenLabs — what languages do you support](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support)
- [ElevenLabs — models](https://elevenlabs.io/docs/overview/models)
- [ElevenLabs pricing 2026 — plans, credits, commercial rights](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- [ElevenLabs pricing — per-minute agent rates](https://pxlpeak.com/blog/ai-tools/elevenlabs-pricing-guide)
- [Lelapa AI — MoMo Kasivula](https://lelapa.ai/products/vulavula/) · [pricing](https://lelapa.ai/pricing)
- [MoMo Kasivula brings AI speech and text powers to South African languages](https://www.trendwatching.com/innovation-of-the-day/vulavula-brings-ai-speech-and-text-powers-to-south-african-languages)
- [Groq free tier limits 2026](https://tokenmix.ai/blog/groq-free-tier-limits-2026)
- [Gemini API free tier 2026 — no card](https://tokenmix.ai/blog/gemini-api-free-tier-limits)
