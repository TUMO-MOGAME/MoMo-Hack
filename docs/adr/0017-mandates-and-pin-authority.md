# ADR-0017 — Standing mandates, and a PIN the agent cannot see

- Status: Accepted
- Date: 2026-09-02
- Amends: [ADR-0014](0014-agent-cannot-move-money.md) (which remains in force)

## Context

The product needs two things ADR-0014 forbids as written.

> *"Save R200 a month for my daughter's birthday and send it to her on the day."*
>
> *"Every month end, buy my grandmother electricity — but ask her how much is left first."*

ADR-0014 says: **"No auto-confirm, no 'just do it' mode, at any amount, even on request."**
Money moving on the 31st with nobody present is exactly that. The two cannot both stand.

The temptation is to carve out an exception — "recurring payments are different" — which is how a
structural control becomes a guideline. We are not doing that.

## The insight

**A standing instruction is not an agent decision. It is a debit order.**

The human authorisation does not disappear; it **moves earlier**, to the moment the mandate is
created, and it becomes *bounded*. Afterwards, execution is deterministic server code on a
schedule, and **there is no model anywhere in the call path**.

That is stricter than today, not looser. Right now a model drafts every single payment. Under a
mandate the model is absent at execution entirely — it cannot mis-parse an amount on the 31st
because it is not running on the 31st.

## Options

**A. Carve out an exception for recurring payments.** The agent may execute without confirmation
when it believes a standing instruction exists. Rejected: "the agent believes" is precisely the
thing ADR-0014 refuses to rely on, and the blast radius is unbounded.

**B. Confirm every execution.** Truest to ADR-0014, and it destroys the feature — the entire value
of "save every week while I am not thinking about it" is that nobody is thinking about it.

**C. Authorise a bounded mandate once; execute deterministically within it.**

## Decision

**C.**

1. **A mandate is signed at creation and bounded at creation.** HMAC over the whole object
   including `per_execution_cap`, `total_cap` and `ends_at`. Execution verifies the signature.
2. **The bound is stated before authorisation, in money.** The confirmation card reads
   *"R200 × 6 months = R1,200 maximum, ending 15 March, to •••• 4821"*. The user authorises a
   number, not a concept.
3. **`ends_at` is mandatory.** There is no open-ended authority. Renewal is a new authorisation.
4. **Raising a cap is a new authorisation.** Amount, payee and purpose are inside the signature, so
   changing any of them invalidates it. There is no "edit".
5. **The agent may draft a mandate. It may not create one.** Same capability boundary as
   `propose_*`: the drafting tool has no write access.
6. **Stopping never requires a PIN.** "STOP" pauses everything, from either channel, immediately.
   Friction is deliberately asymmetric — starting is hard, stopping is instant.
7. **A third party's answer can only lower an amount, never raise it.** For mandates with a
   pre-execution question ("how much electricity is left?"), the reply is untrusted input, parsed
   strictly and clamped to the signed cap. Grandmother cannot be socially engineered into draining
   a wallet, because the ceiling is not in her message.
8. **Notify before, not only after.** Every scheduled execution announces itself the day before
   with a cancel path. A surprise becomes a choice.

## The PIN, and why it cannot be typed into the chat

ADR-0014 §5 requires a physical action and forbids voice. A PIN is a strictly better factor for a
mandate — a tap proves *presence*, a PIN proves *identity*, and authorising six future payments
deserves the stronger one.

But **a PIN typed into a Telegram chat is not a secret.** It is in the chat history forever, in the
notification preview on the lock screen, in the bot process's memory, and in any log that records
the update. The same is true of the web chat if it travels through the message stream. Deleting the
message afterwards fixes none of that — the value has already been transmitted, stored and
displayed.

**Decision: the PIN is never entered in the conversation, on either channel.**

- The confirmation card carries a **one-time, short-lived, single-use token** bound to that
  proposal and that user.
- On Telegram that token opens a **Telegram Mini App** (already in scope — `PLANNING.md` §4b,
  `docs/11` A5), whose `initData` is HMAC-verified server-side with the bot token, proving which
  Telegram account is present without the PIN ever entering a message.
- On web it opens a normal confirmation page.
- Both post the PIN **directly to the confirm endpoint**. It never enters the model's context, the
  chat transcript, or a URL.

Storage and handling:

- **Never stored.** A `scrypt` hash with a per-user random salt — `node:crypto` has `scrypt`
  built in, so this costs no dependency and therefore no lockfile risk.
- Constant-time comparison, reusing the existing `secretMatches`.
- Three attempts, then a lockout with exponential backoff.
- Never logged, never in an error message, never in a stack trace. A "PIN accepted" event is
  audited; the value is not.

## Consequences

**Easier:** the product can do the thing people actually want — money that moves while they are
living their life — without a model ever being trusted with a payment. The answer to *"what if
your AI gets it wrong?"* is unchanged and now covers scheduled payments too: it cannot, because it
is not there when they run.

**Harder:** a mandate is a new signed object with a lifecycle, a scheduler that must be idempotent
under retry, and a confirmation surface outside the chat on both channels. The Mini App is real
work. None of it is optional — the cheap versions of each are the insecure ones.

**A cost worth stating:** authority is now delegated over time, which is genuinely more dangerous
than a single tap, however well bounded. That is why `ends_at` is mandatory, why the cap is stated
in rands before signing, why stopping is frictionless, and why every execution announces itself in
advance. Remove any one of those and this ADR should be reconsidered rather than quietly stretched.

**Tested by:** a test asserting the drafting tool performs no write; a test that tampers with a
mandate's cap and asserts the signature check refuses it; a test that answers a pre-check with an
absurdly large number and asserts the execution is clamped to the cap; and a test asserting the PIN
never appears in any logged payload.
