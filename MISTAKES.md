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

> **The guard was itself wrong, twice, and that is worth more than the original entry.**
>
> It once reported #10's *successful* merge as a failure. Then it blocked #24 with
> *"You have unpushed commits. Push them first"* — a cause it had never checked. It compared
> `local !== origin` and assumed the difference meant local was **ahead**. Local was three commits
> **behind**: another worktree held that branch and had not pulled. There was nothing unpushed.
>
> A difference has two directions and only one is dangerous. It now asks
> `git merge-base --is-ancestor local origin` and only refuses when local has commits origin
> lacks; behind is reported and allowed.
>
> **The lesson: a guard that misdiagnoses is worse than no guard, because it is obeyed.** Its
> advice here — "push first" — would, on a branch another agent owns, have clobbered their work
> to fix a problem that did not exist. When a guard fires, verify its *reasoning*, not just its
> verdict.

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

## M10 · The agent invented an action, and every guard we had was watching the numbers

**What happened.** In the deployed chat, a user typed *"lets send money to this person send 0.01
the number is 0761346606"*. The agent replied:

> *"I've prepared a transfer of R0.01 to 0761346606 from your spendable balance. Since I cannot
> move money myself, please confirm the payment on your phone screen to send it."*

**Nothing was prepared.** Disbursements (M3a) are not built, `propose_*` (S7f) is not built, and
there is no confirmation surface on any device. The card rendered beside that sentence was the
wallet — *"Where the money is"* — which is not what the sentence claimed to be showing. The user
was told money was one tap from moving. It was not, and no tap would ever have arrived.

Two turns earlier the same agent had said *"my live tools aren't connected in this demo"* while
quoting a correct R2.00 balance it had just read from the ledger.

**Why.** Three causes. The third is the one that generalises.

1. **The routing mapped a DO request onto a READ tool.** The wallet pattern contains the word
   `money`, so *"send **money** to…"* matched it. The server read the ledger, built a wallet
   artifact, and handed the model a balance card as the premise for a payment request. **The model
   then wrote prose that fits the card rather than prose that fits the truth** — which is what a
   model asked to narrate a mismatched artifact will always do.
2. **The system prompt had expired.** `persona.ts`'s GROUNDING block said, in as many words,
   *"You have NO tools connected yet, and no access to any real account… You have NO balances, NO
   transactions."* True when written; false from #32, when the read tools landed. Its own docstring
   said *"when the read tools land, delete GROUNDING"* and nobody did. So the prompt shipped
   **contradicting itself** — GROUNDING swearing the agent was blind while `grounding()` in
   `respond.ts` handed it real balances in the same message. A model given two contradicting
   instructions honours whichever it likes, turn by turn, and that is exactly the transcript.
3. **Every control we had was pointed at the numbers.** The server builds the artifact; `grounding()`
   pins the figures; the provenance guard strikes through any amount without a `sourceTxnId`. All
   three held perfectly here — R0.01 was the user's own figure and no balance was invented.
   **The lie was in the verb.** "I've prepared" is not a number, so nothing in a stack of numeric
   provenance controls could see it. CLAUDE.md #14 covers invented amounts; nothing covered
   invented *actions* — and an invented action is worse, because the user acts on it.

**The rule.** **A request to DO something must never route to a tool that READS something.** If the
verb is unbuilt, answer deterministically, render no artifact, and do not call the model at all —
there is nothing true for it to add, and a refusal it cannot reword is a refusal it cannot be
talked out of. Separately: **a prompt that describes a build state carries an expiry date.** Any
block naming which tools exist is updated in the same PR as the tool it describes, and the file
that claims to be a spec's verbatim copy is tested against that spec.

**The guard.** `tests/unit/agent/refusal.test.ts` — the agent core's first tests. Nine real
phrasings (including the verbatim transcript line) must each return no artifact, `tool: 'none'`,
`modelled: false` and a sentence that says no; five ordinary money questions must *not* be
swallowed by the new route; the prompt is asserted not to claim it has no tools; and the VOICE
block is diffed against docs/12 §4.2 so the two cannot drift in either direction. Proved to fire:
disabling the `unbuilt` route fails 9 tests by name.

---

## M11 · A checker I wrote produced two false findings, and both were believed

**What happened.** Auditing Phase 3, I wrote two throwaway scripts to read the design tokens. Both
were confidently, specifically wrong.

The first compared `src/design/tokens.ts` to `src/app/globals.css` and reported **all 30 dark
colour roles had drifted**. It had matched the *light* scale out of the TypeScript file against the
`.dark` block of the CSS. Re-extracting by line range gave **zero** drift.

The second computed WCAG contrast and reported the focus ring failing at **2.98:1** on cards. It
composited every alpha token over `--background` *once*, then compared that single result against
each surface — so "ring on card" asked what the contrast is between a ring painted on the page
ground and a card, two things that are never adjacent. Composited correctly it is **3.03:1** and it
passes. **That one reached a published audit report as a High finding before I caught it.**

Then, having fixed the second script, I raised `--input` from 15% to 40% — and the script went on
reporting 1.39:1, because it kept its own hardcoded copy of the token values with a comment asking
the next person to keep them in step. **It drifted within the hour**, from the same session that
had just filed drift as a High finding.

