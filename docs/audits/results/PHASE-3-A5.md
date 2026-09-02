# PHASE-3 — A5 Security

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (no pinned sha)
**Result:** 0 Critical · 4 High · 4 Medium · 2 Low · 0 waived · 4 not measured

**Scope:** every route under `src/app/api/**`, the ledger write path, `supabase/migrations/**`,
secret handling, the agent as an untrusted-input surface, and the live response headers on
<https://momo.tumoolo.tech>. Graded on the overlay's assumption that **the repository is public and
an attacker has read every migration.**
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**The money is well defended and the perimeter is not.** Every item in the overlay's money-integrity
table holds, and holds structurally rather than by convention: `insertEntries` has exactly one
caller and a source-reading test fails the build if a second appears; `claimTransition` is a
`SELECT … FOR UPDATE` inside a CTE with `WHERE prev.status = any($2)`, so a read-then-write race
cannot be written; the `X-Reference-Id` is the persisted `momo_transaction.id`, so a retry cannot
double-pay; the split is integer-exact and property-tested over 5,000+ generated cases. The
callback route's threat model is written down and the code matches it — a forged body can only make
us ask MTN about a transaction we already own. The Telegram webhook returns `401` on a bad secret,
verified. The cron route requires a constant-time-compared bearer. Secret hygiene is clean: nothing
key-shaped in any tracked file, `.env*` ignored, and `NEXT_PUBLIC_` used only on the Supabase URL
and anon key, which are public by design.

**Against that, four High findings, all at the edge.**

There are **no security headers at all** — no CSP, no `X-Content-Type-Options`, no
`Referrer-Policy`, no `frame-ancestors`. Vercel supplies HSTS and nothing else. The overlay says in
as many words: *"No CSP is configured yet; flag it if Phase 3 closes without one."* Phase 3 is
closing without one, and a payments-shaped site that can be framed is a clickjacking target the
moment it has a confirm button — which is exactly what S7f will add.

**There is no scrubber on the outbound LLM prompt.** The overlay requires that no MSISDN or name
reach the model, "with a test". `respond()` passes the user's message to Gemini verbatim. The
logger has an excellent scrubber; the model call has none. This is not hypothetical: the transcript
that triggered `MISTAKES.md` M10 contained a real South African mobile number typed by the user,
and that number was sent to Google. Today's `unbuilt` route happens to intercept most
payment-shaped phrasings before the model is reached, which narrows the exposure but does not close
it — that route exists for honesty, not for privacy, and it will be removed when M3a lands.

**And there is no authentication.** Every RLS policy across eight tables is therefore unexercised —
correct-looking SQL that has never denied a real principal, in a repository where the attacker can
read all of it.

### Top 5 risks

1. **No CSP or security headers (A5-01, High).** Explicitly flagged by the overlay for this phase.
2. **User messages reach Gemini unscrubbed (A5-02, High).** POPIA s105/106; a real MSISDN has
   already been sent.
3. **No authentication; RLS never exercised (A5-04, High).**
4. **`/api/agent` accepts cross-origin POSTs (A5-03, High-adjacent, graded Medium).** Quota drain
   through third-party pages.
