# 11 — API Usage Map

Every external API call this system makes or receives, what triggers it, and what it changes.

> API *facts* (paths, headers, schemas) live in [`momoAPIs.md`](../momoAPIs.md).
> This document is the *usage* register: who calls what, when, and why.
> **Rule: no code may call an external API that is not listed here.** Adding a call means adding a
> row here in the same PR.

---

## 1. Inventory

| # | API | Provider | Direction | Auth | Cost | Used for |
|---|---|---|---|---|---|---|
| A1 | MoMo **Collections** | MTN | outbound | Bearer + subscription key | Free (sandbox) | Taking money in |
| A2 | MoMo **Disbursements** | MTN | outbound | Bearer + subscription key | Free (sandbox) | Paying money out |
| A3 | MoMo **Remittances** | MTN | outbound | Bearer + subscription key | Free (sandbox) | Diaspora funding |
| A4 | MoMo **callbacks** | MTN | **inbound** | none (untrusted, see `docs/03` §3.1) | Free | Fast resolution hint |
| A5 | **Telegram Bot API** | Telegram | outbound | bot token | Free, unlimited | Messages, keyboards, Mini App |
| A6 | **Telegram webhook** | Telegram | **inbound** | `X-Telegram-Bot-Api-Secret-Token` | Free | User input |
| A7 | **Africa's Talking USSD** | AT | **inbound** | shared secret + IP allowlist | Free (sandbox) | Feature-phone input |
| A8 | **Supabase** (Postgres, Auth, Storage, Realtime) | Supabase | outbound | anon key / service-role key | Free tier | Everything persistent |
| A9 | **GitHub Actions → our cron routes** | us | **inbound** | `CRON_SECRET` bearer | Free | Scheduling |
| A10 | **Groq** (agent LLM) | Groq | outbound | API key | Free, no card | The conversational agent |
| A11 | **Google Gemini Flash** (fallback LLM) | Google | outbound | API key | Free, no card | Used only when Groq rate-limits |
| A12 | **ElevenLabs TTS** | ElevenLabs | outbound | API key | Free tier | Phrase-bank generation (build time) + capped live TTS |
| A13 | **Web Speech API** | browser | on-device | none | Free | Speech input; TTS fallback |

Not used, and why — so nobody adds them later without a decision:

| Rejected | Why |
|---|---|
| Claude / OpenAI APIs | Paid from the first call, card required. Groq and Gemini Flash are free with no card (ADR-0012). |
| Lelapa AI Vulavula | The right provider for South African language speech, but no free tier ($9.99/mo). Documented paid exit (ADR-0011). |
| ElevenLabs Scribe (STT) | Metered against the same 10k credits the phrase bank needs. Web Speech API is free and on-device. |
| CopilotKit Cloud | The runtime is self-hosted inside our Next.js app; the cloud tier adds nothing we need. |
| A2A / multi-agent orchestration | Each agent hop consumes part of Vercel's 10s budget, and it violates ADR-0001. |
| Google Cloud Vision / AWS Rekognition (OCR) | Requires a billing account with a card. Replaced by `tesseract.js`, client-side, zero cost, zero account (C2). |
| WhatsApp Business Cloud API | Meta approval and a business verification we cannot complete in 25 days. Replaced by Telegram (ADR-0007). |
| Any SMS gateway | All cost money per message. Telegram + USSD cover the channel need. |
| Sentry / Datadog / LogRocket | Paid beyond trivial volume. Vercel logs + our own `momo_transaction` audit trail cover it. |
| A hosted Redis | Not needed. Token cache is per-instance; locking is done by Postgres guarded updates. |

---

## 2. MoMo Collections (A1) — money in

Base: `POST /collection/v1_0/requesttopay`, `GET /collection/v1_0/requesttopay/{id}`

