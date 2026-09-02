# 07 — Agent Playbook

How to run several Claude agents in parallel without producing a merge disaster.

---

## 1. The failure mode we are designing against

Parallel agents fail in one specific way: **two agents independently invent the same abstraction,
differently.** Agent A writes a `Money` type as a branded number. Agent B writes one as a class.
Both PRs are individually good. Together they are three hours of reconciliation, and the second
merge silently breaks the first.

The fix is not better prompts. It is **freezing the contracts before any fan-out**.

> **Rule 1: Contracts before parallelism.**
> Types, schema, and function signatures are written by one mind (yours, with one agent at most),
> merged to `main`, and only then do agents fan out to implement against them.

---

## 2. Contract-first phase

Before any wave, these must be merged to `main`:

| Contract | File | Frozen by |
|---|---|---|
| Database schema | `supabase/migrations/**` | Day 4 |
| Generated DB types | `src/types/database.ts` | Day 4 |
| Domain types (`Money`, `AccountRef`, `JournalSpec`, `TxState`) | `src/domain/types.ts` | Day 4 |
| Error taxonomy | `src/lib/errors.ts` | Day 3 |
| MoMo client interface | `src/lib/momo/types.ts` | Day 6 |
| API route contracts (zod schemas) | `src/lib/contracts/**` | Day 6 |
| Design tokens | `src/styles/tokens.css` | Day 12 |

Changing a frozen contract is allowed — but it is **your** PR, merged alone, with every in-flight
agent branch rebased afterwards. Never let an agent change a contract as a side effect of
implementing a feature.

---

## 3. Ownership map

An agent owns a **disjoint file tree**. Two agents in the same wave never share a directory.

| Wave | Agent | Owns exclusively | May read | Never touches |
|---|---|---|---|---|
| W1 | `momo-client` | `src/lib/momo/**` (except `emulator/`) | `src/domain/types.ts` | migrations, `src/server/**` |
| W1 | `ledger` | `src/domain/ledger/**`, `src/domain/split.ts` | `src/types/database.ts` | `src/lib/**`, `app/**` |
| W2 | `momo-emulator` | `src/lib/momo/emulator/**` | `src/lib/momo/types.ts` | the real client |
| W2 | `escrow` | `src/domain/escrow/**`, `src/server/escrow/**` | domain types | `src/lib/momo/**` |
| W3 | `telegram` | `src/lib/telegram/**`, `app/api/telegram/**` | `src/server/**` | `src/lib/momo/**` |
| W3 | `ussd` | `src/lib/ussd/**`, `app/ussd-simulator/**` | `src/server/**` | `src/lib/telegram/**` |
| W4 | `ui-commuter` | `app/(app)/pay/**`, `app/(app)/wallet/**` | `src/server/**` | other `app/(app)` routes |
| W4 | `ui-worker` | `app/(app)/jobs/**` | `src/server/**` | other `app/(app)` routes |
| W4 | `ui-rank` | `app/(app)/rank/**` | `src/server/**` | other `app/(app)` routes |
| W5 | `stokvel` | `src/domain/stokvel/**`, `src/server/stokvel/**`, `app/(app)/stokvel/**` | domain types | everything else |
| W5 | `bills` | `src/domain/bills/**`, `app/(app)/bills/**` | domain types | everything else |
| W6 | `tests-e2e` | `e2e/**` | everything (read-only) | any `src/**` |
| W6 | `tests-load` | `tests/load/**` | everything (read-only) | any `src/**` |

**Shared files are yours alone.** `package.json`, `src/types/**`, `supabase/migrations/**`,
`.github/**`, `CLAUDE.md`, `PLANNING.md`, `momoAPIs.md` — an agent that needs a change to one of
these **asks**; it does not edit.

`STATUS.md` is the exception: agents append to their own row and nothing else. Conflicts there are
trivial to resolve.

---

## 4. The agent brief template

Every agent gets this. Vagueness here is what produces work you have to throw away.

```markdown
## Task
<One sentence. One workstream from STATUS.md.>

## You own these paths, and only these
- src/domain/ledger/**
- tests/unit/ledger/**

## Do not touch
- supabase/migrations/**   (schema is frozen — if you need a change, STOP and report)
- src/types/**             (contracts are frozen)
- Any file outside your owned paths

## Read first
- CLAUDE.md
- docs/02-DATA-MODEL.md §2, §3
- src/domain/types.ts        (the contract you implement against)

## Acceptance criteria
- [ ] `split(amount, bps[])` returns parts summing exactly to `amount`, for all inputs
- [ ] Remainder distributed largest-fractional-part first, ties broken by stable order
- [ ] Property test with >= 5000 fast-check runs, green
- [ ] `npm run verify` passes
- [ ] Coverage on src/domain/ledger >= 95%

## Constraints
- Money is bigint minor units. No floats. No Number(). No toFixed().
- src/domain is pure: no I/O, no env, no imports outside src/domain.
- Conventional Commits.

## Deliverable
A branch `agent/w1-ledger-split`, pushed, with a PR opened against main.
DO NOT MERGE. Report what you did and what you were unsure about.

## If you get stuck
Report the blocker. Do not work around a frozen contract. Do not widen your scope.
```

