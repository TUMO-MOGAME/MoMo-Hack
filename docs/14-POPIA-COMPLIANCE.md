# 14 — POPIA Compliance by Design

South Africa's **Protection of Personal Information Act (POPIA)**. Penalties reach **R10 million**
or imprisonment, and the Information Regulator actively enforces.

> **This is not the same as KYC/FICA.** `docs/00` §7 correctly scopes out KYC/FICA — those are
> financial-services licensing obligations that a sandbox prototype does not trigger.
> **POPIA is different: it applies to anyone processing personal information, prototype or not.**
> We process MSISDNs, names, photographs of people's work, and transaction histories. POPIA applies.

Building it in is cheap. Retrofitting it is not. And for a South African panel, a team that brought
up POPIA unprompted is a team that has thought about operating here.

---

## 1. What we actually process

Data minimisation starts with an honest inventory. Anything not on this list, we do not collect.

| Data | Why we need it | Lawful basis | Retention | Where |
|---|---|---|---|---|
| **MSISDN** | It *is* the MoMo identity — payments are impossible without it | Performance of a contract | Life of account + 5 yrs (financial record) | `profile.msisdn` |
| Display name | So a worker and client can identify each other | Consent | Life of account | `profile.display_name` |
| Telegram user id | Links the bot to the account | Consent | Until unlinked | `profile.telegram_id` |
| Transaction history | The ledger; also the alternative credit profile | Contract + legitimate interest | 5 years (financial record) | `ledger_entry` |
| **Job proof photos** | Escrow release verification | Consent | **90 days, then purged** | Supabase Storage |
| Rank / vehicle association | Routing fares and splits | Contract | Life of account | `vehicle`, `rank` |
| Consent records | Proving we had consent | Legal obligation | 5 years after withdrawal | `consent_record` |

**What we deliberately do NOT collect**, and each omission is a design decision:

- **No GPS or location tracking.** A rank is selected, not detected. Continuous location on gig
  workers would be the most invasive thing we could build and it buys us nothing the QR does not.
- **No ID or passport numbers.** No KYC is performed, so there is nothing to store.
- **No raw voice audio.** Speech-to-text runs on-device; only the resulting text reaches us, and it
  is not retained (`docs/12` §6).
- **No contact list access.**
- **No chat message content in logs.** Tool calls are logged with a correlation id; content is not.
- **No biometrics**, including face detection on proof photos.

---

## 2. The eight conditions, and what we do about each

| # | Condition | Our implementation | Status |
|---|---|---|---|
| 1 | **Accountability** | Information Officer appointed and registered with the Regulator | **Documented, not done** — §6 |
| 2 | **Processing limitation** | Minimal collection (§1); explicit consent captured and versioned | Build |
| 3 | **Purpose specification** | Every field in §1 has a stated purpose and a retention period | Build |
| 4 | **Further processing limitation** | No secondary use. **No selling data, no ad targeting, no training models on user data** | Build + ADR |
| 5 | **Information quality** | Users can view and correct their own profile | Build |
| 6 | **Openness** | Privacy notice in the PWA **and** in USSD (§4) | Build |
| 7 | **Security safeguards** (s19) | Encryption at rest, RLS least privilege, service-role boundary | Mostly already built |
| 8 | **Data subject participation** | Access, correction, deletion, and objection flows | Build |

---

## 3. Consent, recorded properly

POPIA requires consent to be **demonstrable**. "The user clicked something once" is not a defence.
So consent is an append-only audit record, versioned, exactly like the ledger.

```sql
create table consent_version (
  id            uuid primary key default gen_random_uuid(),
  version       text not null unique,        -- 'v1.0'
  document_hash text not null,               -- sha256 of the exact notice text shown
  body          text not null,               -- the notice itself, stored verbatim
  effective_from timestamptz not null default now()
);

create table consent_record (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profile(id),
  version_id   uuid not null references consent_version(id),
  purpose      text not null,                -- 'CORE','PROOF_PHOTOS','MARKETING'
  granted      boolean not null,
  channel      text not null,                -- 'PWA','TELEGRAM','USSD'
  created_at   timestamptz not null default now()
);
create index on consent_record (profile_id, purpose, created_at desc);

-- Append-only, like the ledger. Withdrawal is a new row with granted = false.
create trigger no_mutate_consent before update or delete on consent_record
  for each row execute function reject_mutation();
```

