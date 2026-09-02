# momoAPIs.md — MTN MoMo API Reference (living document)

**Canonical upstream source:** <https://momodeveloper.mtn.com/API-collections>
Supporting: <https://momodeveloper.mtn.com/api-documentation> · <https://momodeveloper.mtn.com/api-documentation/getting-started>

> **This file exists so we never code from memory.**
> Every MoMo fact we rely on lives here with a confidence rating and a date.
> If a fact you need is not in this file, go to the portal, confirm it, and add it — do not guess.

- **Last verified:** 2026-09-02
- **Verified by:** planning session (public sources only — portal requires a signed-in session)
- **Environment in use:** `sandbox` only. No production credentials exist for this project.

---

## 0. Confidence ratings

| Rating | Meaning | Allowed use |
|---|---|---|
| **[V] Verified** | Confirmed against an official page or a documented working request, cited below | Safe to code against |
| **[P] Probable** | Consistent across two or more independent secondary sources, not yet seen on the portal | Code against it, but wrap in a test that would fail loudly if wrong |
| **[U] Unconfirmed** | Single source, inference, or memory | **Do not code against it.** Confirm on the portal first |

The portal is a JavaScript single-page app behind a sign-in, so automated fetching returns only the
page shell. **Anything marked [P] or [U] must be confirmed by a human with a signed-in browser
session.** That is a Day 1 task (see `STATUS.md` F9).

---

## 1. Re-verification protocol

Do this, and record it in the changelog at the bottom of this file:

1. **Before writing any code that calls a new endpoint.**
   Open <https://momodeveloper.mtn.com/API-collections>, find the operation, and confirm:
   path, method, required headers, body schema, response codes.
2. **When any MoMo call fails in a way the docs did not predict.**
   Re-read the operation page. Update this file with what actually happened.
3. **Weekly, every Monday, until submission.** The sandbox has changed behaviour before.
4. **Never downgrade a rating silently.** If something we marked [V] turns out wrong, change it to
   [U], write what we observed, and add a changelog line.

Update this file **in the same PR** as the code that depends on the change. A PR that adds a MoMo
call without touching this file gets rejected.

---

## 2. Base URLs

| Environment | Base URL | Rating |
|---|---|---|
| Sandbox | `https://sandbox.momodeveloper.mtn.com` | **[V]** |
| Production | Per-market; issued on approval via the Merchant Portal | **[U]** — out of scope, we are sandbox only |

---

## 3. Credentials model

Three distinct secrets. Confusing them is the most common cause of `401` in this API.

| Secret | Where it comes from | Scope | Rating |
|---|---|---|---|
| `Ocp-Apim-Subscription-Key` | Portal profile, **one per product subscription** (Collections, Disbursements, Remittances each have their own) | Identifies your portal subscription | **[V]** |
| `apiUser` (a UUID v4) | You generate it and POST it as `X-Reference-Id` when creating the API user | Sandbox identity | **[V]** |
| `apiKey` | Returned by the create-API-key call | Password for that apiUser | **[V]** |
| `access_token` | `POST /{product}/token/`, Basic auth of `apiUser:apiKey` | Bearer token, **expires in 3600s** | **[V]** |

**Consequence for our code:** we need **three** subscription keys and **three** token caches, one per
product. A single "MOMO_SUBSCRIPTION_KEY" env var is a bug waiting to happen.

```
MOMO_COLLECTION_SUBSCRIPTION_KEY
MOMO_DISBURSEMENT_SUBSCRIPTION_KEY
MOMO_REMITTANCE_SUBSCRIPTION_KEY
MOMO_API_USER          # shared UUID
MOMO_API_KEY           # shared secret
MOMO_TARGET_ENVIRONMENT=sandbox
MOMO_CALLBACK_HOST     # host only, no scheme, no path
```

---

## 4. Sandbox provisioning (one-time, sandbox only)

### 4.1 Create API user — **[V]**

```http
POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser
X-Reference-Id: <UUID v4 you generate — this becomes your apiUser>
Ocp-Apim-Subscription-Key: <subscription key>
Content-Type: application/json

{ "providerCallbackHost": "momo.tumoolo.tech" }
```
`201 Created`, empty body.

