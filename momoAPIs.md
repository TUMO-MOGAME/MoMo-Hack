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

{ "providerCallbackHost": "momo-kasi.vercel.app" }
```
`201 Created`, empty body.

> **[P]** `providerCallbackHost` is a **host**, not a URL — no scheme, no path. The per-request
> `X-Callback-Url` must live on this host or callbacks are silently dropped.
> **Confirm on the portal before relying on callbacks.** Our design does not depend on it
> (the reconciler is the source of truth), but the live demo is much better with it working.

### 4.2 Create API key — **[V]**

```http
POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{apiUser}/apikey
Ocp-Apim-Subscription-Key: <subscription key>
```
`201 Created` → `{ "apiKey": "..." }`

**This is shown once.** Store it immediately in GitHub Secrets and `.env.local`.

### 4.3 Get API user — **[P]**

```http
GET https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/{apiUser}
Ocp-Apim-Subscription-Key: <subscription key>
```
Useful to confirm the callback host actually registered.

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

| Operation | Path | Rating |
|---|---|---|
| Transfer | `POST /disbursement/v1_0/transfer` | **[P]** |
| Transfer status | `GET /disbursement/v1_0/transfer/{referenceId}` | **[P]** |
| Deposit | `POST /disbursement/v1_0/deposit`, `v2_0` | **[P]** |
| Refund | `POST /disbursement/v1_0/refund`, `v2_0` | **[P]** |
| Account balance | `GET /disbursement/v1_0/account/balance` | **[P]** |
| Account holder active | `GET /disbursement/v1_0/accountholder/{idType}/{id}/active` | **[P]** |

Transfer body mirrors `requesttopay`, with `payee` instead of `payer`:

```json
{
  "amount": "7.50",
  "currency": "EUR",
  "externalId": "payout-8842-owner",
  "payee": { "partyIdType": "MSISDN", "partyId": "46733123453" },
  "payerMessage": "MoMo Kasi fare split",
  "payeeNote": "Owner share"
}
```

> **Day 1 task:** confirm the exact transfer body and response codes on the portal, then promote
> these rows to **[V]**. The whole payout half of the product depends on this.

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

## 10. Sandbox test MSISDNs — **[P]**

These control the simulated outcome. Reported consistently by multiple developers; **confirm on the
portal Day 1** because our entire test matrix depends on them.

| MSISDN | Resulting status |
|---|---|
| `46733123450` | `FAILED` |
| `46733123451` | `REJECTED` |
| `46733123452` | `TIMEOUT` |
| `46733123453` | `SUCCESSFUL` |
| `46733123454` | `PENDING` |
| any other number | **always `SUCCESSFUL`** |

**Two consequences we must design around:**

1. **A passing test that uses a random number proves nothing.** Every negative-path test must use an
   explicit failure MSISDN. We lint for this: test files may only use MSISDNs from a named constant.
2. **No USSD push happens in sandbox.** Nothing appears on a real phone, no balance moves. The demo
   must therefore *show* the state change on our own console — which is exactly what `app/console` is for.

> One source rendered the success number as `56733123453` (leading 5). Treat that as a typo, but
> verify. If `46733123453` does not return `SUCCESSFUL`, try the `5` variant and update this file.

---

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

- [ ] Confirm `providerCallbackHost` format (host vs full URL) and whether callbacks fire in sandbox
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