Three properties that matter:

1. **We store the exact text the user saw**, not a link to a page that may since have changed.
   `document_hash` means we can prove it.
2. **Consent is per-purpose.** Agreeing to core payments does not agree to marketing. Granular
   consent is a POPIA requirement, not a nicety.
3. **Withdrawal is an append, not a delete.** The current state is the latest row per
   `(profile_id, purpose)`. We can always show when consent existed and when it stopped.

---

## 4. The privacy notice on a feature phone

POPIA's openness condition applies on every channel, including USSD — where you have **160
characters**. Most implementations quietly skip this. We do not.

```
CON MoMo Kasi stores your number
to send/receive money. We
never sell your data.
Full notice: momokasi.co.za/p
1. I agree  2. No thanks
```

Declining ends the session cleanly. Consent is recorded with `channel = 'USSD'`, against the same
versioned notice as the web flow.

The full notice lives at a public URL, is served in plain HTML for low data cost, and is written in
plain language — POPIA requires notice in an *understandable* form, and legalese aimed at people
who are being asked to trust a stranger with money would be both non-compliant and bad product.

---

## 5. Security safeguards (Section 19)

Most of this we already built for other reasons. That is what "by design" means in practice.

| Requirement | Our control | Where |
|---|---|---|
| Encryption at rest | Supabase Postgres is AES-256 by default | Platform |
| Encryption in transit | TLS everywhere; HSTS | Vercel |
| Least privilege | RLS deny-by-default; ledger unreachable from the browser | ADR-0010 |
| Access control | Supabase Auth + per-policy RLS; authz matrix test | `docs/04` §10 |
| Secrets | GitHub Secrets, `gitleaks` pre-commit and in CI, rotate on exposure | `docs/06` §8 |
| Integrity | Append-only ledger and consent; DB-enforced invariants | `docs/02` §3.3 |
| Webhook hardening | Callbacks are untrusted; we re-fetch authoritative status | `docs/03` §3.1 |
| Anomaly detection | Alert on failed-auth spikes, unusual query volume, non-zero `SUSPENSE` | Build |

### Additional hardening taken from the research

- **IP allowlist on the MoMo callback route** as defence in depth. It does not replace our
  "never trust the callback body" rule — MTN's ranges can change and spoofing is possible — but it
  is cheap and it narrows the attack surface. Implemented as a soft check: a non-matching source is
  logged and rate-limited, not hard-rejected, so a range change cannot break the demo.
- **Sections 105 and 106** create specific offences around unlawfully processing or *selling*
  account numbers. MSISDNs are therefore: never logged in full (masked as `•••• 4821`), never in a
  URL or query string, never in an error message, and never sent to any third party except MTN.
  There is a lint rule and a test for the masking.

---

## 6. What we honestly cannot do as a prototype

Stated plainly, because claiming compliance we do not have would be worse than the gap.

| Obligation | Status | Note |
|---|---|---|
| Appoint an Information Officer | **Not done** | Requires a legal entity. Documented as a pre-launch step. |
| Register the IO with the Information Regulator | **Not done** | Same. |
| Formal PAIA manual | **Not done** | Entity-level. |
| Operator agreements with Supabase, Vercel, MTN, Groq | **Not done** | Reviewed their terms; no signed agreements. |
| Cross-border transfer assessment (s72) | **Partially** | Supabase and Vercel regions and Groq/ElevenLabs processing are documented in §7 |

**The pre-launch checklist** — what a real deployment would need before onboarding one real user:
appoint and register an IO, publish a PAIA manual, sign operator agreements, complete a s72 transfer
assessment, and run a full data protection impact assessment.

Being able to hand a judge that list is worth more than pretending it is done.