| Feature | Trigger | Payer | Amount | `purpose` | On SUCCESSFUL, the ledger does |
|---|---|---|---|---|---|
| **Taxi fare** | Commuter scans the vehicle QR | Commuter | Route fare | `FARE` | `MOMO_SETTLEMENT +A`, then split 6000/2500/1000/500 bps across `USER_WALLET`(owner), `DRIVER_FLOAT`, `FUEL_POOL`, `INSURANCE_POOL` |
| **Escrow funding** | Client confirms hiring a worker | Client | Job price | `ESCROW_FUND` | `MOMO_SETTLEMENT +A`, `ESCROW_HOLD(job) -A`; job → `FUNDED` |
| **Stokvel contribution** | Scheduler, on the group's cadence | Each member | `stokvel.contribution_minor` | `STOKVEL_CONTRIB` | `MOMO_SETTLEMENT +A`, `STOKVEL_POOL(group) -A` |
| **Prepaid electricity** | User buys a token | User | User-chosen | `ELECTRICITY` | `MOMO_SETTLEMENT +A`, `PLATFORM_FEE -fee`, `SUSPENSE -(A-fee)` until the token is issued, then cleared |
| **School fees** | User pays a school | User | Invoice amount | `SCHOOL_FEES` | as above, against the school's account |
| **Airtime / data** | User tops up | User | User-chosen | `AIRTIME` | as above |
| **Split-a-bill** | Each participant taps their share of a group link | Each participant | Their share | `SPLIT_BILL` | `MOMO_SETTLEMENT +A`, `SUSPENSE(bill) -A`; the bill settles when fully funded |
| **Rank maintenance float** | Rank admin tops up the youth-work pool | Rank admin | Admin-chosen | `RANK_FLOAT` | `MOMO_SETTLEMENT +A`, `ESCROW_HOLD(rank) -A` |

**Concurrency note:** the taxi fare is the only collection that can arrive in bursts (a full kombi
paying at once). It is the flow the load test hammers (`docs/04` §8).

---

## 3. MoMo Disbursements (A2) — money out

Base: `POST /disbursement/v1_0/transfer`, `GET /disbursement/v1_0/transfer/{id}`

| Feature | Trigger | Payee | Amount | `purpose` | Ledger |
|---|---|---|---|---|---|
| **Escrow release** | Client approves the proof, or auto-approve at 48h | Worker | Job price − fee | `ESCROW_RELEASE` | `ESCROW_HOLD(job) +A`, `PLATFORM_FEE -fee`, `MOMO_SETTLEMENT -(A-fee)`; job → `RELEASED`, trust score increments |
| **Escrow refund** | Worker misses the deadline, or the client cancels before acceptance | Client | Job price | `ESCROW_REFUND` | `ESCROW_HOLD(job) +A`, `MOMO_SETTLEMENT -A`; job → `CANCELLED` |
| **Owner payout** | Daily sweep of `USER_WALLET`(owner) above a threshold | Taxi owner | Accrued balance | `OWNER_PAYOUT` | `USER_WALLET +A`, `MOMO_SETTLEMENT -A` |
| **Driver wage** | End-of-shift settlement | Driver | `DRIVER_FLOAT` balance | `DRIVER_WAGE` | `DRIVER_FLOAT +A`, `MOMO_SETTLEMENT -A` |
| **Stokvel rotating payout** | Scheduler, when a cycle completes | Member at `payout_position` | Full pool | `STOKVEL_PAYOUT` | `STOKVEL_POOL +A`, `MOMO_SETTLEMENT -A`; position advances |
| **Rank gig payout** | Rank admin approves a wash/marshal task | Youth worker | Task rate | `RANK_GIG_PAYOUT` | `ESCROW_HOLD(rank) +A`, `MOMO_SETTLEMENT -A` |
| **Bulk payroll** (C4) | Rank admin pays N workers at once | N workers | Per worker | `BULK_PAYOUT` | One journal per worker; all created in one DB transaction, dispatched individually |
| **Insurance claim** (C1) | Approved claim | Claimant | Claim amount | `INSURANCE_CLAIM` | `INSURANCE_POOL +A`, `MOMO_SETTLEMENT -A` |

**Bulk payroll is N separate MoMo calls**, each with its own reference id and its own
`momo_transaction` row. There is no batch endpoint, and pretending there is would be a lie in the
demo. What we *do* batch is the ledger: one journal, N postings, written atomically, so a partial
dispatch failure never leaves the books wrong. That distinction is worth saying out loud to judges.

---

## 4. MoMo Remittances (A3) — diaspora in

Base: `POST /remittance/v1_0/transfer`, `GET /remittance/v1_0/transfer/{id}`

| Feature | Trigger | Amount | `purpose` | Ledger |
|---|---|---|---|---|
| **Fund a family sub-wallet** | Diaspora funder sends to a purpose-locked wallet | Funder-chosen | `REMIT_IN` | `MOMO_SETTLEMENT +A`, `FAMILY_LOCKED(beneficiary, category) -A` |
| **Fund a tool lease** (S4) | Funder pays a worker's equipment lease | Lease amount | `REMIT_TOOL` | `MOMO_SETTLEMENT +A`, `FAMILY_LOCKED(worker, 'TOOLS') -A` |
| **Fund a commuter pass** | Funder pre-pays a month of fares | Pass price | `REMIT_TRANSPORT` | `MOMO_SETTLEMENT +A`, `FAMILY_LOCKED(beneficiary, 'TRANSPORT') -A` |