5. **`SUSPENSE` holds R30.00 at rest (A5-06, Medium)** — the overlay's own alarm condition.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A5-01 | **High** | No `next.config` `headers()`, no `vercel.json`, no `middleware.ts` | **No security headers.** Verified live on `/`, `/ledger` and `POST /api/agent`: the only security header present is `Strict-Transport-Security`, supplied by Vercel. Missing: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options` / `frame-ancestors`, `Permissions-Policy` | The overlay names CSP as the thing to flag if Phase 3 closes without it. Beyond that: without `frame-ancestors` this site can be embedded in an attacker's page, and it is about to grow a payment confirmation button (S7f) — that is textbook clickjacking. Without `nosniff` a user-influenced response can be re-typed by the browser. A payments demo with zero headers is also the first thing a security-minded judge checks | `headers()` in `next.config.ts`: `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation. Then a CSP — start report-only, because Next requires `'unsafe-inline'` for its bootstrap unless nonces are wired |
| A5-02 | **High** | `src/server/agent/respond.ts:~245` — `history` and `message` passed straight to `client.reply()` | **No scrubber on the outbound LLM prompt.** The user's raw message and the last 8 turns of history go to Gemini verbatim. The overlay requires "no MSISDN or name in an outbound LLM prompt — there is meant to be a scrubber with a test"; `src/server/log.ts` has an excellent one that is never applied here | POPIA s105/106. **This has already happened**: the transcript behind `MISTAKES.md` M10 contained a real mobile number typed by the user and it was transmitted to Google. The new `unbuilt` route intercepts most payment-shaped messages before the model, which narrows exposure — but that is a side effect of an honesty fix, not a privacy control, and it disappears when M3a lands | Apply the existing `scrub()` to `message` and every `history` entry before they enter the prompt. It is one import and two `.map()` calls, and the function is already tested. Add a test asserting a message containing an MSISDN reaches the client masked |
| A5-03 | **High** | `src/app/api/agent/route.ts:63` | No origin check. Verified live: `POST` with `Origin: https://evil.example` → `200` | No ACAO header means a browser will not let the attacker *read* the response, so this is not data theft. It is **resource theft**: any third-party page can make its visitors' browsers spend our Gemini free-tier quota and our Vercel function budget, at 20/min per IP across an unbounded number of IPs. On the day of a demo, a quota exhausted by someone else's page is indistinguishable from a broken product | Check `Origin` against an allowlist (the canonical host plus `localhost`) and reject a mismatch with `403`. Five lines |
| A5-04 | **High** | Whole application; `supabase/migrations/0001_ledger.sql` (RLS on 8 tables) | **No authentication of any kind.** Every endpoint answers every caller. Consequently every RLS policy is unexercised — the integration tests that cover them run as service-role, and skip entirely without `DATABASE_URL` | The overlay says to grade RLS assuming the attacker has read `supabase/migrations/`, which in a public repo they have. Policies that have never denied a real principal are a design, not a control. Acceptable *only* because the database holds nothing but our own test rows — a condition with no enforcement behind it | M9a. Until then the honest mitigation is the one already present: the route docstrings say plainly that this stops being acceptable the moment real money is in the table |
| A5-05 | Medium | `src/server/momo/callback.ts:63-75` | Rate limiting is an in-process `Map`. Every serverless instance keeps its own | The stated limits (20/min for the agent, the default for the callback) are multiplied by the instance count, so the real ceiling is unknown and elastic. This is the control standing between an attacker and the Gemini quota, alongside A5-03 | A `rate_limit` table keyed on `(ip, minute)` with a unique constraint costs one insert per request and is durable. Upstash is the usual answer and is out on free-tier grounds (`docs/10`) |
| A5-06 | Medium | Live ledger — `SUSPENSE` (labelled "Awaiting delivery") holds **R30.00** across 7 accounts | The overlay's money-integrity table grades *"the `SUSPENSE` or `ROUNDING` account has a non-zero balance at rest"* as **Medium — an alarm, investigate**. `ROUNDING` is correctly at zero | This is almost certainly benign: `SUSPENSE` is where a settled collection sits before the product is issued, and no issuance path exists yet (M3a). But the overlay asks for it to be raised rather than assumed, and "we know why" should be written down where the next auditor finds it | Confirm every SUSPENSE cent traces to a transaction with no delivery step built, then document the expected non-zero condition in `docs/02-DATA-MODEL.md` so it stops reading as an alarm |
| A5-07 | Medium | `src/app/api/context/route.ts:60-64` | The catch returns `200` with an empty rail rather than a `5xx` | Deliberate and reasonable — the chat must work when the rail cannot be drawn. But `MISTAKES.md` M8 in this very repo is the story of a route that returned 200 on failure and hid a bug for two sessions. The same shape is here again, one route over | Keep the 200, and make the failure observable: the `log('error', 'context.read.failed')` is present, so ensure something actually watches the drain — or add a `degraded: true` field the client ignores and a human can see |
| A5-08 | Medium | `src/app/api/agent/route.ts` | Model output is returned to the client and rendered as text. `history` is client-supplied and echoed back into the prompt | The rendering side is safe by construction — ADR-0013's component registry, no `dangerouslySetInnerHTML` anywhere in the artifact path (verified). The remaining surface is that a client can put arbitrary text in `history` and steer the model. Blast radius is bounded: no write tools exist, so the worst outcome is a wrong card and wasted prose | Bounded and acceptable now. It stops being acceptable the moment `propose_*` exists — at which point history must be server-held, not client-supplied |
| A5-09 | Low | `audits.config.json` | A9 (per-PR security review) is disabled for cost, and no audit-suite sha is pinned | Both are stated gaps rather than regressions. The unpinned sha means no result in `docs/audits/results/` is reproducible against a known audit version | Pin `suite.ref` to a commit sha |
| A5-10 | Low | `.env.example` | `MTN_*` production credentials live in `.env.local`, read by nothing, deliberately | Correct and well-documented — parking real production keys under names nothing reads is the right call before a demo. Reported only so a future session does not "tidy" them into use without reading `STATUS.md` on why | None. The comment in `STATUS.md` is the control |

