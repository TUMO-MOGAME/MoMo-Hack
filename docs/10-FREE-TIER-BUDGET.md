# 10 — Free Tier Budget

**Hard constraint: total spend is R0.** No service requiring a credit card, a trial, or a paid plan.
All limits verified 2026-09-02; sources at the bottom.

> **Before adding any dependency or hosted service, check it against this document.**
> If it needs a card, it does not go in. Find the free path or drop the feature.

---

## 1. The stack, and what each tier actually gives us

### GitHub — Free, **public** repo (ADR-0005)

| Resource | Free (public) | Free (private) | Our usage |
|---|---|---|---|
| Branch protection / rulesets | **yes** | **no** | Required |
| Actions minutes | **unlimited** | 2,000/mo | ~350/day → ~9,000/mo |
| CodeQL | yes | no | Weekly |
| Dependabot | yes | yes | Weekly |
| Storage (artifacts) | 500MB | 500MB | Playwright traces only on failure |

**This is the decisive constraint of the whole project.** On a private free repo we would get
neither branch protection nor enough Actions minutes — the scheduler alone (~4,300 min/mo) would
exceed the 2,000 allowance in the second week. Public makes both free and unlimited.

Guardrails anyway, because unlimited is not a reason to be wasteful:
- `concurrency: cancel-in-progress` on CI
- Playwright artifacts uploaded only on failure, 3-day retention
- The scheduler job kept to a `curl` loop — seconds, not minutes

### Vercel — Hobby

| Resource | Limit | Our usage | Headroom |
|---|---|---|---|
| Bandwidth | 100GB/mo | < 2GB | ample |
| **Function duration** | **10s** | designed for < 3s | **binding — shapes the architecture** |
| **Cron jobs** | **2, once per day** | **0 — unusable** | replaced by GitHub Actions (ADR-0006) |
| Deployments | ~100/day | ~15/day | ample |
| Team members | 1 | 1 | at limit |
| Commercial use | not permitted | hackathon demo | acceptable |

The 10s timeout is the single most architecture-shaping limit in the project. It forces
persist-then-fire-then-return with out-of-band resolution — which is the correct design for a
payments system regardless of hosting (`docs/01` §6).

### Supabase — Free

| Resource | Limit | Our usage | Headroom |
|---|---|---|---|
| **Active projects** | **2** | staging + prod | **at limit — no room for a third** |
| Database | 500MB | < 50MB | ample |
| **Storage** | **1GB** | proof photos | **the one we can actually exhaust** |
| Egress | 5GB/mo | < 1GB | ample |
| MAU | 50,000 | < 50 | ample |
| Edge function invocations | 500,000/mo | 0 (we use Next.js routes) | unused |
| **Inactivity pause** | **7 days** | **mitigated by keep-alive** | **project-ending if it slips** |

Two consequences we design around:
1. **Exactly two projects** means no separate CI database. CI uses `supabase start` locally in the
   runner (Docker), which is faster and free anyway.
2. **Storage is the real cap.** Uncompressed phone photos are 3-5MB; 1GB is ~250 of them. Compressed
   client-side to 1280px / 200KB, it is ~5,000. Compression is therefore **mandatory**, not an
   optimisation, and `demo:reset` purges the bucket.

### Row sizing sanity check

A `ledger_entry` is roughly 80 bytes. A fare produces 5 rows (1 journal + 4 postings).
500MB ≈ 6 million rows ≈ 1.2 million fares. The demo world is ~200 transactions. Not a concern.

### MTN MoMo — Sandbox

Free, no card. Three product subscriptions, each with its own key. No published rate limits.
Reliability, not cost, is the risk here (R1).

### Telegram Bot API

Free, unlimited. ~30 messages/second global limit, ~20/minute per group — well beyond anything the
demo does. No approval process, which is why it replaces WhatsApp (ADR-0007).

### Africa's Talking — Sandbox

Free USSD simulator. Not a dependency: our own simulator drives the same handler (`docs/11` §7).

### Groq — Free (the agent LLM)

30 requests/minute, 14,400 requests/day, no credit card, no credits system, no per-token charge.
Open-source models only. Sub-200ms time-to-first-token, which is what keeps a chat turn inside
Vercel's 10s budget. Does not train on API data. Gemini Flash (also free, also no card) is the
automatic fallback when Groq rate-limits. See ADR-0012.

**The one to watch:** 30 RPM is org-wide. Fine for a demo and development; it would not survive real
traffic.

### ElevenLabs — Free (voice) · **the only tier with a real catch**

| Resource | Free tier |
|---|---|
| Credits | 10,000/month (~20,000 characters TTS, **or ~15 minutes** of conversational agent) |
| Commercial rights | **none** |
| Watermark / attribution | required |
| Overage | not available — usage simply stops |

Three demo rehearsals would consume the entire monthly allowance. **This is why the phrase bank
exists** (`docs/12` §3): ~180 fragments and number clips are generated **once** (~7,200 characters,
well inside one month), cached in Supabase Storage, and replayed forever at **zero** marginal cost.
Live TTS is capped at 500 characters/day and degrades to the phrase bank, then to text.

