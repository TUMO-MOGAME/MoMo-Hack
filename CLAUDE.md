# MoMo Kasi — Agent Standing Orders

> **Read this first, every session.** Then read `MISTAKES.md` (what we got wrong once and will
> not repeat), `PLANNING.md` (what we're building and why) and `STATUS.md` (what is done, what is
> in flight, what is tested).
> These three files are the contract between sessions. If you are a fresh thread, you need
> nothing else to be productive.

## What this is

MoMo Kasi is a hackathon submission for the **MTN MoMo API Hackathon** (South Africa).
It is a daily-use money app for Mzansi: youth **earn** through micro-gigs, money **circulates**
through stokvels and shared bills, and is **spent** on taxi fare, electricity, school fees and airtime.
It orchestrates three MoMo APIs (Collections, Disbursements, Remittances) over a double-entry ledger.

Target submission: **28 Sep 2026**. Code freeze: **27 Sep 2026**. Solo developer + agents.

## Non-negotiable rules

1. **Money is `bigint` minor units (cents). Never `float`, never `number` for amounts.**
   Every monetary column is `bigint`. Every monetary TS type is `bigint` or a branded `Minor` type.
   A PR that introduces a floating-point amount is rejected on sight.
2. **The ledger is double-entry and always balances.** Every value movement is >= 2 postings
   summing to zero. No table anywhere else stores a "balance" that is not derived from the ledger.
3. **`main` is protected.** Never commit to `main`. Never `git push --force`. Work on a branch,
   open a PR, let CI go green, then merge. This holds for agents too.
4. **Migrations are forward-only and immutable once merged.** Never edit a migration file that
   is already on `main`. Add a new one.
5. **The browser never touches the ledger.** All ledger mutation happens server-side with the
   service-role key, or inside a `SECURITY DEFINER` Postgres function. RLS denies by default.
6. **Every outbound MoMo call is idempotent**, keyed by a UUID v4 we generate and persist
   *before* the call. Retries reuse the same key.
7. **Free tier only.** No service that requires a credit card or a paid plan. See
   `docs/10-FREE-TIER-BUDGET.md` before adding any dependency or hosted service.
8. **Every PR updates `STATUS.md`.** A change that does not move the status board does not merge.
9. **Never code a MoMo call from memory.** `momoAPIs.md` is the reference. If the fact you need is
   missing or rated `[P]`/`[U]`, confirm it at <https://momodeveloper.mtn.com/API-collections>
   first, then update `momoAPIs.md` **in the same PR** as the code.
10. **No new external API call** without a row in `docs/11-API-USAGE-MAP.md`, added in the same PR.
11. **The AI agent can never move money.** `propose_*` tools have no database write access. The
    agent returns a server-signed proposal; a human tap confirms it. No auto-confirm, no voice
    confirm, at any amount. See ADR-0014.
12. **The agent never emits markup.** It emits zod-validated typed data rendered by a fixed
    component registry. No `dangerouslySetInnerHTML` in the artifact path, ever. See ADR-0013.
13. **Run the phase's audits before declaring a phase done.** Only the audits that phase owes —
    `npm run audit:status` says which. Report only, never fix while auditing, and write the result
    to `STATUS.md`: an audit not written there did not happen. See `PLANNING.md` §11.
14. **Never put a number in an artifact that did not come from a tool call.** Every monetary value
    carries a `sourceTxnId` or `sourceAccountId`. The model does not get to invent amounts.

## Where things live

| Need | File |
|---|---|
| **Mistakes made once, and the guard against each** | **`MISTAKES.md`** |
| Why we're building this, the pitch, scope | `PLANNING.md`, `docs/00-PRODUCT-BRIEF.md` |
| Current state of every workstream | `STATUS.md` |
| **MoMo API facts — paths, headers, schemas** | **`momoAPIs.md`** |
| System design, module boundaries | `docs/01-ARCHITECTURE.md` |
| Database schema, ledger, RLS | `docs/02-DATA-MODEL.md` |
| How we implement against MoMo | `docs/03-MOMO-INTEGRATION.md` |
| Every external API call we make | `docs/11-API-USAGE-MAP.md` |
| How we test | `docs/04-TESTING-STRATEGY.md` |
| Day-by-day plan | `docs/05-DELIVERY-PLAN.md` |
| Git, CI, PR, quality gate | `docs/06-ENGINEERING-STANDARDS.md` |
| How to run parallel agents safely | `docs/07-AGENT-PLAYBOOK.md` |
| Voice, languages, the agent persona | `docs/12-VOICE-AND-CONVERSATIONAL-AI.md` |
| Chat, artifacts, generative UI | `docs/13-CHAT-ARTIFACTS-UI.md` |
| Demo script + fallbacks | `docs/08-DEMO-RUNBOOK.md` |
| Risks and mitigations | `docs/09-RISK-REGISTER.md` |
| Free-tier limits and headroom | `docs/10-FREE-TIER-BUDGET.md` |
| Phases, and the audits each one owes | `PLANNING.md` §10-11 |
| Audit results | `docs/audits/results/` |
| Project-specific audit rules | `docs/audits/<ID>.project.md` |
| Decisions and their rationale | `docs/adr/` |

## Session start checklist

```
0. cat MISTAKES.md                # do not repeat any of these
1. cat STATUS.md                  # what is done / in flight / blocked
2. git log --oneline -10          # what actually landed
3. gh pr list                     # what is open
4. npm run verify                 # is the tree green right now
5. npm run audit:status           # which phase, and what it owes
```

## Session end checklist

```
0. Made a mistake? Add it to MISTAKES.md WITH A GUARD, not just a note
1. Update STATUS.md (done / tested / blocked / next)
2. Add an ADR if you made a decision that constrains future work
3. Commit on a branch, open a PR, do not merge red
```

## Vocabulary

- **Minor units** — cents. R12.50 is `1250`.
- **Posting** — one row in `ledger_entry`. Positive = debit, negative = credit.
- **Journal** — a set of postings that sum to zero, written atomically.
- **Hold** — funds in an escrow account, owed to a job or a stokvel, not spendable by the user.
- **Terminal state** — `SUCCESSFUL`, `FAILED`, `REJECTED`, `TIMEOUT`. Immutable once set.
- **Split** — deterministic basis-point division of an inbound collection into several accounts.