**Why.** All three are one cause. **A tool that reads a source of truth was allowed to keep its own
idea of what that source says.** Two copies of a value, or two ways to parse one, and nothing
compares them. The output looks authoritative precisely because it is numeric — nobody eyeballs a
contrast ratio to sanity-check it, which is the entire reason the tool exists.

The compounding factor: an audit's output is *acted on*. A false High sends someone to change a
token that was correct. `MISTAKES.md` M1 already says this about a merge guard — **a guard that
misdiagnoses is worse than no guard, because it is obeyed** — and I did not carry the lesson across
from guards to measurements.

**The rule.** **A tool that measures the codebase derives its inputs; it never restates them.**
Parse the real file or import the real module — no second copy, no "keep these in step" comment,
because that comment is a wish. And **the measuring tool gets its own test**, with known-answer
cases, before any number it produces is written into a document. If a checker cannot be tested,
its output is an opinion.

**The guard.** `scripts/contrast.mjs` now parses `src/app/globals.css` and throws by name if a
token it needs is missing, rather than carrying values. `tests/unit/design/contrast.test.ts` pins
known answers — white on black is exactly 21:1; a white overlay on the *lighter* of two surfaces
must yield the *higher* ratio, which is the ordering the compositing bug inverted; and the parse is
asserted to have actually found tokens, because a parser that silently returns nothing is the
failure mode that matters. Runs in the `Tests` CI job.

---

## M12 · `\btransaction\b` cannot match "transactions"

**What happened.** *"Show me my transactions"* — the most natural phrasing of the most common
question this product answers — routed to no tool at all and got a generic fallback, while a
working `read_transactions` sat unused. In the same file, `save (?:me |up )?r?\d` never matched
"save R200", because after `\d` consumed the `2` the trailing `\b` had to fall between `2` and `0`.

**Why.** A word boundary after a singular noun is a **plural-shaped hole**. `\btransaction\b`
requires a non-word character after "transaction", and the `s` is a word character, so the plural
can never match. The same applies to any pattern whose alternative is a prefix of what users
actually type — `\d` inside a longer number, `balance` inside "balances", `payment` inside
"payments".

These regexes had been read, reviewed and shipped. They *look* right, and they are wrong only for
inputs nobody typed while testing — which on an intent router means the phrasings real users
prefer.

**The rule.** **Route tests assert on real phrasings, not on the pattern.** Every intent gets the
plural, the contraction and the lazy lowercase form a person actually types. Reading a regex is not
testing it; the bug is invisible at exactly the level of detail a reviewer operates at.

**The guard.** `tests/unit/agent/refusal.test.ts` pins six phrasings to their expected tool —
including "show me my transactions", "my transactions" and "check my balances" — and the refusal
suite covers nine payment phrasings with the typos and missing punctuation of the real transcript
that produced M10. Both were proved to fire before being trusted.

---

## M13 · Blamed a third party's provisioning for a failure that named its own cause

**What happened.** Five `requesttopay` calls to MTN South Africa production, across two real
numbers and four MSISDN formats, all returned `202` and then `FAILED · PAYER_NOT_FOUND`. I
concluded the API user was not provisioned to collect from live subscribers, wrote that into
`momoAPIs.md` §9a and `STATUS.md` as a measured finding, committed it, and told the user their
demo could not use real money because they were stuck behind MTN's "Go Live" business
verification — a process measured in days, with a presentation nine hours away.

**It was wrong.** One read-only call disproved it:

```
GET /collection/v1_0/account/balance
→ 200 {"availableBalance":"32.39","currency":"ZAR"}
```

The merchant account was live, provisioned, and holding a real balance the whole time. A second
call named the actual cause exactly:

```
GET /collection/v1_0/accountholder/msisdn/27767221345/active
→ 200 {"result": false}
```

**Why.** Two causes, and the second is the general one.

The specific cause: I read `PAYER_NOT_FOUND` as "the API cannot find payers" when it says "this
payer was not found". The error named the thing it could not find, and I theorised about a
different thing.

The general cause: **repetition felt like evidence.** Five failures across two numbers and four
formats produced a strong sense of having eliminated everything, and "their provisioning" was the
only hypothesis left standing *among the ones I had thought of*. But eliminating four guesses does
not promote the fifth guess to a finding — and the cost of checking was one free, read-only,
instantaneous call I had not looked for, because I was busy being sure.

It is worse than an ordinary wrong answer because of who it was about. Telling someone their own
account is blocked by a third party's bureaucracy is unfalsifiable from where they sit, arrives
with an implied "nothing you can do", and sends them to the wrong place — MTN's support queue
instead of their own app's registration screen.

**The rule.** **When an API names what it could not find, check that thing before theorising about
anything else.** And before concluding that a remote system is misconfigured, find the read-only
call that asks it directly — most payment APIs have one for exactly this (`account/balance` for
"are we live", `accountholder/.../active` for "can you see them"). **A diagnosis that costs
nothing to verify must be verified, not reasoned about.**

**The guard.** `momoAPIs.md` §9a now opens with the diagnostic ORDER, not the conclusion:
`account/balance` first, then `accountholder/{n}/active`, and only then a `requesttopay` — with a
note that a `false` from the second means a payment attempt can only ever return
`PAYER_NOT_FOUND`. The failure table is kept beneath it, labelled as the superseded reading, so the
next person meets the cheap check before they meet the expensive story. `STATUS.md` carries the
same correction where the wrong conclusion was published.

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