> **[V] MEASURED 2026-09-02, and the earlier guess was wrong in the way that matters.**
>
> `providerCallbackHost` is a **host**, not a URL — no scheme, no path. That part was right.
>
> This section previously said a mismatched `X-Callback-Url` means "callbacks are silently
> dropped". **It does not. It fails the entire payment.**
>
> ```
> POST /collection/v1_0/requesttopay
> X-Callback-Url: https://<a host that is not providerCallbackHost>/...
>
> 500 {"message":"Callback URL does not match the configured value.",
>      "code":"INVALID_CALLBACK_URL_HOST"}
> ```
>
> So `X-Callback-Url` is not the optional latency optimisation the docs imply — get the host
> wrong and **no money moves at all**. Measured as a controlled experiment: with the API user
> bound to host A, sending host B returns 500 and host A returns 202; after re-provisioning the
> same user against host B, the results invert exactly. Sending **no** `X-Callback-Url` returns
> 202 under either binding.
>
> **The operational consequence.** The callback host is fixed at provisioning time and there is
> no documented way to change it on an existing API user. **Moving the deployment to a new domain
> means provisioning a new API user and key** (§4.1, §4.2) — it is not an environment-variable
> change. `MOMO_CALLBACK_HOST` in `.env.local` and on Vercel must always equal the
> `providerCallbackHost` that `GET /v1_0/apiuser/{id}` (§4.3) reports.
>
> Verify the binding before trusting it — one request, and it is the difference between a working
> demo and a 500 on stage:
>
> ```
> GET /v1_0/apiuser/{apiUser}
> → {"providerCallbackHost":"momo.tumoolo.tech","targetEnvironment":"sandbox"}
> ```

### 4.2 Create API key — **[V]**

```http
POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{apiUser}/apikey
Ocp-Apim-Subscription-Key: <subscription key>
```
`201 Created` → `{ "apiKey": "..." }`

**This is shown once.** Store it immediately in GitHub Secrets and `.env.local`.

### 4.3 Get API user — **[V] 2026-09-02**

```http
GET https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{apiUser}
Ocp-Apim-Subscription-Key: <subscription key>
```
`200 OK` → `{"providerCallbackHost":"momo.tumoolo.tech","targetEnvironment":"sandbox"}`

Note it needs only the subscription key — **no token, no `X-Target-Environment`**.

Not merely "useful". Since a mismatched callback host is a **500 on every payment** (§4.1), this
is the one request that tells you whether the deployment and the credentials agree. Run it when
the domain changes, and before a demo.

---

## 5. Authentication — **[V]**

```http
POST https://sandbox.momodeveloper.mtn.com/{product}/token/
Authorization: Basic base64(apiUser:apiKey)
Ocp-Apim-Subscription-Key: <subscription key for that product>
X-Target-Environment: sandbox
```
`200/201` →
```json
{ "access_token": "eyJ...", "token_type": "access_token", "expires_in": 3600 }
```

`{product}` is `collection`, `disbursement`, or `remittance`.
**Note the trailing slash on `/token/`.** Omitting it has been reported to 404.  **[P]**

**Our implementation rule:** cache per product, refresh at 80% of `expires_in` (48 minutes), and
refresh eagerly on any `401` before retrying once. Never refresh on every request — the sandbox
rate-limits and it wastes our 10s function budget.

---

## 6. Standard request headers

| Header | Applies to | Notes | Rating |
|---|---|---|---|
| `Authorization: Bearer <access_token>` | all product calls | The literal word `Bearer` is required | **[V]** |
| `Ocp-Apim-Subscription-Key` | everything | Product-specific | **[V]** |
| `X-Target-Environment` | all product calls | `sandbox` for us | **[V]** |
| `X-Reference-Id` | POST operations | **UUID v4**, unique per transaction, becomes the transaction id | **[V]** |
| `X-Callback-Url` | POST operations | Optional. Must be under `providerCallbackHost` | **[P]** |
| `Content-Type: application/json` | POSTs with a body | | **[V]** |

**Common causes of failure, all reported by other developers:**
- `X-Reference-Id` not a valid UUID **v4** → `400`
- `X-Reference-Id` reused across transactions → `409 Conflict`
- `X-Reference-Id` equal to the apiUser id → rejected
- `externalId` containing spaces → rejected
- Missing the `Bearer` keyword → `401`