**The lock is a ledger fact, not a UI rule.** A `FAMILY_LOCKED` account is a different account from
the user's `USER_WALLET`, and the spend path checks the account's `subject_id` (the allowed category)
before it will debit. Sipho's R2,000 for school fees cannot buy airtime because there is no code path
that moves value from `FAMILY_LOCKED('SCHOOL_FEES')` to an airtime purchase. Enforcement by
structure, not by a boolean somebody can forget to check.

---

## 5. MoMo callbacks (A4) — inbound

`POST /api/momo/callback/[kind]` where `kind` ∈ `collection | disbursement | remittance`.

- **Treated as untrusted.** Body is used only to extract a reference id.
- We then call MoMo ourselves for the authoritative status (`docs/03` §3.1).
- Always returns `200`, whatever happens, so probes learn nothing.
- Unknown reference ids: logged, ignored, never created.
- Rate limited per IP.

The callback is a **latency optimisation**, not a correctness requirement. If MTN never calls us,
the reconciler resolves everything within 5 minutes and the system is still correct.

---

## 6. Telegram (A5, A6)

**Outbound** — `https://api.telegram.org/bot<token>/<method>`:

| Method | Used for |
|---|---|
| `setWebhook` | One-time setup, with `secret_token` |
| `sendMessage` | All notifications, drained from the outbox |
| `editMessageText` | Live-updating a payment status in place, rather than spamming the chat |
| `answerCallbackQuery` | Acknowledging inline-keyboard taps |
| `sendPhoto` / `getFile` | Gig proof photos in and out |
| `setMyCommands` | `/start /pay /earn /stokvel /balance /help` |
| `setChatMenuButton` | Opens the Mini App |

**Inbound** — `POST /api/telegram/webhook`:
- Verified via the `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`.
  A mismatch returns `401` and is logged. This one **is** authenticated, unlike the MoMo callback.
- Updates are processed idempotently by `update_id`; Telegram retries, and we must not double-handle.
- Returns `200` fast; all real work goes through the outbox.

Notification events that produce an outbox row:

| Event | Recipient | Message |
|---|---|---|
| Fare collected | Commuter, driver, owner | Amount, route, and the split breakdown |
| Escrow funded | Worker | "R450 is secured. You can start." |
| Proof submitted | Client | Photo + Approve / Dispute buttons |
| Escrow released | Worker | "R450 paid to your MoMo wallet." |
| Stokvel due tomorrow | Every member | Amount and a one-tap pay button |
| Stokvel payout | Recipient + all members | Who received it, and who is next |
| Remittance received | Beneficiary | Amount and what it is locked to |
| Low balance before a scheduled debit | User | Warning, with a top-up button |

**Why editMessageText matters:** a payment that updates in place from "Requesting…" to "Paid ✓" in
the same message bubble is the demo moment that reads as a real product rather than a webhook dump.

---

## 7. Africa's Talking USSD (A7) — inbound

`POST /api/ussd`, form-encoded: `sessionId`, `serviceCode`, `phoneNumber`, `text`.

Response protocol: body starts with `CON ` to continue the session, `END ` to terminate.

```
*120*8862#
CON Vula
1. Pay taxi fare
2. My jobs
3. Stokvel
4. Balance
```

- The USSD state machine (`src/lib/ussd/`) is **the same state machine the simulator uses**, so what
  the judges see on the fake feature phone is genuinely the production code path.
- Sessions are stateless from AT's perspective — the accumulated `text` field carries the path. We
  keep a short-lived session row for anything that needs memory.
- 160-character response limit is enforced by a lint rule on the menu strings, tested.
- If the AT sandbox is unavailable, `app/ussd-simulator` drives the same handler directly over HTTP.
  **The demo does not depend on Africa's Talking being up.**

---

## 8. Supabase (A8)