---

## 3. Money integrity — the overlay's table

Every row checked against the code, not the docs:

| Check | Result |
|---|---|
| A second write path to `ledger_entry` | **PASS** — `insertEntries` has one caller (`src/server/ledger/journal.ts:63`), enforced by `tests/unit/ledger/single-writer.test.ts` reading the source tree |
| Retry generates a new `X-Reference-Id` | **PASS** — the persisted `momo_transaction.id` is reused; contract-tested |
| Read-then-write state transition | **PASS** — `claimTransition` uses `SELECT … FOR UPDATE` + `WHERE prev.status = any($2)` |
| `journal_id` set twice | **PASS** — guarded by the transition and a database constraint |
| A split whose parts do not sum to the input | **PASS** — property-tested over 5,000+ cases; the R12.50 tie-break is pinned |
| Negative balance on an account that forbids it | **PASS** — enforced by trigger, verified *firing* per `STATUS.md` |
| `SUSPENSE` / `ROUNDING` non-zero at rest | **SUSPENSE R30.00 — see A5-06.** `ROUNDING` is zero |

## 4. The agent as an untrusted surface (ADR-0014)

| Check | Result |
|---|---|
| `propose_*` tools have no write capability | **PASS by absence** — no `propose_*` tool exists yet, and no write tool is in the module graph below `respond()` |
| Proposals server-signed and re-validated | **N/A** — S7f unbuilt. Will need auditing when it lands |
| Confirmation renders from the signed proposal, not model prose | **N/A**, and note that M10 was exactly the failure this control anticipates: model prose described a payment nothing had created. Fixed by refusing deterministically |
| No auto-confirm, no voice-confirm | **PASS** — neither path exists |
| Injected text cannot reach the DOM as markup | **PASS** — no `dangerouslySetInnerHTML` anywhere; the component registry is fixed |

---

## 5. Not measured

| Check | Why |
|---|---|
| **RLS behaviour under a real authenticated principal** | Requires auth (M9a). The 6 policy tests run as service-role and skip without `DATABASE_URL` |
| **POPIA retention purging** | Proof photos (90 days) and request bodies (7 days) — neither retention job exists yet, so there is nothing to verify. Reported as absent, not as passing |
| **Replay safety of five identical webhook deliveries** | The idempotency design implies it and the callback only triggers a lookup, but no test delivers the same payload five times |
| **Secret scanning of full git history** | Only the current tree was scanned. The overlay grades a secret anywhere in history as Critical requiring rotation; a full-history scan (`gitleaks`/`trufflehog`) was not run |

---

## 6. Waived

None.

---

## 7. Remediation roadmap

**Quick wins (< 1 day)**
- A5-02 — apply the existing `scrub()` to the outbound prompt. One import, two `.map()`s, one test.
  **This is the highest value-per-minute item in the report.**
- A5-01 — the four cheap headers (`nosniff`, `Referrer-Policy`, `frame-ancestors`,
  `Permissions-Policy`) in `next.config.ts`. CSP can follow report-only.
- A5-03 — origin allowlist on `/api/agent`.
- A5-09 — pin the audit sha.

**Medium**
- A5-06 — trace the SUSPENSE balance and document the expected condition.
- A5-05 — a durable rate limiter if this ever carries real users.
- A full-history secret scan.

**Structural**
- A5-04 — authentication (M9a), which turns eight tables of RLS from design into control.
- A5-08 — server-held conversation history, required before `propose_*` ships.

---

## 8. What is genuinely good

- **The money-integrity table passes on every row that is currently reachable**, and passes
  *structurally*. A second ledger writer is not discouraged, it fails the build.
- **The callback route documents its own threat model and the code matches it.** "The worst a forged
  callback can do is make us ask MTN about a transaction we already own" is a precise, testable
  claim, and it is true.
- **Constant-time secret comparison** in `src/server/cron/auth.ts`, with a comment explaining that
  `===` leaks length and prefix through timing. Six lines to not have that conversation.
- **The logger's MSISDN scrubber protects the correlation id.** The lookaround deliberately excludes
  hyphens and hex so a uuid is not shredded — someone reasoned about the failure mode of their own
  mitigation, which is the rarest thing in this report.
- **Secret hygiene is clean.** No key-shaped string in any tracked file; `.env*` ignored with only
  `.env.example` committed; `NEXT_PUBLIC_` confined to the two values that are public by design.
- **Real MTN production credentials are deliberately parked under names nothing reads.** That is a
  security decision and a demo-safety decision at once, and it is documented.
- **`401` on a bad Telegram secret**, verified rather than assumed.
