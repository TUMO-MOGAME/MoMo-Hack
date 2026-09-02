# MISTAKES.md

**Every mistake gets written down here, once, with the rule that stops it recurring.**

Read this at the start of every session. It is short on purpose — if it grows past what a person
will actually read, the oldest entries have earned their way into automation and should be deleted
from here and cited from the guard instead.

## How to write an entry

Four parts, in this order. An entry missing the fourth part is not finished.

1. **What happened** — plainly, no hedging.
2. **Why** — the root cause, not the surface symptom. "I was careless" is never a root cause.
3. **The rule** — what to do differently, stated as an instruction someone can follow.
4. **The guard** — the thing that enforces the rule when nobody remembers it. A script, a test, a
   CI check, a line in `CLAUDE.md`. **A rule with no guard is a wish.**

Prefer a guard that makes the mistake *impossible* over one that merely detects it.

---

## M1 · Merged a pull request against a stale head

**What happened.** I chained `git push` and `gh pr merge` in one `&&` command. GitHub had not yet
registered the pushed head, so the squash merged an older commit. `main` ended up with the
documentation and **none of the code** — no `src/`, no `tsconfig.json`. Found it minutes later
because `src/domain` looked empty; recovered from local objects.

**Why.** I treated a push as synchronous from GitHub's point of view. It is not — there is a window
where the API still reports the previous head.

**The rule.** Never merge in the same command as the push. Always assert that the PR's head SHA
equals local `HEAD` before merging.

**The guard.** `npm run pr:merge` (`scripts/safe-merge.mjs`) refuses to merge unless the SHAs match.
Use it instead of `gh pr merge`.

---

## M2 · A deleted branch was not deleted, and became a conflicting duplicate PR