| Surface | Client | Key | Rules |
|---|---|---|---|
| Postgres reads (user data) | browser + server components | anon key | RLS enforced |
| Postgres writes (ledger, momo, outbox) | server only | service-role | Never in a client bundle |
| Auth | browser | anon | Phone OTP; Telegram login links to the same profile |
| Storage (`proof/`) | server issues signed URLs | service-role | Uploads client-side to a signed URL; images compressed before upload to protect the 1GB cap |
| Realtime | browser | anon | Subscribed to `momo_transaction` and `journal`, RLS-filtered. Powers the live console (S5) |

An ESLint rule forbids importing the service-role client from anything under `app/(app)/` or any
file marked `'use client'`. This is checked in CI, because it is the single mistake that would turn
a public repo into a public database.

---

## 9. GitHub Actions → cron routes (A9)

`POST /api/cron/{job}`, `Authorization: Bearer $CRON_SECRET`. Every route returns a JSON summary
that gets written to `system_check`, so "is the scheduler alive?" is a database query.

| Route | Cadence | Job |
|---|---|---|
| `/api/cron/reconcile` | */5 min | Poll non-terminal `momo_transaction` rows; re-send `INITIATED` older than 60s |
| `/api/cron/outbox-drain` | */5 min | Deliver pending outbox messages, exponential backoff, `DEAD` after 6 attempts |
| `/api/cron/escrow-sweep` | */5 min | Auto-approve at 48h, auto-refund past deadline, expire unfunded jobs at 15 min |
| `/api/cron/stokvel-run` | hourly | Collect due contributions, execute rotating payouts |
| `/api/cron/settlement` | daily 02:00 | Owner and driver payouts; assert `SUSPENSE` is zero and alert if not |
| `/api/health` | */5 min | Trivial query; exists to stop Supabase pausing after 7 idle days |

Every one of these is **idempotent and safe to run twice**, because GitHub's scheduler is
best-effort and may fire late, early, or twice.

---

## 9a. Agent, voice and artifacts (A10-A13)

**Groq (A10)** — `POST https://api.groq.com/openai/v1/chat/completions`, streaming, called from
`app/api/agent/route.ts` on the **Edge** runtime.

| Trigger | Detail |
|---|---|
| A user sends a chat message (typed or transcribed) | One streamed completion per turn |
| Tools available | `get_balance`, `get_transactions`, `explain_split`, `get_stokvel_status`, `get_jobs`, `get_trust_score`, `propose_payment`, `propose_stokvel_join`, `propose_job_accept`, `render_artifact`, `patch_artifact` |
| Rate limit handling | On 429, retry once against Gemini Flash (A11); on second failure, a plain apology plus a menu |

> **`propose_*` tools have no database write access** (ADR-0014). They return a server-signed
> proposal that renders a confirmation card. The agent cannot move money.

**ElevenLabs (A12)** — two distinct, deliberately separated usages:

| Usage | When | Volume | Notes |
|---|---|---|---|
| **Phrase-bank generation** | Build time, `npm run voice:build`, run manually | ~180 clips ≈ 7,200 chars, **once** | Output cached in Supabase Storage forever. **Never runs in CI or at runtime.** |
| **Live TTS** | A genuinely novel agent reply | Capped at **500 chars/day** | On exhaustion: fall back to the phrase bank, then to text. Never fails, never bills. |

Languages: English, Swahili, Hausa, Lingala, Somali only. isiZulu, isiXhosa, Sesotho and Afrikaans
use human recordings; the rest use A13 or text (ADR-0011).

**Web Speech API (A13)** — on-device, no network. `SpeechRecognition` for input,
`speechSynthesis` as the Tier 3 voice fallback. **Raw audio never leaves the device**
(`docs/12` §6).

---

## 10. Call-volume estimate

Sanity-checking that the demo fits inside every free tier. Full budget in `docs/10`.

| API | Per demo run | Per day (dev + tests) | Free limit | Headroom |
|---|---|---|---|---|
| MoMo Collections | ~15 | ~400 | none published | fine |
| MoMo Disbursements | ~10 | ~250 | none published | fine |
| MoMo Remittances | ~2 | ~30 | none published | fine |
| Telegram sendMessage | ~40 | ~800 | 30 msg/s | fine |
| Supabase requests | ~500 | ~20,000 | 5GB egress/mo | fine (rows are small) |
| Supabase storage | ~5 photos | ~100 | 1GB | compress to <200KB → ~5,000 photos |
| GitHub Actions | — | ~350 min | unlimited (public) | fine |

The only limit we can realistically hit is **Supabase storage**, via proof photos. Mitigation:
client-side compression to max 1280px / 200KB, and `demo:reset` purges the bucket.
