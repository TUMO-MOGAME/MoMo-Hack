# ADR-0015 — POPIA compliance by design

- Status: Accepted
- Date: 2026-09-02

## Context

`docs/00` §7 scopes out KYC/FICA, correctly — those are financial-services licensing obligations
that a sandbox prototype does not trigger.

External research reviewed on 2026-09-02 surfaced a genuine gap in that reasoning: **POPIA is not
KYC.** The Protection of Personal Information Act applies to *anyone processing personal
information*, prototype or not. We process MSISDNs, names, photographs of people at work, and
transaction histories. Penalties reach R10 million or imprisonment, and the Information Regulator
enforces actively.

We had a security posture (RLS, service-role boundary, secret scanning). We did not have a
**privacy** posture, which is a different thing: minimisation, purpose limitation, demonstrable
consent, retention limits, and data subject rights.

## Options

**A. Ignore it — it is a hackathon prototype.** Defensible legally in the narrowest sense, and it
means a South African judging panel can ask one obvious question we cannot answer. It also means
retrofitting later, which is where privacy work actually becomes expensive.

**B. Claim compliance in the deck without building it.** Dishonest, and trivially exposed by one
follow-up question.

**C. Build the controls that are cheap and real; document honestly the ones that need a legal
entity.**

## Decision

**C.** `docs/14-POPIA-COMPLIANCE.md` specifies the full posture. What we build:

- **A data inventory** with a lawful basis and a retention period for every field — and an explicit
  list of what we refuse to collect: no GPS on gig workers, no ID numbers, no raw voice, no
  biometrics, no contact lists, no chat content in logs.
- **Versioned, append-only, per-purpose consent** (`consent_version`, `consent_record`), storing the
  exact notice text and its hash — so consent is *demonstrable*, not merely claimed.
- **A privacy notice on every channel including USSD**, inside 160 characters.
- **Automated retention purging** on the existing scheduler: proof photos at 90 days, request bodies
  at 7, session state at 24 hours.
- **Pseudonymisation on deletion** rather than erasure, because an append-only financial ledger and
  a right to erasure genuinely conflict, and pseudonymisation is the standard resolution.
- **MSISDN handling per s105/106**: masked in logs, never in a URL, never in an error, and — via a
  scrubber with a test — never in an outbound LLM prompt.

What we explicitly do **not** claim: an appointed and registered Information Officer, a PAIA manual,
signed operator agreements, or a completed s72 transfer assessment. These need a legal entity. They
are written up as a pre-launch checklist.

## Consequences

**Easier:** most of the security work was already done for other reasons (ADR-0010's service-role
boundary is textbook least privilege), so the incremental cost is two small tables, a cron job, a
notice, and a masking rule. Privacy constraints also *simplify* the build — deciding not to collect
location removes a permission prompt, a data store, a retention rule and an entire class of risk.

**Harder:** consent gates flows, so onboarding gains a step. The Groq prompt scrubber constrains
what the agent can be told about a user, which means some personalisation must be resolved
client-side after the model responds.

**The pitch consequence, which is the real reason this is worth doing:** every team claims security.
Almost none brings a gap list. *"Here is what we built, and here is what we have not done and why"*
is a more credible thing to say to a corporate panel than a compliance claim, and it is true.