**What happened.** `gh pr merge --delete-branch` on PR #1 reported success but left the remote
branch alive. A second PR (#6) was later opened from it. Because #1 was a *squash*, the original
commits were no longer ancestors of `main`, so GitHub reported a conflict on content that was
already merged. Merging it would have **reverted nine files**, including the live-verified MoMo test
numbers.

**Why.** Two compounding causes: I trusted a flag's exit code instead of verifying the outcome, and
I did not appreciate that squash merges leave old branches looking permanently divergent.

**The rule.** After every merge, prune and verify the branch is actually gone. When a PR conflicts,
first ask *"is this content already on main by another route?"* before resolving anything by hand —
a stale duplicate must be **closed**, never merged.

**The guard.** `scripts/safe-merge.mjs` prunes and asserts the branch is gone after merging. It also
prints any remaining remote branches, so a survivor is visible immediately.

---

## M3 · Put a computed number in the docs without running the code

**What happened.** `docs/01` and `docs/08` both said a R12.50 fare splits to driver **R3.12**,
insurance **R0.63**. The real deterministic tie-break gives driver **R3.13**, insurance **R0.62** —
at an equal fractional part the lower-indexed component takes the remainder cent. I had done the
arithmetic in my head. The demo script quoted the wrong figure.

**Why.** A number that *looks* obvious got written from intuition instead of from execution. It
would have been contradicted live, on screen, by our own console, in front of judges.

**The rule.** **No computed figure enters a document unless it came out of running the code.** This
applies to split amounts, balances, timings, percentages, and anything on a slide.

**The guard.** `tests/property/split.test.ts` pins the exact R12.50 split as a regression test. If
the algorithm or the doc ever disagree again, the suite fails. Extend this pattern: any figure that
appears in a doc *and* in code gets a test that pins it.

---

## M4 · Switched branches in a working tree an agent was using

**What happened.** The backend agent was working in `C:\MoMo-Hack` with uncommitted, untracked
files. I ran `git checkout main` in that same directory to verify a merge. The files survived
because they were untracked, but this was luck — a checkout that wanted those paths would have
destroyed hours of work.

**Why.** I launched agents without giving them isolated worktrees, despite `docs/07` §8 specifying
exactly that, and then used the shared tree for my own git operations.

**The rule.** **Every agent gets its own worktree before it starts.** The main tree is mine; I never
run `git checkout` in a directory an agent is working in.

**The guard.** `npm run agent:worktree -- <branch>` creates the isolated tree. Agent briefs must
name the worktree path, not the repo root. `git worktree list` before any branch switch.

---

## M5 · Announced a problem I had not verified

**What happened.** On finding agent files in my working tree, I told Tumo both agents were sharing
one directory and called it my error. The frontend agent had in fact already created its own
worktree at `C:\MoMo-Hack-fe`. Half the reported problem did not exist.

**Why.** I inferred a cause from partial evidence and reported it before checking `git worktree
list` — one command that would have shown the truth.

**The rule.** Verify before reporting a fault, and that includes faults I am attributing to myself.
An unverified self-blame is still a false report, and it wastes the user's attention on a
non-problem.

**The guard.** State findings only after the command that proves them. If a claim is provisional,
say "checking" — never assert it.

---

## M6 · Shell heredocs silently corrupted prose

**What happened.** Writing Markdown through a bash heredoc, backticks inside the text were
command-substituted by the shell. A `docs/08` cross-reference was replaced by an error message and
an empty string, leaving `(  §3)` in the file. A separate heredoc failed outright mid-document.

**Why.** Prose containing backticks, `$`, and quotes is hostile input to a shell. Markdown is full
of all three.

**The rule.** **Never write prose through a shell heredoc or `python -c`.** Use the Write tool for
any file containing Markdown or code. Reserve shell text-editing for single-line, mechanical edits.

**The guard.** After any scripted edit to a document, grep the touched region for the mangling
signatures: `(  §`, `No such file`, an empty backtick pair.

---

## M7 · Chained two `sed` commands that re-matched each other

**What happened.** Swapping two env var names, I ran `s/GROQ/GEMINI/` then `s/GEMINI/GROQ/` in the
same pipeline. The second undid the first and then some, producing `GROQ_API_KEY` twice and no
Gemini key at all.

**Why.** Sequential substitutions operate on each other's output, so a swap cannot be expressed as
two ordered replacements.

**The rule.** Never chain substitutions where one's output can match the next's pattern. For a swap,
go through a placeholder, or do it in a single pass.

**The guard.** After any scripted edit, print the changed region and read it. Every entry in this
file that involves `sed` was caught by looking; the ones that hurt were the ones I did not look at.

---

## M8 · Trusted a 200 from a route that returns 200 when it fails

**What happened.** `POST /api/momo/callback/collection` returned **200** from the public internet,
and `STATUS.md` recorded that as "MTN can reach our callback" — verified, twice, in two sessions.
It was reachable. It had also **never once reached the database**. `ensureMoneyDb()` had exactly
one caller in the whole codebase — `/api/health` — and `setMoneyDb` writes a module-scoped
singleton that serverless isolation does not share between routes. So the callback route threw
`no database adapter configured` on every request, and its own catch block, which returns 200
unconditionally so that a probe learns nothing, swallowed it. The sibling route with no such catch
(`/api/cron/reconcile`) was 500ing on every tick, and nobody had called it with a valid bearer.

**Why.** Two causes, and the second is the general one.

The specific cause: `next dev` is a single process. Hitting `/api/health` first binds the singleton
for every other route in that process, so the bug is *unreproducible locally* — it exists only
where each route is its own instance.

The general cause: I accepted a status code as evidence of an outcome. A 200 from a route whose
documented behaviour is "return 200 unconditionally" carries **no information about whether the
work happened**. The stronger the route's "never leak anything" posture, the weaker its response
is as evidence — and this one was designed, correctly, to tell an attacker nothing. It told us
nothing either.

**The rule.** **Verify an effect, not a response.** For any endpoint, ask what would be observably
different if it had genuinely worked, and check *that*: a row written, a status transitioned, a
balance moved. Where a route deliberately returns a constant, it can never be verified from its
own response — reach for a sibling that does report, or read the effect directly. And treat any
`catch` that swallows into a success as a place where evidence goes to die.

**The guard.** `tests/unit/ledger/single-writer.test.ts` now reads every `src/app/api/**/route.ts`
and fails when one calls `getMoneyDb` without `ensureMoneyDb`. Proved to fire against a synthetic
violation before being trusted — it names the offending file. It runs in the `Tests` CI job, which
is a required check.

---

## M9 · Every test rolled back, so nothing ever ran twice

**What happened.** `ensureAccount` inserts with `on conflict do nothing` and falls back to a
`SELECT` when the row already exists. The fallback passed **six** parameters to SQL that referenced
**five** of them — `allow_negative` was carried over from the INSERT and used nowhere — so Postgres
refused the statement outright: `could not determine data type of parameter $5`.

That branch runs **only when the account already exists**. So the first journal against any account
succeeded and every one after it threw. **The ledger worked exactly once.** The first real
collection in the project's history passed; the second failed, and would have kept failing forever.

**Why.** Not the typo — the typo is ordinary. The reason it survived a 361-test suite that includes
property tests and real-Postgres integration tests is that **every integration test rolls back**.
`inRollback` is the right default and it is why the suite can run against the production project
without seeding or cleaning. But it means no test had ever seen a **committed** account, so the
entire `on conflict` branch — half of `ensureAccount` — was dead code as far as the suite was
concerned. Unit tests could not help either: the in-memory adapter has no SQL to get wrong.

The general shape: **a rolled-back test suite proves the first use of everything and the second use
of nothing.** Anything whose behaviour depends on state already existing — upserts, caches,
idempotency keys, "create if missing" — is invisible to it.

**The rule.** For any code path that behaves differently when a row already exists, write a test
that **calls it twice in the same transaction** and asserts the second call agrees with the first.
Rolling back afterwards is fine; what matters is that both calls happen on the same state.

**The guard.** `tests/integration/ledger-invariants.test.ts` → *"ensureAccount is idempotent"*: two
tests that call `ensureAccount` twice for the same natural key, one subject-scoped and one for the
null/null system key, asserting the same id both times. Proved to fire — reintroducing the sixth
parameter fails both with the original `could not determine data type of parameter $5`.

---

## What has gone right, and why

Worth recording, because these are the patterns to keep:

- **Confidence ratings in `momoAPIs.md` did their job.** Facts sourced from blogs were marked `[P]`
  and never coded against. When measured, **four of six were wrong**. Rating uncertainty instead of
  rounding it away turned a week-three disaster into a Tuesday afternoon.
- **The database-enforced ledger invariants** mean a class of money bug cannot be committed at all,
  rather than merely being detectable in review.
- **Property tests caught M3.** Five thousand generated cases found a doc error that no example test
  and no amount of re-reading would have surfaced.