**Honest position:** free-tier use is appropriate for a hackathon prototype, and we credit
ElevenLabs in the UI and the deck. A commercial deployment would require the **$6/month Starter**
plan. That is the single highest-value paid upgrade in this project — see §4.

### Language coverage caveat

ElevenLabs supports **no South African language** (ADR-0011), so v1 speaks **English only**. Lelapa AI
does, but has **no free tier** ($9.99/mo). Every other language is still understood and answered in **text** —
that runs on the LLM and costs nothing. Human recordings for isiZulu et al. are deferred to COULD.

### CopilotKit — MIT, self-hosted

The runtime runs inside our own Next.js app. No CopilotKit Cloud account, no per-seat cost.

### OCR — `tesseract.js`

**Deliberately not Google Cloud Vision or AWS Rekognition.** Both need a billing account with a card
even inside the free tier. `tesseract.js` runs in the browser, costs nothing, needs no account, and
keeps licence-disc images off our storage entirely. Lower accuracy, accepted — it is a COULD item (C2).

---

## 2. Every service, and the verdict

| Service | Plan | Card needed | Verdict |
|---|---|---|---|
| Groq (agent LLM) | Free | no | ✅ |
| Google Gemini (fallback LLM) | Free | no | ✅ |
| ElevenLabs (voice, English only) | Free | no | ⚠️ no commercial rights; phrase bank keeps us inside it |
| CopilotKit | MIT, self-hosted | no | ✅ |
| Web Speech API (STT + fallback TTS) | browser built-in | no | ✅ |
| Lelapa AI MoMo Kasivula (SA languages) | **no free tier**, $9.99/mo | yes | ❌ documented paid exit |
| GitHub | Free, public | no | ✅ |
| GitHub Actions | Free (unlimited, public) | no | ✅ |
| Vercel | Hobby | no | ✅ |
| Supabase | Free | no | ✅ |
| MTN MoMo | Sandbox | no | ✅ |
| Telegram Bot API | Free | no | ✅ |
| Africa's Talking | Sandbox | no | ✅ |
| tesseract.js | OSS | no | ✅ |
| Vitest / Playwright / k6 / fast-check / MSW / gitleaks | OSS | no | ✅ |
| Google Cloud Vision | Free tier | **yes** | ❌ rejected |
| AWS Rekognition | Free tier | **yes** | ❌ rejected |
| WhatsApp Business Cloud | Free tier | approval + business verification | ❌ rejected (ADR-0007) |
| Sentry / Datadog / LogRocket | Free tier | limited, upsell pressure | ❌ not needed |
| Twilio / any SMS | — | **yes, per message** | ❌ rejected |
| Upstash / hosted Redis | Free tier | no | ❌ not needed |
| Resend / any email | Free tier | no | ❌ not needed |

---

## 3. What breaks first, and what we do

In the order they would realistically bite:

| # | Limit | Early warning | Action |
|---|---|---|---|
| 1 | Supabase **storage** 1GB | Bucket > 700MB | Purge old proofs; tighten compression to 800px |
| 2 | Supabase **7-day pause** | Any 5xx from Supabase | Keep-alive is the fix; `supabase projects resume` is the recovery |
| 3 | Vercel **10s function** | Timeouts in the logs | Move work to the scheduler; never lengthen the request |
| 4 | Supabase **500MB DB** | DB > 350MB | Prune `momo_transaction.request_body` older than 7 days |
| 5 | GitHub artifact storage | > 400MB | Reduce retention to 1 day |

**A weekly Monday check** of all five, logged in `STATUS.md`. Five minutes; prevents a project-ending
surprise in week four.

---

## 4. What we would buy first, if we could

Useful to state, because a judge may ask what it takes to run this for real:

1. **ElevenLabs Starter ($6/mo)** — commercial rights, no watermark, 30,000 credits. Cheapest
   upgrade with the largest effect; removes the only licensing compromise in the stack.
2. **Supabase Pro ($25/mo)** — no pausing, daily backups, 8GB DB. The pause risk alone justifies it.
3. **Vercel Pro ($20/mo)** — 60s functions and per-minute crons; the scheduler collapses back into
   the platform and the architecture simplifies.
4. **Lelapa AI MoMo Kasivula ($9.99/mo)** — real isiZulu, Sesotho and Afrikaans speech, from a South
   African company. The right answer for the language goal, and a good story in itself.
5. **GitHub Team ($4/user/mo)** — branch protection on a private repo, if the code had to stay closed.

Total ≈ **$65/month** to remove every compromise in this document. Worth saying out loud: none of
the free-tier workarounds are load-bearing on the *product*; they are load-bearing on the *budget*,
and each has a clean paid exit.

---

## 5. Sources

- [GitHub Docs — available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) (rulesets: public repos on Free; private requires Pro/Team)
- [Vercel — Limits](https://vercel.com/docs/limits)
- [Vercel — Managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) (Hobby: once per day)
- [Supabase free tier limits 2026 — Costbench](https://costbench.com/software/database-as-service/supabase/free-plan/)
- [Supabase free tier: hidden pauses and caps](https://www.itpathsolutions.com/supabase-free-tier-limits)