---

## 7. Cross-border processing (Section 72)

POPIA restricts sending personal information outside South Africa. Our stack is almost entirely
offshore, so this needs saying rather than hiding:

| Processor | Location | Personal info sent | Mitigation |
|---|---|---|---|
| Supabase | region-selectable | all stored data | **Choose the region closest to SA and document it** |
| Vercel | global edge | in-transit only | No persistence at the edge |
| MTN MoMo | SA / MTN infrastructure | MSISDN, amount | The controller relationship is contractual |
| Telegram | global | display name, messages | Consent-based; user opts into this channel |
| Groq | US | **chat text only, no identifiers** | Prompts carry no MSISDN or name — enforced by a scrubber |
| ElevenLabs | US | **nothing personal** | Only fixed phrase fragments, generated at build time |

> **The Groq scrubber is a real control, not a promise.** Tool *results* containing personal data
> are resolved client-side into the rendered artifact; the model receives amounts and references,
> not identities. There is a test asserting no MSISDN pattern ever appears in an outbound prompt.

---

## 8. Data subject rights

| Right | How | Where |
|---|---|---|
| Access | "Download my data" — a JSON export of everything in §1 | Settings + `/data` in the bot |
| Correction | Edit profile fields directly | Settings |
| Deletion | Deletes profile, photos and Telegram link. **Ledger entries are retained** — financial records must be kept, and an append-only ledger cannot be rewritten. Records are **pseudonymised**: the profile is severed, the postings remain. | Settings |
| Objection | Withdraw consent per purpose | Settings |
| Complain | Information Regulator's details in the notice | Privacy notice |

The deletion nuance is worth rehearsing for the demo, because it is exactly the kind of tension a
sharp judge probes: *"an append-only ledger and a right to erasure — how?"*
Answer: **we pseudonymise rather than delete.** The financial record survives because the law
requires it; the link to a person does not. That is the standard resolution and it is defensible.

---

## 9. Retention and automated purging

POPIA prohibits indefinite retention. A scheduled job enforces the §1 table:

| What | Retention | Job |
|---|---|---|
| Proof photos | 90 days | `/api/cron/retention` deletes from Storage |
| `momo_transaction.request_body` / `last_response` | 7 days | Nulled (also protects the 500MB DB cap) |
| Session and USSD state | 24 hours | Deleted |
| Ledger entries | 5 years | Retained; pseudonymised on account deletion |
| Consent records | 5 years after withdrawal | Retained |

Runs daily on the GitHub Actions scheduler (ADR-0006), and logs a count to `system_check` so
"is retention actually running?" is a query, not an assumption.

---

## 10. Testing

POPIA controls are tested like any other control. An untested control is a claim.

| Test | Asserts |
|---|---|
| Integration | No consent record → core flows are refused |
| Integration | Consent withdrawal takes effect immediately |
| Integration | Retention job actually deletes photos older than 90 days |
| Integration | Deletion pseudonymises the profile and preserves ledger integrity (`sum = 0`) |
| **Security** | No MSISDN appears in full in any log line |
| **Security** | No MSISDN pattern appears in any outbound LLM prompt |
| Unit | The USSD notice fits in 160 characters |
| E2E | The data export contains every field in §1 and nothing beyond it |

---

## 11. The pitch beat

Roughly 20 seconds, placed after the architecture slide (`docs/08` §3):

> *"One more thing, because this is South Africa and not a demo in the abstract. POPIA. We collect
> the minimum — no GPS on gig workers, no ID numbers, no voice recordings. Consent is versioned and
> append-only, so we can prove exactly what a user agreed to and when. Proof photos are purged at 90
> days automatically. And when someone asks us to delete their data, we pseudonymise rather than
> erase the ledger — because financial records have to survive, but the link to a person does not.
> We also have the list of what we have not done: appointing an Information Officer needs a legal
> entity, and we are a prototype. We would rather show you that list than claim we are compliant."*

The honesty is the point. Every team claims security. Almost none brings the gap list.