---

## 5. Wave schedule

Waves map onto `docs/05-DELIVERY-PLAN.md`.

| Wave | Days | Agents in parallel | Your job while they run |
|---|---|---|---|
| W0 | 2-3 | **none** | Scaffold, pipeline, walking skeleton. Do this yourself — it is all integration. |
| W1 | 4-6 | 2 (`ledger`, `momo-client`) | Schema, contracts, reviewing |
| W2 | 7-9 | 2 (`momo-emulator`, `escrow`) | Reconciler, state machine |
| W3 | 10-14 | 2 (`telegram`, `ussd`) | Web shell, auth, design system |
| W4 | 13-16 | 3 (`ui-commuter`, `ui-worker`, `ui-rank`) | Fare/QR flow, integration |
| W5 | 15-18 | 2 (`stokvel`, `bills`) | Remittances, wiring |
| W6 | 19-22 | 2 (`tests-e2e`, `tests-load`) | Offline, console, polish |
| W7 | 23-26 | **none** | Rehearsal, deck, video. No new code. |

**Never more than three agents at once.** The bottleneck is not agent capacity, it is your review
capacity. Four agents produce four PRs you cannot properly read, and unreviewed merged code in a
money system is how you lose.

---

## 6. Merge protocol

1. Agent pushes a branch and opens a PR. **Agents never merge.**
2. CI runs the full quality gate.
3. **You read the diff.** All of it. Especially anything touching money, RLS, or a state transition.
4. Merge one PR at a time, squash. After each merge, the remaining agent branches rebase onto `main`.
5. If two PRs conflict, the smaller one rebases. If they conflict *semantically* — same abstraction,
   different shape — close both, decide the shape yourself, and re-brief.

> **Rule 2: One merge at a time.** Sequential merges with a rebase between them cost minutes.
> Parallel merges cost hours.

---

## 7. What agents are good and bad at

Assign accordingly. This is the difference between a 2x speedup and a net loss.

**Good — hand these off freely:**
- Implementing against a frozen, well-specified interface
- Writing test suites from an explicit matrix (`docs/04` §6 is a gift to an agent)
- Repetitive surface work: CRUD screens, form validation, RLS policies from the §4 matrix
- Recording fixtures and building the emulator from them
- Documentation of code that already exists

**Bad — do these yourself:**
- Anything requiring a decision not already recorded in an ADR
- Integration across boundaries two agents own
- Debugging a failure whose cause is not yet localised
- Schema design
- Anything touching the ledger invariants
- The demo script and rehearsal

**The tell:** if you cannot write the acceptance criteria as checkboxes, the work is not ready for
an agent. Make it Ready first (`docs/06` §11), or do it yourself.

---

## 8. Worktree isolation

For agents doing large, long-running features, give them their own git worktree so their working
tree cannot collide with yours:

```bash
git worktree add ../momo-kasi-agent-telegram -b agent/w3-telegram
```

Use it for W3-W5 (the big feature agents). Skip it for small, short tasks where the overhead is not
worth it. The `Agent` tool's `isolation: "worktree"` option does this automatically.

---

## 9. Reviewing agent work

A checklist, because reading a large diff at speed is where mistakes get merged:

- [ ] Did it stay inside its owned paths? (`git diff --name-only main...` against the brief)
- [ ] Any float where money should be `bigint`?
- [ ] Any new external API call? Then `docs/11-API-USAGE-MAP.md` must have grown a row.
- [ ] Any migration? Then it must be new, never an edit to an existing one.
- [ ] Any RLS policy? Then it must have both an allow and a deny test.
- [ ] Any state transition? Then it must be guarded, not read-then-write.
- [ ] Any `catch` that swallows an error silently?
- [ ] Do the tests actually assert, or do they just execute the code?
- [ ] Does it use a sandbox test MSISDN, or a random number that always succeeds?

That last one catches a genuinely dangerous class of green-but-meaningless test
(`momoAPIs.md` §10).

---

## 10. Sessions and continuity

Agents start cold. The context they need lives in files, not in your head:

- `CLAUDE.md` is loaded automatically — that is why the non-negotiable rules live there.
- `STATUS.md` tells them what exists already.
- `momoAPIs.md` stops them coding MoMo from memory.
- The brief tells them their boundary.

**If an agent keeps making the same mistake, the fix is a file, not a longer prompt.** Add the rule
to `CLAUDE.md` and it applies to every future agent and every future session automatically.