---

## 7. Collections

Used for: taxi fare, electricity, school fees, airtime, stokvel contributions, escrow funding.

### 7.1 Request to Pay — **[V]**

```http
POST /collection/v1_0/requesttopay
X-Reference-Id: <UUID v4>              <-- our momo_transaction.id
X-Target-Environment: sandbox
X-Callback-Url: https://<callback host>/api/momo/callback/collection
Authorization: Bearer <token>
Ocp-Apim-Subscription-Key: <collections key>
Content-Type: application/json

{
  "amount": "12.50",
  "currency": "EUR",
  "externalId": "fare-8842",
  "payer": { "partyIdType": "MSISDN", "partyId": "46733123453" },
  "payerMessage": "MoMo Kasi taxi fare",
  "payeeNote": "Rank 42 fare"
}
```

**`202 Accepted`, no body.** The transaction is *not* complete. Resolve via callback or polling.

- `currency` **must be `EUR`** in sandbox. See §11 for our ZAR shim. **[V]**
- `amount` is a decimal **string**. **[V]**
- `X-Callback-Url` **must be on the API user's `providerCallbackHost`**, or the whole request
  returns **`500 INVALID_CALLBACK_URL_HOST`** and no payment is created. See §4.1 — this is a
  measured 500, not a dropped callback. **[V]**
- Omitting `X-Callback-Url` entirely is always accepted (`202`). That is the safe fallback when
  the binding is uncertain: the reconciler is authoritative anyway (docs/03 §3). **[V]**

### 7.2 Request to Pay status — **[V]**

```http
GET /collection/v1_0/requesttopay/{referenceId}
X-Target-Environment: sandbox
Authorization: Bearer <token>
Ocp-Apim-Subscription-Key: <collections key>
```
`200 OK` →
```json
{
  "financialTransactionId": "1432942836",
  "externalId": "fare-8842",
  "amount": "12.50",
  "currency": "EUR",
  "payer": { "partyIdType": "MSISDN", "partyId": "46733123453" },
  "payerMessage": "MoMo Kasi taxi fare",
  "payeeNote": "Rank 42 fare",
  "status": "SUCCESSFUL"
}
```

### 7.3 Other collection operations — **[P]**, not on our critical path

| Operation | Path |
|---|---|
| Account balance | `GET /collection/v1_0/account/balance` |
| Account holder active | `GET /collection/v1_0/accountholder/{idType}/{id}/active` |
| Request to withdraw | `POST /collection/v1_0/requesttowithdraw` (also `v2_0`) |
| Invoice | `POST /collection/v2_0/invoice` |
| Payments | `POST /collection/v2_0/payment` |
| Pre-approval | `POST /collection/v2_0/preapproval` |

**Pre-approval is worth a look for the stokvel feature** — a member pre-approves recurring
contributions once instead of approving every week. If it works in sandbox it is a strong demo
beat. Confirm on the portal before committing to it. Currently **[U]** and not in the MUST scope.

---

## 8. Disbursements

Used for: escrow release to workers, the 60/25/10/5 revenue split payouts, bulk payroll.

> ### ✅ DISBURSEMENTS ARE LIVE ON PRODUCTION — **[V] MEASURED 2026-09-03**
>
> Verified against `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtnsouthafrica`, using
> `MTN_DISBURSEMENT_SUBSCRIPTION_KEY` with the same API user as collections:
>
> ```
> POST /disbursement/token/                              → 200
> GET  /disbursement/v1_0/account/balance                → 200 {"availableBalance":"35.83","currency":"ZAR"}
> GET  /disbursement/v1_0/accountholder/msisdn/{n}/active → 200 {"result":true}
> ```
>
> **There is R35.83 of real money in the disbursement account, and the intended payee is
> reachable.** So paying OUT is not blocked by provisioning, credentials or the payee — the only
> thing missing is the code (M3a).
>
> **The subscription key differs from collections.** One API user, one API key, but a separate
> `Ocp-Apim-Subscription-Key` per product. `readMomoConfig` already models this correctly as
> `subscriptionKeys.disbursement`.
>
> **`transfer` itself is still `[P]` and must not be coded from memory** (CLAUDE.md #9). Verify
> the request body and response codes before the first send — and unlike a collection, **a
> disbursement moves money with no second human in the loop.** A `requesttopay` that goes wrong
> annoys someone; a `transfer` that goes wrong is gone.

| Operation | Path | Rating |
|---|---|---|
| Transfer | `POST /disbursement/v1_0/transfer` | **[V]** 202 sandbox · **403 on production** (§8a) |
| Transfer status | `GET /disbursement/v1_0/transfer/{referenceId}` | **[V]** 200, body below |
| Deposit | `POST /disbursement/v1_0/deposit` | **[V]** **403 on production** (§8a) |
| Deposit / Refund | `v2_0` variants | **[P]**, not measured |
| Refund | `POST /disbursement/v1_0/refund` | **[P]**, not measured |
| Account balance | `GET /disbursement/v1_0/account/balance` | **[V]** 200, R35.83 ZAR |
| Account holder active | `GET /disbursement/v1_0/accountholder/{idType}/{id}/active` | **[V]** 200, `{"result":true}` |
| Token | `POST /disbursement/token/` | **[V]** 200 |
| Transfer, `v2_0` | `POST /disbursement/v2_0/transfer` | **[V]** **404** — `v1_0` is the path |

**The transfer body — [V] MEASURED 2026-09-03.** Exactly these fields returned `202 Accepted`
against the sandbox. It mirrors `requesttopay` with `payee` in place of `payer`:

```json
{
  "amount": "12.50",
  "currency": "<sandbox label | ZAR>",
  "externalId": "payout-8842-owner",
  "payee": { "partyIdType": "MSISDN", "partyId": "46733123453" },
  "payerMessage": "MoMo Kasi fare split",
  "payeeNote": "Owner share"
}
```

Headers are the standard set (§6) plus `X-Reference-Id`. `X-Callback-Url` is accepted and optional.

**The status response — [V] MEASURED 2026-09-03**, verbatim:

```json
{"amount":"12.5","currency":"<label>","externalId":"payout-1788389263802",
 "payee":{"partyIdType":"MSISDN","partyId":"46733123453"},
 "payerMessage":"MoMo Kasi gig payout","payeeNote":"Your gig payment","status":"PENDING"}
```

**Note `"12.5"`, not `"12.50"`.** MTN normalises the decimal it echoes back, so anything comparing
this against what we sent must compare MONEY, not strings.

### 8a. Disbursement WRITES are forbidden on production — **[V] MEASURED 2026-09-03**

**Money can come in. It cannot go out.** This is MTN's authorization gate, not our code, and no
change to the request can affect it.

Measured against `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtnsouthafrica`, with the
credentials that collect real money successfully in the same session:

| Call | Result |
|---|---|
| `POST /disbursement/v1_0/transfer` — a well-formed body | **`403 { "statusCode": 403, "message": "Forbidden" }`** |
| `POST /disbursement/v1_0/transfer` — **a deliberately malformed body** | **the same `403`** |
| `POST /disbursement/v1_0/deposit` | **`403`** |
| `POST /collection/v1_0/requesttopay` — **the control** | **`202 Accepted`** |
| `GET /disbursement/v1_0/account/balance` | `200 {"availableBalance":"35.83","currency":"ZAR"}` |
| `GET /disbursement/v1_0/accountholder/msisdn/27767223145/active` | `200 {"result":true}` |
| disbursement balance after all of the above | **unchanged** |

**Re-run it yourself: `npm run momo:preflight -- --production`.** It probes both products
per-operation, sends only amounts that cannot clear (asserted against the balance it reads first,
with no override flag), includes the malformed-body probe, and re-reads both balances at the end so
"nothing moved" is evidence rather than a claim.

**Collections and disbursements report the SAME balance** — `39.75` on both at 01:5x — so this is
one wallet seen through two products, not a separate payout float. The earlier "R35.83 sitting in
the disbursement account" was the same money the collection side was already showing.

**The malformed-body row is the one that settles it.** A bad body returns the same `403` as a good
one, so nothing ever read our body: the refusal happens above the MoMo service, at the API gateway.
The `{"statusCode":…,"message":…}` shape is the gateway's; MoMo's own errors look like
`{"message":"…","code":"NOT_ALLOWED_TARGET_ENVIRONMENT"}`.

**What is therefore ruled out:** our body, our headers, our path (`v2_0` is a 404, so `v1_0` exists
and is forbidden rather than missing), our credentials (the same token reads the disbursement
balance), our API user (the disbursement product recognises it — an unrecognised user returns
`NOT_ALLOWED`, as the sandbox did), and the payee (`active` is `true`).

**What is left, and is stated as an inference rather than a finding:** the account is not authorised
for disbursement *operations* on production. It is also possible MTN issues a separate production
API user for Disbursements. Both are portal/support questions. `MISTAKES.md` M13 is the reason this
paragraph is labelled — a confident story about a third party's provisioning was wrong once before.

> **The lesson that generalises, and it was ours.** `PLANNING.md` said *"Nothing is blocked but the
> code"*, from two read-only checks: the balance was there and the payee was reachable.
> **Read-only checks only ever prove read-only things.** A `GET` that works says nothing about
> whether a `POST` is permitted, and the difference between them is the entire product. See
> `MISTAKES.md` M14.

### 8b. The SANDBOX scopes an API user to its subscription key — **[V] MEASURED 2026-09-03**

`scripts/momo-provision.mjs` creates the sandbox API user with the **collection** subscription key.
Every disbursement call with that user returned:

```
500 {"message":"Access to target environment is forbidden.","code":"NOT_ALLOWED_TARGET_ENVIRONMENT"}
```

That message names the environment and the cause is the **credential scope** — the token succeeds,
because the KEY is valid, and then the USER is unknown to the product. Provisioning a second API
user under the disbursement key fixes it immediately:

```
POST /v1_0/apiuser              201    (with the DISBURSEMENT subscription key)
POST /v1_0/apiuser/{id}/apikey  201
POST /disbursement/token/       200
POST /disbursement/v1_0/transfer 202   ← the contract above, verified
```

`MOMO_DISBURSEMENT_API_USER` / `MOMO_DISBURSEMENT_API_KEY` carry it; `credentialsFor()` in
`src/lib/momo/config.ts` falls back to the shared pair when they are absent, which is what
production wants. **On production there is one user for everything** — the 403 in §8a is not this
problem.

---

## 9. Remittances

Used for: diaspora funding of a purpose-locked family sub-wallet (S3).

| Operation | Path | Rating |
|---|---|---|
| Transfer | `POST /remittance/v1_0/transfer` | **[P]** |
| Transfer status | `GET /remittance/v1_0/transfer/{referenceId}` | **[P]** |
| Cash transfer | `POST /remittance/v2_0/cashtransfer` | **[U]** |
| Account balance | `GET /remittance/v1_0/account/balance` | **[P]** |

---

## 9a. `PAYER_NOT_FOUND` on production means the PAYER, not us — **[V] MEASURED 2026-09-02**

**Our production merchant account is fully live. The payer's wallet is not an active MoMo account
holder.** Those are very different problems and the first hour of diagnosis assumed the wrong one.

### The two calls that settled it

Both are read-only, both are free, and between them they separate every hypothesis:

```
GET /collection/v1_0/account/balance                     ← is OUR side live?
GET /collection/v1_0/accountholder/msisdn/{n}/active     ← can MTN SEE that wallet?
```

Measured against `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtnsouthafrica`:

| Call | Result |
|---|---|
| our collection account balance | **`200 {"availableBalance":"32.39","currency":"ZAR"}`** |
| `accountholder/msisdn/27767221345/active` | `200 {"result": false}` |
| `accountholder/msisdn/0767221345/active` | `200 {"result": false}` |
| `accountholder/msisdn/27761346606/active` | `200 {"result": false}` |

**Our account is provisioned, live, and holds a real ZAR balance.** The API user is not blocked —
a blocked one returns `401`/`403`, and every call here returns `200`/`202`.

**Sandbox, as the control:** the same `active` check returns `{"result": true}` for an arbitrary
South African number, because the sandbox is a simulator that recognises anything. Useful to know
before trusting a `true` there for anything.

### What `PAYER_NOT_FOUND` therefore means

Exactly what it says: MTN looked for a chargeable wallet at that MSISDN and did not find one. Not a
format problem, not a credentials problem, not a Go Live problem. **A wallet can hold a balance and
still not be an active account holder** — registration without completed FICA/RICA verification is
the usual reason in South Africa, and money loaded as *airtime* is not in the MoMo wallet at all.

**Diagnose in this order, before spending anything.** `active` is free, instant, and sends nothing
to the payer's handset:

1. `GET /collection/v1_0/account/balance` — if this fails, the problem is ours.
2. `GET /collection/v1_0/accountholder/msisdn/{n}/active` — if `false`, stop. A `requesttopay` to
   that number can only ever return `PAYER_NOT_FOUND`.
3. Only then send a `requesttopay`.

> **The correction worth keeping.** The first version of this section concluded that production
> "cannot reach a single real subscriber" and blamed the Go Live business verification. That was
> inference from a failure, not measurement — and one extra read-only call disproved it. When an
> API tells you *which* thing it could not find, check that thing before theorising about a
> different one.

### The earlier attempts, for the record

Before the `active` check existed, five `requesttopay` calls were sent across two real numbers and
four MSISDN formats. Every one returned `202` and then `FAILED · PAYER_NOT_FOUND`:

Measured against `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtnsouthafrica`, with a
real MTN SA number belonging to a consenting person who had loaded R10 onto that exact wallet:

| MSISDN format sent | `POST /collection/v1_0/requesttopay` | Then `GET .../requesttopay/{ref}` |
|---|---|---|
| `27767221345` (international, no `+`) | **202** | `FAILED` · `PAYER_NOT_FOUND` |
| `0767221345` (local, leading zero) | **202** | `FAILED` · `PAYER_NOT_FOUND` |
| `767221345` (no country code) | **202** | `FAILED` · `PAYER_NOT_FOUND` |
| `+27767221345` (with `+`) | **202** | `FAILED` · `PAYER_NOT_FOUND` |

A second real MTN SA number gave the same result. **Five attempts, two numbers, four formats, one
answer.**

**What this ruled out:** the MSISDN format (four of them), and the callback binding — no
`X-Callback-Url` was sent, which §4.1 measured as `202` under any binding, and it was.

**What it did NOT establish, though the first write-up claimed it did:** that our API user was
unprovisioned. Four failures in a row make a provisioning story feel obvious, and it was wrong.
The `active` check above took one call and showed our account live with a ZAR balance while all
three payer numbers came back `false`.

**The operational consequence.** `mtnsouthafrica` is not a demo path *tonight*, because no payer
we can reach has an active wallet. That is a different and much more fixable problem than an
unprovisioned merchant account: it needs the payer's MoMo registration completed, not a
business-verification queue. Sandbox remains the environment where the demo runs, and the honest
claim about production is *"our merchant account is live and authenticating against MTN South
Africa"* — which is now stronger than the previous wording, and true.

> **A `202` is not an acceptance of the payment.** It is an acceptance of the *request*, and this
> is the second time in this file that a success-shaped response has meant less than it looked
> (see §4.1, where the interesting answer was the `500`). The status must always be fetched.
> `MISTAKES.md` M8 — verify an effect, not a response — applies to third-party APIs exactly as it
> applies to our own routes.

**Cost of establishing this: R0.00.** A `PAYER_NOT_FOUND` moves no money, so all five attempts
were free, and the ~R10 live budget is untouched.

---

## 10. Sandbox test MSISDNs — **[V] VERIFIED 2026-09-02, and the docs were wrong**

Measured against the live sandbox with `node scripts/momo-smoke.mjs`, then polled for 40 seconds
per number. **Four of six documented outcomes were wrong.** This is exactly why they were rated
`[P]` and never coded against.

| MSISDN | Secondary sources claimed | **Actually observed** | Use it for |
|---|---|---|---|
| `46733123450` | FAILED | **`FAILED`** immediately | The failure path |
| `46733123451` | REJECTED | **`FAILED`** immediately | (duplicate of the above) |
| `46733123452` | TIMEOUT | **`FAILED`** immediately | (duplicate of the above) |
| `46733123453` | SUCCESSFUL | **`PENDING`**, still pending after 40s | **The stuck-transaction path** — reconciler, timeout handling |
| `46733123454` | PENDING | **`CREATED` → `SUCCESSFUL` after ~25s** | **The async happy path.** This is the demo number. |
| anything else | always SUCCESSFUL | **`SUCCESSFUL`** immediately | Nothing — a test using one cannot fail |

### Three consequences, all load-bearing

**1. `CREATED` is a real status and was missing from our state machine.**
The documented vocabulary (`PENDING`/`SUCCESSFUL`/`FAILED`/`REJECTED`/`TIMEOUT`) is incomplete.
A transaction can sit in `CREATED` before it reaches `PENDING`. Any state machine that does not
accept `CREATED` will crash or silently mis-handle the one number that actually demonstrates
asynchronous resolution. See §12.

**2. `REJECTED` and `TIMEOUT` appear to be unreachable in sandbox.**
Both numbers documented for them return `FAILED`. We still model those states — production may
emit them — but we cannot integration-test them against the sandbox. The emulator (ADR-0009) is
therefore the **only** way to exercise those branches, which moves it from "demo insurance" to a
test-coverage requirement.

**3. `46733123454` is the demo number.**
It is the only one that exercises the real flow: request accepted → `CREATED` → poll → `SUCCESSFUL`
about 25 seconds later. That 25-second window is exactly what the live console was built to show
(`docs/08` §3). Do not demo with a random number — it resolves instantly and proves nothing.

> **Idempotency verified at the same time:** posting the identical `X-Reference-Id` twice returns
> `202` then `409`. Our retry-safety guarantee (`docs/03` §2) holds against the real API.

## 11. The ZAR / EUR problem — **[V]** that it exists, our shim is our own design

Sandbox accepts **EUR only**. Our users are South African and every screen must say **R**.

**Rule:** the ledger stores ZAR minor units. The MoMo boundary is the *only* place currency
conversion happens, and it is a 1:1 numeric passthrough with a currency relabel, not an FX rate.

```ts
// src/lib/momo/currency.ts  — the ONLY place this mapping is allowed to exist
export function toMomoAmount(zarMinor: bigint): { amount: string; currency: string } {
  // Sandbox is EUR-only. We do NOT apply an FX rate: 1250 ZAR cents -> "12.50" EUR.
  // This keeps demo numbers legible and reconciliation exact. Production would
  // send ZAR and this shim would collapse to a formatter.
  return {
    amount: `${zarMinor / 100n}.${String(zarMinor % 100n).padStart(2, '0')}`,
    currency: process.env.MOMO_TARGET_ENVIRONMENT === 'sandbox' ? 'EUR' : 'ZAR',
  };
}
```

**Why not a real FX rate:** an exchange rate would make our ledger and MoMo's records disagree,
which destroys reconciliation and would be the first thing a technical judge spots. A relabel keeps
the numbers identical on both sides and is defensible in one sentence:
*"Sandbox is EUR-only, so we transmit the same numeric value under the EUR label and reconcile 1:1;
in production the label becomes ZAR and nothing else changes."*

Every UI surface shows `R`. No screen anywhere says EUR. The word EUR appears in exactly two places
in the codebase: this shim, and its test.

---

## 12. Transaction state machine

```
                    +-------------+
                    |  INITIATED  |   row written, nothing sent yet
                    +------+------+
                           | POST succeeds (202)
                           v
                    +-------------+
                    |   CREATED   |   [V] observed 2026-09-02 — MTN emits this
                    +------+------+   before PENDING. NOT in the documented
                           |          vocabulary. Treat as non-terminal.
                           v
                    +-------------+
        +---------->|   PENDING   |<----------+
        |           +------+------+           |
        |                  |                  |
        |   callback       |     reconciler   |
        |   arrives        |     polls        |
        +------------------+------------------+
                           |
        +----------+-------+-------+----------+
        v          v               v          v
  +-----------+ +--------+ +----------+ +---------+
  |SUCCESSFUL | | FAILED | | REJECTED | | TIMEOUT |
  +-----------+ +--------+ +----------+ +---------+
        |
        +--> ledger journal written, in the SAME db transaction
```

Rules:
1. Terminal states are **immutable**. A late callback contradicting a terminal state is logged and
   discarded, never applied.
2. Every transition is guarded: `UPDATE ... WHERE id = $1 AND status = 'PENDING'`.
   Zero rows updated means someone else won the race — that is success, not an error.
3. Ledger postings happen **only** on the `PENDING -> SUCCESSFUL` transition, in the same DB
   transaction. Nowhere else in the codebase writes to the ledger.
4. `TIMEOUT` is not terminal for the *money*, only for the request. The reconciler keeps checking a
   `TIMEOUT` for up to 24h before giving up, because the payer may still approve.  **[U]** — confirm
   sandbox timeout semantics on the portal.

---

## 13. Known sandbox reliability issues

| Date | Issue | Source | Our mitigation |
|---|---|---|---|
| Jul 2026 | Collections sandbox reported not responding on `token` and `apiuser` endpoints | MoMo Dev Community | ADR-0009: local MoMo emulator built from recorded real responses; demo can run against it |

**This is the single biggest demo-day risk in the project.** See `docs/09-RISK-REGISTER.md` R1.

---

## 14. Open questions for the portal (Day 1 checklist)

Tick these off with a signed-in browser session and update the ratings above.

- [x] ~~Confirm `providerCallbackHost` format (host vs full URL) and whether callbacks fire in sandbox~~ — **done, §4.1.** Host, not URL. A mismatch is a **500**, not a dropped callback.
- [ ] Confirm the exact `disbursement/v1_0/transfer` request body and response codes
- [ ] Confirm the exact `remittance/v1_0/transfer` request body and response codes
- [ ] Confirm the official test MSISDN table, including the success number
- [ ] Confirm whether `v2_0` collections (invoice / payment / preapproval) are live in sandbox
- [ ] Confirm rate limits, if published
- [ ] Confirm `TIMEOUT` semantics and how long a `PENDING` can stay pending
- [ ] Confirm the error-code catalogue at `/best-practices` and `/Error-codes`
- [ ] Download the official Postman collection, commit it to `docs/assets/`, and diff it against this file

---

## 15. Sources

- [MoMo Developer Portal — API collections](https://momodeveloper.mtn.com/API-collections) (canonical, sign-in required)
- [MoMo Developer Portal — API documentation](https://momodeveloper.mtn.com/api-documentation)
- [Testing MTN MoMo Collection API in Sandbox using Postman — chaiwa-berian gist](https://gist.github.com/chaiwa-berian/5294fdf1360247cf4561c95c8fa740d4)
- [MoMo Developer Community — Sandbox Q&A](https://momodevelopercommunity.mtn.com/momo-api-sand-box-q-a-6)
- [Understanding MoMo Open API keys, sandbox and production](https://momodevelopercommunity.mtn.com/how-to-59/understanding-momo-open-api-keys-sandbox-and-production-455)
- [Overcoming the challenges of working with a mobile fintech API — Andela](https://www.andela.com/blog-posts/overcoming-the-challenges-of-working-with-a-mobile-fintech-api)
- [mediumart/momo — PHP client, endpoint inventory](https://github.com/mediumart/momo)
- [mtn-pay-js — sandbox/production and currency notes](https://sopherapps.github.io/mtn-pay-js/)

---

## 16. Changelog

| Date | Change | By |
|---|---|---|
| 2026-09-02 | Created. Provisioning, auth, collections and the EUR shim established from public sources. Disbursements, remittances and test MSISDNs recorded as **[P]**, pending portal confirmation. | Planning session |
| 2026-09-02 | **§10 rewritten from live measurement.** Credentials provisioned and verified; tokens issue for all three products. Ran `scripts/momo-smoke.mjs` + a 40s poll. Four of six documented MSISDN outcomes were wrong. Discovered an undocumented `CREATED` status and added it to §12. `REJECTED`/`TIMEOUT` appear unreachable in sandbox. Idempotency (202 then 409) confirmed against the real API. Promoted §10 to **[V]**. | Live sandbox |
| 2026-09-02 | **§4.1 promoted [P] → [V], and it was wrong in the dangerous direction.** A mismatched `X-Callback-Url` does not silently drop the callback — it returns **`500 INVALID_CALLBACK_URL_HOST`** and creates no payment. Proved by a controlled experiment: bound to host A, sending B is 500 and A is 202; after re-provisioning against B the results invert exactly, and sending no callback URL is 202 either way. Consequence recorded: the callback host is fixed at provisioning, so a new domain needs a **new API user**. §7.1 gained two bullets. | Live sandbox |
