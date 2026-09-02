# MoMo Kasi — Status Board

**This file is the single source of truth for "where are we".**
Every PR must update it. If you are a fresh session, read this before touching anything.

- **⏰ PRESENTATION: Thu 3 Sep 2026, 09:30.** Everything below is now read against that, not
  against the 27 Sep code freeze. See **§Tomorrow 09:30** for what is in and what is cut.
- **Last updated:** 2026-09-02 (session 5 — the agent claimed a payment it had not made
  (`MISTAKES.md` M10, fixed in #35), and **Phase 3's six audits ran**: 0 Critical, 13 High)
- **Phase:** Phase 3 — money engine. **Exit criterion met**; its six audits are still owed.
- **Local path:** `C:\MoMo-Hack`
- **Repo:** <https://github.com/TUMO-MOGAME/MoMo-Hack> — **public**, `main` **protected**, and as of
  this session **8 required status checks with `strict` on**, so a branch must be up to date with
  `main` before it merges.
- **Deployed:** <https://momo.tumoolo.tech> — live, public, and now the canonical host. The
  `mo-mo-hack.vercel.app` alias still serves the same deployment. Production deploys on every
  merge, previews on every PR.
- **Database:** live. 3 migrations applied to Supabase `edtduvwbejdfahkmfort` (`eu-west-2`).
- **Tree state:** 420 green + 3 skipped over 27 files, 0 vulnerabilities, CI enforcing all of it.
  Both skips are opt-in and announce themselves: the walking skeleton (`MOMO_SKELETON=1`) and the
  write-skew case (`allowWrites`). Both commit permanent rows, so neither runs by accident.
- **Blocked on:** nothing external. **F9 is done** and **the walking skeleton is closed** — a real
  `requesttopay` against MTN's sandbox has been resolved through the deployed function into a
  balanced double-entry journal. Money has moved end to end.

---

## Right now

| | |
|---|---|
| **Current phase** | Phase 3 — Money engine |
| **Phase state** | **Phase 0 closed.** Phase 3 exit criterion met and **all six audits now run** — the phase stays open because the gate says so. |
| **Audits owed at close** | Phase 3: A1 A2 A3 A4 A5 A6 — **all six run 2026-09-02**, results in `docs/audits/results/`. A8 passes, 0 vulnerabilities. |
| **Blocking findings** | **13 High, 0 Critical.** `npm run audit:gate` → *"Gate shut"*. Nineteen of the 22 High/Medium items are perimeter work — headers, auth, loading states, metadata. **Every money-integrity check passed.** |
| **Next milestone** | **PRESENTATION Thu 3 Sep 09:30** — hours away, not days |
| **Days to code freeze** | 25 (27 Sep 2026) |
| **Open PRs** | none. #10, #11, #13-#21, #23-#25, #35 merged. |

### The CI finding, kept because it changes how every merge before it was judged

`STATUS.md` said #10 and #11 were both "green". **Neither was, and CI could not have told us
either way.** All four causes are now fixed in #13, but the record matters more than the fix:

1. **`Audits / A8` failed on every push since PR #2** — `npm ci` rejected a `package-lock.json`
   out of sync with `package.json`. The real cause was the *platform*: npm resolves optional
   dependencies for the OS it runs on, so a lockfile written on Windows omits the `@emnapi/*`
   subtree Linux needs for the wasm bindings behind `sharp` and `@tailwindcss/oxide`.
   Regenerating on Windows could never have fixed it. A `Lockfile` CI job now regenerates on
   Linux and hands back the corrected file as an artifact.
2. **CI ran no tests.** `audits.yml` was the only workflow. No typecheck, no test, no build and
   no lint had ever run on a pull request, so "231 tests green" was an agent's local vitest run.
3. **`npm run lint` could never have passed.** There was no ESLint config at all, so `next lint`
   dropped into an interactive prompt — which also meant `npm run verify` could not complete.
4. **9 vulnerabilities, 3 critical.** Now **0**.

Two of our own guards were also wrong: `safe-merge.mjs` reported #10's successful merge as a
failure, and the no-floating-point guard fired on its own prose in any Windows checkout. Both
fixed, both written up in `MISTAKES.md` terms in #13.

**And the toolchain bump hid 84 tests.** vitest 4 ships Vite 8, which honours `tsconfig.json`'s
`jsx: "preserve"` — the setting Next.js requires — and so stopped transforming `.tsx` at all.
All five component test files failed at import, and the summary still read **`Tests 231 passed`**
because tests that never load cannot fail. The only tell was `Test Files 5 failed` on the line
above. Fixed with an `oxc.jsx` override in `vitest.config.ts` (the key is `oxc`, not `esbuild` —
an `esbuild` block is silently ignored under Vite 8). Two lessons worth keeping:

- **A passing test count is not evidence.** Read the file count too. "231 passed" was true and
  meaningless.
- **This is the argument for the CI gate in one example.** A toolchain bump quietly disabled a
  third of the suite, including the provenance guard that stops the agent inventing a balance
  (CLAUDE.md #14). Nothing but running the whole suite would have found it.

## ⏰ Tomorrow 09:30 — the presentation cut

**The plan below (§Phase board, `docs/05`) is a 28-day plan. The presentation is tomorrow
morning.** These are different problems and this section governs until the presentation is over.

### 🔴 The agent invented an action — found in the live chat, fixed, guarded

**Read this before the demo. It is the failure most likely to have been triggered on stage**, and
it was found by using the product rather than by any test we had.

Typed into the deployed chat: *"lets send money to this person send 0.01 the number is
0761346606"*. The agent answered:

> *"I've prepared a transfer of R0.01 to 0761346606 from your spendable balance. Since I cannot
> move money myself, please confirm the payment on your phone screen to send it."*

**Nothing was prepared.** No transfer, no proposal, no confirmation, no phone screen — M3a and S7f
are both unbuilt. The card rendered beside it was the wallet, *"Where the money is"*. A judge
asking the single most obvious question of a payments app would have been told money was one tap
from moving, and no tap would ever have come.

**Why every existing guard missed it.** They all watch the **numbers** — the server builds the
artifact, `grounding()` pins the figures, the provenance guard strikes through any amount with no
`sourceTxnId`. All three held: R0.01 was the user's own figure and no balance was invented. **The
lie was in the verb.** CLAUDE.md #14 covers invented amounts; nothing covered invented *actions*,
and an invented action is worse because the user acts on it.

Three causes, all fixed:

| | |
|---|---|
| Routing sent a DO request to a READ tool | the wallet pattern contains `money`, so *"send **money**"* matched it. The model was handed a balance card as the premise for a payment request, and wrote prose that fit the card instead of the truth. There is now an `unbuilt` intent, matched **first** |
| The system prompt had expired | `persona.ts` GROUNDING still said *"You have NO tools connected yet… NO balances, NO transactions"* — true when written, false since #32. So the prompt **contradicted itself**, swearing the agent was blind while `grounding()` handed it real balances in the same message. That is why one turn quoted a true R2.00 and the next said *"my live tools aren't connected"*. Replaced by CAPABILITY, which states both halves: reads work, payouts do not |
| `HELP_TEXT` and `ABOUT_TEXT` said the same | `/about` told anyone who asked *"I have no tools wired up, so I can't read a balance. If I ever quote you an amount, I've made it up."* On a Telegram bot, to judges, about the one thing the product does well |

**The shape of the fix, and it is the part worth defending on stage.** The `unbuilt` route reads
no ledger and **never calls the model at all** — so there is no card to write misleading prose
against and no sentence to talk out of its refusal. Deterministic refusal is the safety mechanism,
not the fallback.

Verified against a running server, not asserted:

| Asked | Result |
|---|---|
| the verbatim transcript line | *"I can't send money to anyone yet, so nothing has been set up and nothing is waiting for you to confirm…"* · no artifact · `tool: none` · `modelled: false` |
| *"who can i send money to?"* | same refusal, no artifact |
| *"how much do i have"* | still `modelled: true`, real wallet card, R2.00 spendable |
| *"what can you do"* | now claims the read tools instead of denying them |

**The agent core also had no tests at all** — a debt STATUS has carried since #32, and the reason
this reached production. `tests/unit/agent/refusal.test.ts` is its first: 30 tests, including the
nine phrasings above, five ordinary money questions asserted *not* to be swallowed by the new
route, and a diff of the VOICE block against docs/12 §4.2 so the prompt and its spec cannot drift
again. Proved to fire — disabling the route fails 9 by name. `MISTAKES.md` M10.

**Also fixed: the chat walked the page up the screen.** Reported from real use — after a few
messages the header left the top of the window and a blank band opened under the composer.
`scrollIntoView` does not scroll one box, it scrolls **every** scrollable ancestor, and this
document is scrollable by a small amount almost everywhere: `globals.css` sets `html, body {
height: 100% }` (the *small* viewport) while the chat shell is `h-dvh` (the *dynamic* one). On any
browser that retracts its toolbar those differ, and the difference is exactly the blank band. Now
the message log's own `scrollTop` is set — which cannot touch an ancestor — and the shell carries
`overflow-hidden`.

### Phase 3's six audits ran, and they agree with each other about where the risk is

**A1 A2 A3 A4 A5 A6, all six, results in [`docs/audits/results/`](docs/audits/results/).** A8
passes with 0 vulnerabilities. **0 Critical · 13 High · 19 Medium · 15 Low.**

The gate is **shut** — `npm run audit:gate` names all thirteen — so Phase 3 stays open. That is the
system working as designed, not a setback: an audit suite that never blocks anything is decoration.

**The finding that matters most is the shape, not any single row.** Six audits run independently
converged on the same split:

> **Every money-integrity check passed, structurally.** One ledger writer, enforced by a test that
> reads the source tree. `claimTransition` is `SELECT … FOR UPDATE` + `WHERE prev.status = any(…)`,
> so a read-then-write race cannot be written. `X-Reference-Id` is the persisted row id, so a retry
> cannot double-pay. The split is integer-exact over 5,000+ generated cases. `ROUNDING` sits at
> zero. **Twelve of thirteen Highs are in the perimeter** — headers, auth, loading states,
> metadata, a missing favicon.
>
> The money cannot go wrong. The things standing in front of the money can, and they are the parts
> with the least test coverage. M10, earlier the same day, is that sentence as a live incident.

**Three findings are worth reading in full even if nothing is fixed tonight:**

| | |
|---|---|
| **A5-02** — the outbound prompt is not scrubbed | The user's raw message goes to Gemini verbatim. `src/server/log.ts` has an excellent tested MSISDN scrubber; the model call never calls it. **This is not hypothetical — the M10 transcript contained a real SA mobile number and it was sent to Google.** POPIA s105/106. The fix is one import and two `.map()`s |
| **A3-01 / A3-03** — measured contrast failures | Computed from the OKLCH tokens, not eyeballed. Text contrast is *excellent* (worst pairing 7.26:1 against a 4.5 requirement). But `--input` composites to **1.39:1** and `--border` to **1.27:1** against a 3:1 requirement, and the focus ring lands at **2.98:1** on cards. On a cracked screen in Highveld sun the composer has no visible edge |
| **A2-01** — the token gate does not exist | `tokens.ts` instructs the reader to regenerate CSS with `npm run tokens`. **There is no such script.** `globals.css` is a second hand-maintained copy. Verified 60/60 roles agree *today*; nothing keeps them agreeing |

**A correction worth keeping, because it nearly became a headline.** My first token-drift script
reported **all 30 dark roles drifted** — a confident, specific, entirely false Critical. It had
matched the *light* scale out of `tokens.ts` against the `.dark` CSS block. Re-extracting by line
range gave zero drift. `MISTAKES.md` M5 says verify before reporting a fault; this is the second
time in one session that rule paid for itself, and it is the argument for A2-01's generated gate
over any hand-written checker, mine included.

**What was honestly not measured**, rather than quietly counted as a pass: Core Web Vitals (no
Lighthouse run), axe (never run, Q7 still owed), RLS under a real principal (needs M9a), a
full-history secret scan, screen-reader verification, and anything on the actual target device.
Each is listed in its own report with the reason.

### What we can already show, and it is more than it looks

Everything here is live, public and measured — not a mock:

| | |
|---|---|
| A real product on a real domain | <https://momo.tumoolo.tech> — landing page and chat surface, 200 |
| **Real money moving through MTN** | a real `requesttopay` on the sandbox, resolved by the **deployed** function, into a **balanced double-entry journal**. `MOMO_SETTLEMENT +100 / SUSPENSE −100`, sum `0`, in 66.4s |
| A ledger that cannot be wrong | four invariants enforced by Postgres triggers, verified *firing* |
| A bot | `@momokasi_demo_bot`, webhook registered against the custom domain, secret-verified (401 on a bad secret) |
| Engineering credibility | 390 tests over 25 files, 0 vulnerabilities, 8 required CI checks, and a `MISTAKES.md` with nine entries that each carry a guard |

### `npm run demo` — the presentation, in one command

Built for tomorrow. It prints the whole story in order, and **every number on
screen has an `expect` behind it** — the demo is a test, so it cannot print a
balanced ledger unless the ledger actually balanced. A script that merely prints
is a script that can lie on stage.

```
1  THE SPLIT ENGINE     R12.50 → owner R7.50 · driver R3.13 · fuel R1.25 · insurance R0.62   EXACT
2  A REAL PAYMENT       → requesttopay … ← MTN accepted, status CREATED
3  RESOLUTION           ← resolved, examined 1, resolved 1
4  THE LEDGER           MOMO_SETTLEMENT +R1.00 / SUSPENSE −R1.00 → sum R0.00  BALANCED
5  THE INVARIANT        14 postings in the database, summing to 0
```

**It adapts to its environment and says so in the header.** Standing in front of
judges saying "this is live" while an emulator answers is the one unrecoverable
mistake, so the run announces whether it is the emulator or the real API before
it does anything.

**The fallback is a flag, not a file edit.** ADR-0009 promises the MoMo client
can be swapped "ninety seconds before we present" — a promise worth nothing if
honouring it means editing a dotfile correctly, under pressure, in front of an
audience. So:

```
npm run demo -- --emulator    recorded responses, offline, deterministic
npm run demo -- --api         the real MTN API
npm run demo -- --check       pre-flight only, sends nothing
```

**Both paths are rehearsed and measured**, at the full R12.50:

| Path | Duration | Result |
|---|---|---|
| `--emulator` | **35s** | ledger balanced, sum 0 |
| `--api` (real MTN sandbox) | **70s** | ledger balanced, sum 0 |

**It refuses to spend real money by accident.** `npm run demo -- --check` is a
pre-flight that sends nothing. A live `MOMO_TARGET_ENVIRONMENT` *plus* a real
client is the one combination it will not run without `--live` — because a demo
command is exactly the thing that gets run twice while the projector is being
set up, and the whole budget is about R10.

Two things to know before the room:

- **Every run writes two permanent postings.** `journal` and `ledger_entry` are
  append-only by trigger. Rehearse as often as you like — the ledger still
  balances, which is the point — but the row count grows and cannot be reset.
- **The payment is `AIRTIME`, not `FARE`, and the demo says so.** The split is
  shown *beside* the payment rather than through it, for the reason below. If a
  judge asks whether the split is wired into the live path, the honest answer is
  "not yet — here is exactly what is missing", and that answer is better than a
  vague yes.

### The split: show it, do not wire it (read this before touching M6b)

**The fare split, on the real path (M6b).** Change the walking skeleton's purpose from `AIRTIME`
to `FARE` and the same proven pipeline demonstrates the entire pitch in one command: R12.50 of
real MoMo money splitting 60/25/10/5 into the owner's wallet, the driver's float, the rank's fuel
pool and its insurance pool — four accounts, created on demand, summing to exactly zero.

**Correction, made before this misled anyone.** The first draft of this section said the fare
split was "a purpose string and a posting context". It is not, and reading `resolve.ts` rather
than trusting the summary is what caught it.

`resolveTransaction`'s default context is `{ subjectId: row.subjectId }` and **nothing else**.
`fareSplitPostings` needs `ownerId`, `driverId` **and** `rankId`, and `required()` throws when any
is absent. `momo_transaction` has one `subject_id` column and no way to carry the other two. So
**the deployed reconciler cannot resolve a FARE at all** — it would throw, count `errors: 1`, and
leave the payment unresolved forever. The docstring on `contextFor` says as much: *"the fare route
passes a richer resolver (M6b)"* — that resolver does not exist, and the async path is the only
path a real payment takes.

Closing it properly means giving the row somewhere to put the fare context (a `jsonb` column and a
forward-only migration) and teaching the default resolver to read it. That is an hour of work in
the middle of the money engine, and **it is the wrong hour to spend the night before a demo.**

**What IS free, and still tells the whole story:** the split is a PURE function. `split(1250n,
DEFAULT_FARE_SPLIT)` runs instantly, offline, with no database and no MoMo call, and it is
property-tested across 5,000+ generated cases. Demonstrate the split beside the real payment
rather than through it. Nobody in the room can tell the difference, and it is the truth.

The R12.50 tie-break is pinned by a regression test because we got it wrong in a document once
(`MISTAKES.md` M3): driver **R3.13**, insurance **R0.62**. Quote those figures, not rounded ones.

### MTN's production credentials are real, and verified — but parked

`MTN_*` in `.env.local`, read by nothing. Measured, not assumed:

| | |
|---|---|
| Collection token | **200** against `https://proxy.momoapi.mtn.com`, `X-Target-Environment: mtnsouthafrica` |
| Disbursement token | **200**, same |
| Callback host binding | **UNKNOWN** — production returns `404` for `GET /v1_0/apiuser/{id}`, so it cannot be read |

So the project **already has working production access** and does not need the
portal's "Go Live" application — that is a separate business-verification
process measured in days, and it is in the cut list for exactly the reason
WhatsApp is.

**Why production is not the demo path tomorrow**, despite working:

1. `46733123454` is a **sandbox fixture**. It auto-resolves in ~25s because the
   sandbox pretends. Production sends a real prompt to a real MTN SA subscriber
   who must approve with a PIN — no auto-resolution, and that number does not
   exist on MTN SA.
2. The **callback host binding cannot be read**, and on sandbox a mismatch was a
   hard `500` with no payment created. Unknown, and unknowable without spending.
3. The budget caps a transaction at R1.00, so **R12.50 cannot be demonstrated at
   all** on production — the pitch's own figure becomes unshowable.
4. A live demo would depend on a third party's phone, signal, PIN and timing at
   09:30, with about ten transactions of budget covering testing *and* the show.

The plan: demo on sandbox, and say truthfully that production credentials are
integrated and authenticating. Verify production separately, after, with one
R1.00 transaction to a consenting MTN number — and check the callback binding
first with an invalid MSISDN, which reveals a `500` before any payer is
contacted.

### `/ledger` — the first screen in this product that is not making it up

**The problem it fixes.** Every surface on the site is driven by `mockAgent`
— honest starter scope, clearly labelled, and entirely invented. The pitch is
"money moved, and the books cannot be wrong". A page of plausible fiction argues
the opposite of that, to precisely the audience least likely to take it on
trust. The terminal had the real numbers; the product had the pretty ones. That
is backwards for judges who score design.

`/ledger` reads Postgres and renders what it finds, through the **same artifact
components** the agent will use, with the **same provenance guard** pointed at
it. Verified against a production build:

```
The invariant     0 — 18 postings across 12 accounts, summed
Recent activity   real momo_transaction rows, newest first
The journal       MOMO_SETTLEMENT +R12.50 / SUSPENSE −R12.50 → R0.00
If that had been a taxi fare
                  R7.50 · R3.13 · R1.25 · R0.62
```

**The split is not decorative.** It is the amount of the most recent settled
transaction put through the real `split()`, carrying that transaction's id as
provenance. If no money has moved, no split renders — there would be nothing
true to show.

Checked on the rendered HTML, not assumed: **zero "unverified" markers** (every
amount carries a source), the MSISDN renders as `•••• 3454` and the full number
**does not appear in the response** (POPIA s105/106).

**Two boundary problems worth keeping.**

`bigint` cannot cross a Server → Client component boundary — React has no
serialisation for it — and narrowing to `number` to get it across would
reintroduce the exact floating-point bug ADR-0004 exists to prevent, at the last
possible moment. So the boundary carries lossless decimal **strings**, revived
with `BigInt()` on arrival. Types for that shape live in `src/lib/ledger/` so
both sides can hold them.

And **the ADR-0010 guard fired on its own prose.** It asked
`body.includes("'use client'")`, which is true of any file that *mentions* the
directive — so it flagged a server-only module whose docstring warns that client
components must not import it. Same failure as the CRLF one. The directive is
only meaningful as a module's first statement, so the guard now matches a real
directive line, which is strictly **more** accurate. Re-proved to fire against a
synthetic violation before being trusted.

### The chat is real now — and the sidebar stopped contradicting it

`/chat` was driven by `mockAgent`: *"no keys, no network, no database"*. It now calls
`POST /api/agent`, which reads Postgres and answers from it. Measured against a production build:

| Asked | Tool | Answer |
|---|---|---|
| "how much do I have?" | `read_wallet` | *"you have R2.00 spendable cash. You also have R32.00 held at MTN and R30.00 awaiting delivery."* |
| "transactions from 3 months ago" | `read_transactions` | listed what exists, and **said plainly that it only has today's data** |
| "where did my taxi fare go?" | `read_fare_split` | *"R7.50 to the taxi owner, R3.13 to the driver float, R1.25 to fuel, R0.62 to insurance."* |
| "what is the weather" | none | declined, offered what it can do |

**The design that makes this safe: the server builds the artifact, the model writes the prose.**
The model is called *after* the ledger has been read and the card assembled, so there is no code
path from a generated token to a rand value. CLAUDE.md #14 stops being a rule the prompt asks for
and becomes a shape the program has. Intent routing is a regex, not a model choice — a mis-route
shows the wrong card, where a model choosing its own tools could be talked into a dangerous one.

**It answers even when the model does not.** Every intent has a deterministic sentence built from
the same real data. Gemini slow, rate-limited, unconfigured or refusing all degrade to a correct
answer with the correct card. Silence is the one outcome not allowed on a stage.

**Verified live on `momo.tumoolo.tech`, and the fallback proved itself first.** The initial
production deploy answered with `modelled: false` — correct numbers, correct card, no model. Cause:
`GEMINI_API_KEY` was on Vercel as a `sensitive` variable and, exactly like the Telegram pair, was not
effective at runtime. It is now in `npm run env:push`; after a redeploy: `modelled: true`,
*"Howzit! You have R2.00 spendable, R30.00 awaiting delivery, and R32.00 held at MTN."*

That the fallback path was the first thing to run in production, unplanned, and nobody could tell
from the answer, is the strongest evidence it works.

**One core, both channels.** `src/server/agent/respond.ts` is what the web route calls and what the
Telegram handler will call — so "they should both respond the same" is a property of the code
rather than two handlers promising it separately. *Telegram is not cut over yet.*

**The rail is real too, and that mattered more than it looks.** It was `contextSnapshot()` — a mock.
A sidebar stating R2,300 beside a reply stating R12.50, from the same database, is the
contradiction a judge notices before you finish the sentence. It now reads `/api/context`, groups
balances by account type (ungrouped it rendered "Held at MTN" three times, which reads as a bug),
and **`next` became optional** — there are no bills or stokvel schedules in the ledger, so the
block is omitted rather than inventing a due date next to real money.

### Mandates — planned, decided, not built (ADR-0017)

The next major feature, and it collided head-on with CLAUDE.md #11. *"Save R200 a month for my
daughter"* and *"every month end buy Gogo electricity"* both move money with nobody present, which
ADR-0014 forbids in as many words.

**Resolved by moving the authorisation earlier, not by weakening it.** A standing mandate is a
debit order: signed once, bounded in rands, stated before signing, mandatory expiry, and executed
by deterministic server code with **no model in the call path**. Stricter than today, where a model
drafts every payment.

Also decided, and it is the part most likely to be got wrong later: **a PIN typed into a chat is
not a secret.** It lives in the chat history, the lock-screen preview, the bot process and any log
of the update — and deleting the message afterwards fixes none of that. The PIN is therefore never
entered in the conversation on either channel; a one-time token opens a Telegram Mini App or a web
page, and the value posts straight to the confirm endpoint. `scrypt` from `node:crypto`, so no new
dependency and no lockfile risk.

Full reasoning in **ADR-0017**. Nothing is built. It sits on six unbuilt foundations — auth (M9a),
disbursements (M3a), the outbox drain (M3b), the scheduler (F8), zod validation (S7c) and the agent
write path — and auth blocks the most.

### What the frontend still owes, in honest order

| | |
|---|---|
| **Auth (M9a)** | none at all. Blocks the RLS policy from ever being exercised, and blocks S7f's signed proposals from having an identity to sign for. |
| **A real agent (S7a/S7b)** | `/chat` is still `mockAgent`. Every number there is invented, and it is the surface a judge will click first. |
| **Zod artifact schema (S7c)** | a TypeScript union with a `TODO`; no runtime validation. Harmless while no agent produces artifacts — a hard blocker the moment one does. |
| **Commuter / worker / rank views (M9b-d)** | not started; all three need auth and data models that do not exist. |
| **axe accessibility pass (Q7)** | owed. Judges score design, and this is the cheapest credibility in the list. |

### Cut for tomorrow — stated so nobody burns the night on them

WhatsApp was already rejected on Day 1 (ADR-0007) — Meta approval cannot be completed in the
window, and Telegram needs no registration at all. **Also out of the presentation cut, for the
same reason — anything gated on a signup, an approval, or a queue:** USSD via Africa's Talking
(S1), ElevenLabs voice (S8b), Supabase Storage proof upload (M4b), auth (M9a), and every SHOULD
item in §4 and §4b.

They are not cancelled. They are not tomorrow.

### The fallback, and rehearse it

`MOMO_MODE=emulator` swaps the whole MoMo client for recorded responses, per request, no redeploy
(ADR-0009, `docs/03` §5). **Practise the switch before you need it.** If MTN's sandbox is down at
09:30 the demo continues and nobody in the room can tell.

Second fallback: the numbers above are already in this file. If the network dies entirely, the
story is still tellable from the measurements.

### One budget warning for the stage

`MOMO_TARGET_ENVIRONMENT=sandbox`, so demo money is not real and you may run it as often as you
like. **If anyone swaps in production credentials, that stops being true instantly** — the whole
live budget is about R10 and `src/lib/momo/budget.ts` caps a live transaction at R1.00. MTN's
newly-issued keys are parked in `.env.local` under `MTN_*` names that **nothing reads**, precisely
so they cannot break the demo before it happens.

### The next three actions

**Superseded — the six audits are done.** What they found reorders the queue, and the top of it is
now roughly two hours of work with a disproportionate return before 09:30:

1. **The seven cheap Highs, in this order.** None is a redesign; several are one line.
   - **A5-02** — apply the existing `scrub()` to the outbound Gemini prompt. One import, two
     `.map()`s. It is a POPIA leak that has *already happened once*.
   - **A3-03 / A3-01** — raise `--ring` to ~50% and `--input` to ~38%. Two values, and they close
     three WCAG failures measured at 2.98:1, 1.39:1 and 1.27:1.
   - **A6-02 / A6-01** — a favicon and Open Graph tags. Right now the tab is blank and every link
     shared into WhatsApp is a bare grey URL.
   - **A4-01** — `loading.tsx` for `/ledger`, using the `ChipSkeleton` that already exists. That
     route measures **722–1432 ms** and currently looks frozen.
   - **A3-02** — one `<h1>` on `/chat`, which has none at all.
   - **A5-01** — four header lines in `next.config.ts` (`nosniff`, `Referrer-Policy`,
     `frame-ancestors`, `Permissions-Policy`). CSP can follow report-only.
2. **The scheduler (F8).** The reconciler works in production but **nothing calls it on a
   timer** — every tick so far has been a human with `curl`. ADR-0006.
3. **Disbursements (M3a).** Nothing pays anybody out yet. Money can come in and stop; it cannot
   leave. It is also what lets the agent stop refusing every payment request (see M10).

### ✅ THE WALKING SKELETON IS CLOSED (Phase 0)

*"A real `requesttopay` from the deployed function, resolved by the reconciler, writing balanced
ledger rows."* Done, and measured rather than asserted:

```
momo_transaction  SUCCESSFUL  100  SKELETON-1788365755412  AIRTIME  attempts=1
journal d6df990b    MOMO_SETTLEMENT   +100
                    SUSPENSE          -100
                    sum:                 0
initiate → resolved: 66.4s
GLOBAL ledger sum:   0 over 8 rows
```

A second collection was then resolved through the same path (`journal a7cc179a`), which matters
more than the first — see the Critical finding below.

Driven by `tests/integration/walking-skeleton.test.ts`, opt-in behind `MOMO_SKELETON=1` because it
is the one integration test here that **cannot roll back**: `journal` and `ledger_entry` are
append-only by trigger, so a successful run leaves rows in the production project permanently. That
is what it is proving. It refuses to run against any `MOMO_TARGET_ENVIRONMENT` but `sandbox`.

```
MOMO_SKELETON=1 npx vitest run tests/integration/walking-skeleton.test.ts
```

**No seed data was needed.** `ensureAccount` upserts by natural key, so `AIRTIME` — which posts
`MOMO_SETTLEMENT` → `SUSPENSE` with no owner, driver, rank or split rule — creates both accounts
on demand. D2 is still worth having for the demo, but it was not a blocker.

**A deliberate limitation, stated because it would otherwise read as proven:** the test pokes the
deployed reconciler every 5s while waiting, and MTN's callback fires at the same time. Both paths
are live and both are safe to run concurrently (that is the single-resolver guarantee), but **which
of the two actually won the race was not instrumented**. "Resolved by the deployed function" is
proved; "the callback specifically works" is not. M2d stays `[~]` for that reason.

### CRITICAL — the ledger worked exactly once

Found on the **second** collection ever made, in production. `ensureAccount` falls back to a
`SELECT` when `on conflict do nothing` fires, and that SELECT was passed six parameters while
referencing five. Postgres refused it outright:

```
error: could not determine data type of parameter $5
  at ensureAccount           (src/server/db/postgres.ts)
  at writeJournal            (src/server/ledger/journal.ts)
  at postSuccessfulJournal   (src/server/momo/resolve.ts)
```

The failing branch runs **only when the account already exists**. So the first journal against any
account succeeded and every subsequent one threw — the first fare works, the second does not, and
the ledger is stuck forever.

**Why 361 tests missed it.** Every integration test rolls back. `inRollback` is the right default
and it is why the suite can run against the production project with no seeding and no cleanup — but
it means **no test had ever seen a committed account**, so the entire `on conflict` branch was dead
code as far as the suite was concerned. The unit suite could not help either: the in-memory adapter
has no SQL to get wrong. Written up as **M9** in `MISTAKES.md` — *a rolled-back suite proves the
first use of everything and the second use of nothing.*

Fixed, and guarded by two tests that call `ensureAccount` **twice** for the same natural key (one
subject-scoped, one for the null/null system key). Proved to fire: reintroducing the sixth parameter
fails both with the original error.

### HIGH — the MoMo callback host is fixed at provisioning, and a mismatch is a 500

`momoAPIs.md` §4.1 rated this `[P]` and guessed that a mismatched `X-Callback-Url` means
"callbacks are silently dropped". **Measured, it is worse than that: the whole payment fails.**

```
500 {"message":"Callback URL does not match the configured value.",
     "code":"INVALID_CALLBACK_URL_HOST"}
```

Proved as a controlled experiment, because a single 500 could have been the sandbox having a bad
afternoon:

| `X-Callback-Url` | API user bound to `momo-kasi` | rebound to `momo.tumoolo.tech` |
|---|---|---|
| none | 202 | 202 |
| `momo.tumoolo.tech` | **500** | **202** |
| `momo-kasi.vercel.app` | 202 | **500** |

The results invert exactly. `GET /v1_0/apiuser/{id}` confirmed both bindings directly.

**The consequence is operational, and it bites at the worst moment.** The callback host is fixed
when the API user is created and there is no documented way to change it. Moving to a new domain
is **not** an environment-variable change — it needs a **new API user and key**. So the API user
was re-provisioned against `momo.tumoolo.tech` (`MOMO_API_USER` is now `28b81c8c…`), and the new
credentials pushed to Vercel.

Note what this means about the state before today: the project was provisioned against
`momo-kasi.vercel.app`, **a host that 404s**. Requests only ever succeeded because we happened to
name that dead host, and every callback MTN sent went nowhere. The callback path had never worked
and could not have. `momoAPIs.md` §4.1 is promoted `[P]` → `[V]`, §4.3 `[P]` → `[V]`, and §7.1
gained two bullets.

### F9 is done, and the reason it looked undone was not the reason anyone assumed

The variables **had already been set on Vercel**. They were set on the **preview** target only,
and production had none — which is exactly why `momo.tumoolo.tech` reported
`database: unconfigured` while the dashboard looked populated. Not a missing step; a misfiled one.
That is worth remembering the next time an environment looks configured and behaves as though it
is not: **check the target, not just the key list**.

Now set on **production** (15 variables, read back from the API rather than trusted to a 200):
the 5 MoMo values, `DATABASE_URL`, the 3 Supabase values, `CRON_SECRET`, and 5 pinned by policy.

Three of those five are pinned deliberately rather than copied from `.env.local`, because the
local developer environment is *wrong* for production in ways that fail silently:

| Pinned | Value | Why not copied |
|---|---|---|
| `MOMO_MODE` | `sandbox` | `.env.local` says `emulator`. Correct locally, a lie in production — the deployed function would report success while touching no MoMo API at all. |
| `MOMO_CALLBACK_HOST` | `momo.tumoolo.tech` | `.env.local` says `momo-kasi.vercel.app`, which **404s `DEPLOYMENT_NOT_FOUND`**. Measured. Every `X-Callback-Url` we handed MTN would have gone nowhere, and the reconciler would have quietly covered for it. |
| `MOMO_TARGET_ENVIRONMENT` | `sandbox` | Anything else is real money against a ~R10 budget (CLAUDE.md #15). `MOMO_LIVE_MAX_MINOR=100` is pinned beside it so the R1.00 brake is present in the deployed environment rather than relying on a default. |

Repeatable as `npm run env:push` (`scripts/vercel-env.mjs`) — plan-by-default, `--yes` to apply,
`upsert` so a re-run is a rotation rather than an error. It **refuses** to set a non-sandbox
target environment without `--allow-live`, and refuses `MOMO_MODE=emulator` outright.

**Production only, not preview.** Preview URLs 302 to SSO and cannot receive a MoMo callback, so
crediting them buys little — and costs something real: every PR preview would write to the single
production ledger, where the append-only trigger makes those rows permanent. Widen to preview
when F4's second Supabase project exists; it is one flag (`--targets production,preview`).

### The Telegram bot is now wired end to end — after three bugs, none of them in the route

The route itself (#24) is well written. Everything that stopped it working was around it.

**1. The deployed route answered 200 to every request, including a wrong secret.** Its own
`readTelegramConfig()` catch is the only path that can do that — a deliberate choice, since a 500
makes Telegram retry a config problem thousands of times. So one of the two `TELEGRAM_*` values was
falsy at runtime (`requireEnv` rejects an empty string as readily as a missing one). Both keys were
listed on the `production` target but typed `sensitive`, so their values could not be read back to
confirm which. Rewriting them through `npm run env:push -- --with-telegram` (as `encrypted`) and
redeploying fixed it. Measured before and after:

| Request | Before | After |
|---|---|---|
| wrong secret | 200 | **401** |
| absent secret | 200 | **401** |
| correct secret, junk body | 200 | 200 |

**2. `scripts/telegram-setup.mjs` and `scripts/telegram-dev-bridge.mjs` could never run.** Both did
`const env = loadEnv()`, but `loadEnv()` returns `{ env, path }` — not the map. Every lookup was
`undefined`, so both exited with *"TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be
set"* while the keys sat correctly in `.env.local`. Every sibling script destructures; these two
did not. One token each.

> **This one is worth pausing on.** #24 records measurements attributed to
> `telegram-dev-bridge.mjs` — `/start` 0.75s, an agent turn 5.5s, a duplicate `update_id` 8ms, a
> wrong secret 401. **As committed, that script exits before its first network call.** Those
> numbers cannot have come from it in this state. Either they were taken against an unrecorded
> local version, or they were not taken. Same shape as M3: a figure in a document that did not come
> out of running the code that is in the repository.

**3. No webhook was registered at all.** Now set, and verified by reading it back:

```
url               https://momo.tumoolo.tech/api/telegram/webhook
secret set        yes
pending updates   0
last error        none
```

Note the host — `momo.tumoolo.tech`, not the `.vercel.app` alias #24's notes named.

**Still unproven: that the bot actually replies in production.** The route authenticates, the
webhook is registered, and the bot is healthy — but no real message has been round-tripped through
the deployment. Send one to `@momokasi_demo_bot` to close that.

### Split ownership, this session onward

A second agent owns **Telegram (M5a)** in its own worktree. This session stayed out of
`src/app/api/telegram/**` entirely.

It also stayed out of the two Telegram **environment variables**, which matters more than it
looks: a Vercel project's environment is shared mutable state with no merge step. If both owners
set `TELEGRAM_WEBHOOK_SECRET` to different values, every update Telegram delivers 401s — and the
failure is indistinguishable from a bug in the handler, in a file neither owner is looking at.
So `scripts/vercel-env.mjs` puts them behind an opt-in `--with-telegram` flag, and their one
owner is whoever builds M5a. Both were **already** on production and preview and were not touched.

### HIGH — neither money route bound the database, and one of them hid it behind a 200

Found within minutes of F9 landing, by calling the cron route with a correct bearer instead of
assuming it worked. Auth passed (401 without a bearer, 401 with a wrong one, through with the
right one) and the handler then returned **500**.

`setMoneyDb` writes a **module-scoped singleton**, and in serverless every route is its own
isolated instance. `ensureMoneyDb()` had exactly one caller in the entire codebase —
`/api/health`, indirectly through `moneyDbAvailable()`. The two routes that actually touch money
both called `getMoneyDb()` with nothing having bound it:

| Route | Behaviour before the fix |
|---|---|
| `POST /api/cron/reconcile` | **500 on every tick.** Reconciliation could never have run in production. |
| `POST /api/momo/callback/[kind]` | **200, always.** Its catch returns 200 unconditionally, and the comment on that catch names "no database adapter configured" as one of the cases it swallows. |

The second row is the dangerous one. `POST /api/momo/callback/collection → 200` has been recorded
as **verified from the public internet** since F7, and it was — the route was reachable, returned
200, and never once reached the database. **A 200 from a route that swallows its own errors is
not evidence that the route worked.**

Why nothing caught it earlier:

- **`next dev` is one process.** Hitting `/api/health` first binds the singleton for every other
  route in the same process, so the bug does not reproduce locally at all.
- **No test touches the global binding.** The integration suite connects through its own
  `tests/integration/_db.ts` helper, so it exercises the adapter without ever exercising the
  wiring that production depends on.
- **`database: configured` does not mean the database answers.** `moneyDbAvailable()` checks that
  `DATABASE_URL` is present and binds the adapter; it never opens a socket. The health route was
  telling the truth about a narrower question than it appeared to answer.

**Fixed** — `ensureMoneyDb()` at the top of both routes. **Guarded** — a static test in
`tests/unit/ledger/single-writer.test.ts` reads every `src/app/api/**/route.ts` and fails when one
calls `getMoneyDb` without `ensureMoneyDb`. **Proved the guard fires**: commenting the call out
makes it fail with `expected [ 'app/api/cron/reconcile/route.ts' ] to deeply equal []`.

### The Telegram bot now replies

Built and **verified end to end against the live bot** on 2026-09-02. The three blockers in the
previous version of this section are down to one, and it is a BotFather setting rather than code:

| | State |
|---|---|
| Bot itself | ✅ `@momokasi_demo_bot` live, `getMe` 200 |
| **Handler route** | ✅ `/api/telegram/webhook` built (M5a). Secret-verified, `update_id`-deduplicated. |
| **Agent** | ✅ Replies through Gemini `gemini-3.6-flash`, persona from `docs/12` §4.2. |
| **Public HTTPS URL** | ✅ F7 landed. **`https://momo.tumoolo.tech`** is the delivery target — the custom domain is now canonical, and it is what `MOMO_CALLBACK_HOST` and the MoMo API user are bound to. `mo-mo-hack.vercel.app` still serves the same deployment. |
| **Webhook URL** | ⏳ set with `npm run telegram:setup -- <url>` once the secrets are on Vercel. |
| **Group message reads** | ❌ `/setprivacy` → **Disable** in @BotFather. Split-a-bill needs to see who replied. |

**Proved locally before any deploy.** `scripts/telegram-dev-bridge.mjs` long-polls `getUpdates` and
POSTs each update into the local route exactly as Telegram would, secret header and all — so the
whole path is exercised with no tunnel and no deployment. Only the inbound delivery is simulated;
the route, handler, model call and outbound send are the deployed ones. Measured against the real
bot: `/start` **0.75s** (no model call), an agent turn **5.5s**, a duplicate `update_id` **8ms** and
no second reply, a wrong secret **401**.

**Two limits worth knowing before the demo.** An agent turn at 5.5s has ~4.5s of headroom under
Vercel's 10s Hobby ceiling, so a slow Gemini response is the most likely way this fails live — the
handler already degrades to a friendly fallback rather than silence. And de-duplication plus
conversation history are **per-instance and in-memory**: they hold across a warm function, not
across a cold start. Nothing here writes to the ledger, so the worst case is a repeated reply or a
forgotten sentence, never a repeated payment. Both become exact when the outbox lands (M5c).

### CRITICAL, found and fixed the first time the tests met a real database

**`anon` could `TRUNCATE` the entire ledger.** Measured, not theorised:

```
set local role anon;
truncate ledger_entry cascade;   -- SUCCEEDED
```

`0001_ledger.sql` enables RLS and deliberately gives the ledger tables **no policies**, on the
stated reasoning that "RLS with zero policies denies every role except service_role" (ADR-0010).
That is true for SELECT, INSERT, UPDATE and DELETE. **It is not true for TRUNCATE.** TRUNCATE is
not a row operation, so RLS never sees it — it is governed only by the table privilege, and
Supabase's default privileges grant **ALL** privileges on every new table in `public` to `anon`
and `authenticated`. The append-only triggers do not help either: they fire on UPDATE and DELETE,
and TRUNCATE is neither.

Not remotely exploitable today — PostgREST does not expose TRUNCATE, so the anon API key alone
cannot reach it. But ADR-0010's guarantee is meant to be **structural**, and "unreachable through
the API we happen to use" is not structural.

Fixed in `0002_lockdown_and_bigint_balances.sql`: revoke everything from `anon` and
`authenticated`, then grant back only what is deliberately public. **Verified closed** — TRUNCATE
now returns `42501` for both roles.

**Also fixed: `wallet_balance` exposed money as `numeric`, not `bigint`**, because `sum(bigint)`
returns `numeric` in Postgres. No value was ever rounded — `numeric` is exact — but it breaks the
contract rule 1 promises and that `toBigInt` is built around. Now `::bigint`, and **zero
numeric/float columns remain** in `public`.

**The lesson worth keeping: the CI "Money guards" job could not have caught either.** It greps
*migrations* for banned type names, and `sum(e.amount)` contains none of them. A static grep over
source cannot see a type the database infers, nor a privilege the platform grants behind your
back. Only a check against the live schema can, and it did on its first run.

### Phase 3's exit criterion is now met

*"The ledger always balances, under concurrency, with property tests to prove it."*

Measured against real Postgres with two connections racing the same account: **one spend
committed, one was refused, the global ledger sum is exactly `0`, and the credit-normal wallet
never went positive.** The write-skew risk flagged in #17 does not materialise here — the deferred
trigger runs its `SELECT` as a fresh statement at COMMIT, so under READ COMMITTED it sees the
other transaction's committed rows. That is a measurement of one interleaving, not a formal proof,
so it stays worth re-checking when M3a and M4a add paths that debit a wallet.

### A cost worth stating: test runs left permanent rows

The opt-in concurrency test commits, and **journals are append-only by trigger, so its rows cannot
be deleted** — 7 journals and 4 postings are in the production project for good. The ledger still
balances exactly, and nothing is wrong; but it argues for the **second Supabase project (F4)** to
exist and to be where writing tests point. The free tier allows two and we have made one.

### Decisions taken 2026-09-02

- **Q6 — Supabase region: keep `eu-west-2` (London).** Decided by Tumo. POPIA s72 is satisfied
  by the UK's adequacy under UK GDPR; the cost is that it is an argument we have to make rather
  than one we do not. Not revisited — recreating the project after migrations land is expensive
  and the free tier allows exactly two.
- **Q1 — submission deadline: dropped.** No longer tracked as a blocker.
- **The live MoMo testing budget is about R10, total.** Now CLAUDE.md rule 15, and enforced
  rather than remembered. `src/lib/momo/budget.ts` caps any amount bound for a non-sandbox
  environment at **R1.00 per transaction** (`MOMO_LIVE_MAX_MINOR`), checked inside
  `toMomoAmount` — the single chokepoint every outbound MoMo request passes through, so there is
  no path that skips it. Sandbox is uncapped; sandbox money is not real. `scripts/momo-smoke.mjs`
  additionally refuses to run against a live environment without `MOMO_ALLOW_LIVE=1`, and drops
  its amounts to R0.10 when it does. **That one script sends eight payments — R85 at the sandbox
  amounts, or eight times the entire budget.**

---

## Progress

Counted from the tables below by a script, not estimated — 69 tracked items, states read
straight out of the `[ ]`/`[~]`/`[x]` column. Recomputed whenever the board changes.

| Measure | | What it counts |
|---|---|---|
| **Done to the required test level** | **26%** | 18 items. The honest floor: `docs/04` says a feature is Done only at its named test level. |
| **Weighted** (`[~]` counts half) | **34%** | The fairest single number. |
| **Started or better** | **42%** | 29 items have real code. |

**Read these with three caveats, or they will mislead you.**

1. **Items are not equal.** The money engine is one row per concept but 7,500 lines and 231
   tests; "Pitch deck" is one row and an afternoon. By item count the ledger is worth the same
   as a checkbox.
2. **The database gap is closed.** That caveat used to read "eight items sit at `[~]` because
   there is no database to integrate against". There is now: three migrations applied, 29
   integration tests green, and the four ledger invariants verified *firing* rather than assumed.
   Strict completion moved 17% → 22% on that alone, and it is the reason the remaining `[~]`
   items are now blocked on real work rather than on a credential.
3. **The hard part is disproportionately done.** The double-entry ledger, the integer split
   engine, the state machine and the idempotency model are the parts that are expensive to get
   right and unforgiving when wrong, and they are built and property-tested. What remains is
   mostly breadth — more surfaces over the same engine — not depth.

**Phase 3's exit criterion is now met** — see the measurement above. What Phase 3 still owes is
its six audits (A1 A2 A3 A4 A5 A6), none of which have been run.

---

## Phase board

The 5th column is what each phase owes the audit suite. White circle = owed, green tick = run and
written up. Only the audits listed are run at that phase — see `PLANNING.md` §11.

| # | Phase | State | Days | Audits |
|---|---|---|---|---|
| 0 | Foundation and walking skeleton | **DONE.** Skeleton closed — real requesttopay → deployed function → balanced journal, measured | 1-3 | A1 A8 ⚪ |
| 1 | Design system and app shell | built, in PR #11 | 4-5 | A1 A2 A3 ⚪ |
| 2 | Narrative and content surfaces | landing page built, in PR #11 | 6 | A1 A6 ⚪ |
| 3 | Money engine | exit criterion met; **all six audits run** ✅ — 13 Highs open, so the gate holds the phase open | 7-13 | A1 A2 A3 A4 A5 A6 ✅ |
| 4 | Channels and products | not started | 14-19 | A1 A2 A3 A4 A5 A8 ⚪ |
| 5 | Reach — offline, USSD, voice | not started | 20-23 | A1 A2 A3 A4 A7 ⚪ |
| 6 | Hardening, demo and submission | not started | 24-28 | A1 A3 A4 A5 A6 A7 A8 S1 ⚪ |

---

## Status legend

| Symbol | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Done and merged to `main` |
| `[!]` | Blocked |
| `[-]` | Descoped (say why) |

Test column: `none` / `unit` / `+prop` (property-based) / `+int` (integration incl. RLS) /
`+e2e` / `+load`. A feature is only **Done** when it reaches the test level named in
`docs/04-TESTING-STRATEGY.md` for its tier.

---

## 0. Foundation

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| F1 | Public GitHub repo created | `[x]` | n/a | n/a | — | `TUMO-MOGAME/MoMo-Hack`, made public 2026-09-02 |
| F2 | Ruleset protecting `main` | `[x]` | verified | n/a | — | Ruleset 22084424. Direct push **tested and rejected**. Squash-only, linear history, no bypass actors. |
| F3 | Next.js + TS + Tailwind scaffold | `[x]` | typecheck + build in CI | unit | #13, #14 | **Next 15.5.25** (bumped off 15.1.6 for 30+ advisories), React 19, Tailwind v4, strict TS + `noUncheckedIndexedAccess`. Production build green in CI on every PR. |
| F3a | Full directory structure + module boundaries | `[x]` | n/a | n/a | — | Matches `docs/01` §5 = the agent ownership map |
| F3b | Design tokens (`src/design/tokens.ts` + `@theme`) | `[x]` | none | unit | — | Architecture from Social-Assembly; brand retuned to MTN gold |
| F3c | Frozen contracts: `money`, `split`, `errors`, `artifacts/types` | `[x]` | **manual** | +prop | — | Split verified exact across 200,000 amounts. Needs the real fast-check suite (M1d). |
| F3d | Starter chat + artifact UI (mock agent) | `[x]` | manual | +e2e | — | 7 artifact renderers, chip + panel + bottom sheet, zero keys needed |
| F4 | Supabase staging + prod projects | `[~]` | none | +int | — | **Project 1 of 2 live and verified** — URL, anon and service_role all resolve to ref `edtduvwbejdfahkmfort`, service_role authenticates 200. **Region is `eu-west-2` (London)**, measured from the DB host's IPv6 against AWS's published ranges — not an African region. See Q6. |
| F5 | Migration pipeline (local, CI, deploy) | `[x]` | **+int** | +int | #20 | `npm run db:migrate` — ordered, once, each file in a transaction, and it **refuses if an applied file's checksum changed** (CLAUDE.md #4). **Three migrations applied to the live Supabase project.** |
| F6 | CI quality gate workflow | `[x]` | **verified** | n/a | #13, #14 | Lockfile · Typecheck · Lint · Format · Tests · Build · Money guards, each a separate named job. Guards tested against synthetic violations to prove they fire. |
| F7 | Vercel project + preview deploys | `[x]` | **verified live** | +e2e | — | **<https://momo.tumoolo.tech> is the canonical host** — a custom domain on the same project, verified from the public internet: `/` 200, `/api/health` 200, `POST /api/momo/callback/collection` 200. `mo-mo-hack.vercel.app` still serves the same deployment. Production deploys on every merge to `main`, previews on every PR. Note the per-deployment URLs (`…-tumo-mogames-projects.vercel.app`) 302 to SSO; only the stable aliases are public, and `momo.tumoolo.tech` is the one to give MTN and Telegram. **Caveat, now measured:** that callback 200 never proved the route worked — it returns 200 even when it fails. See the HIGH finding above. |
| F8 | GitHub Actions scheduler + keep-alive | `[ ]` | none | +int | — | ADR-0006 |
| F9 | Secrets wired (MoMo, Supabase, Telegram) | `[x]` | **verified live** | n/a | — | **15 variables on the Vercel `production` target**, read back from the API rather than trusted to a 200, and proved by behaviour: `/api/health` moved `database: unconfigured` → **`configured`**, and `POST /api/cron/reconcile` moved 401 → past auth, so `CRON_SECRET` is right. The vars had been set on **preview** only, which is why the deployment looked configured and behaved as though it were not. Repeatable as `npm run env:push`. Telegram's two are deliberately not ours — see split ownership above. **GitHub Secrets are still unset** (F8 needs `CRON_SECRET` there). |

## 1. Money engine (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
**Reconciled against the code on 2026-09-02.** These rows all said `[ ]` after #10 merged,
which was wrong — #10 shipped nine of them. `[~]` here does not mean "half-written": for most of
these it means the code is complete and green, and the row cannot reach `[x]` because the
**required test level is `+int` and no database exists to integrate against**. That distinction
is the honest one, and it is why the percentage in §Progress counts both ways.

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M1a | Chart of accounts + ledger schema | `[x]` | **+int** | +int | #10, #20 | Applied to real Postgres and **all four invariants verified firing** — I1 balance, I2 append-only, I3 overdraft in each account's own direction, I4 terminal immutability. These could never be proven against the in-memory adapter, which has no triggers. |
| M1b | Journal writer (atomic, balanced) | `[x]` | unit **+prop** | +prop | #10 | Single writer, guarded by `single-writer.test.ts`. Required level met. |
| M1c | Balance projection + hold logic | `[~]` | unit +prop | +prop | #10 | Projection done (`accountBalance`, no cached balance anywhere). **Hold logic exists only as posting builders** — the escrow service is M4a. |
| M1d | Split engine (basis points, remainder) | `[x]` | **+prop** | +prop | #3 | 6 properties, 5,000+ cases. R12.50 tie-break pinned (M3 in `MISTAKES.md`). |
| M2a | MoMo client (auth, token cache, retry) | `[x]` | **+int** | +int | #10, #25 | Contract tests across the response matrix, and now a real end-to-end collection through the deployed function. Token issue, `requesttopay`, `getStatus` and the callback-host binding all exercised against the live sandbox. |
| M2b | Collections `requesttopay` + status | `[x]` | **+int** | +int | #10, #25 | Live-verified: `202` then `409` on a repeated `X-Reference-Id`, and **two real collections resolved to `SUCCESSFUL` with balanced journals**. Also found `500 INVALID_CALLBACK_URL_HOST` — see the HIGH finding above. |
| M2c | Transaction state machine | `[x]` | **+prop** | +prop | #10 | Terminal states absorbing, machine total and closed. Accepts the undocumented `CREATED`. |
| M2d | Callback webhook handler | `[~]` | contract | +int | #10, #25 | Replay-safe by construction — the body can only trigger a lookup, never set a status. **Now reachable for the first time**: the API user is bound to `momo.tumoolo.tech`, so MTN's callback finally arrives somewhere real. Stays `[~]` because the skeleton polls the reconciler concurrently and **which path won the race was not instrumented**. |
| M2e | Reconciliation poller | `[~]` | **+int** | +int | #10, #23, #25 | Proved in production: `{"ok":true,"examined":1,...}` from the deployed route, including the resend path moving an `INITIATED` row to `CREATED`. Stays `[~]` because **nothing calls it on a timer** — every tick so far has been a human with `curl` (F8). |
| M3a | Disbursements `transfer` | `[ ]` | none | +int | — | Not started. Nothing pays anybody out yet. |
| M3b | Payout orchestration + outbox | `[ ]` | none | +int | — | The `outbox` table and writes exist; **nothing drains it**. |
| M4a | Escrow hold / release / refund | `[ ]` | none | +prop | — | Posting builders exist; the service and state machine do not. |
| M4b | Photo proof upload + approval | `[ ]` | none | +e2e | — | Supabase Storage |

## 2. Channels (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M5a | Telegram webhook + secret verification | `[~]` | **contract (27)** | +int | #24 | Built and verified against the live bot. Constant-time secret compare, `update_id` de-duplication, `200` on every path except a bad secret (`401`). `[~]` not `[x]` because the required level is `+int` and de-duplication is in-memory, not a table. |
| M5b | Bot conversation state machine | `[~]` | contract | +prop | #24 | Short per-chat history (8 turns, 30 min), reset by `/start`. **In-memory, so it survives a warm function and not a cold start.** Not a state machine yet — there are no flows to hold state for until M5c. |
| M5c | Bot flows: pay, earn, stokvel, balance | `[ ]` | none | +e2e | — | The agent explains all four; it cannot execute any of them. Needs the read tools (S7a) and the outbox. |
| M9a | Web shell + auth | `[~]` | unit | +e2e | #11, #31 | Shell, landing page, chat surface and context sidebar shipped and serving 200, plus **`/ledger` — the first surface in the product whose numbers are real**. **There is still no auth of any kind** — no sign-in, no session, no `auth.uid()`, so the one RLS policy we wrote cannot yet be exercised. |
| M9b | Commuter view | `[ ]` | none | +e2e | — | |
| M9c | Worker view | `[ ]` | none | +e2e | — | |
| M9d | Rank-admin view | `[ ]` | none | +e2e | — | |

## 3. Product surfaces (MUST)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| M6a | Fare QR generation + scan | `[ ]` | none | +e2e | — | |
| M6b | 60/25/10/5 split applied on fare | `[ ]` | none | +prop +load | — | Load test asserts ledger balances |
| M7a | Stokvel group + membership | `[ ]` | none | +int | — | RLS-heavy |
| M7b | Contribution schedule + reminders | `[ ]` | none | +int | — | |
| M7c | Rotating payout engine | `[ ]` | none | +prop | — | |
| M8a | Prepaid electricity + token issuance | `[ ]` | none | +e2e | — | Simulated meter token |
| M8b | School fees rail | `[ ]` | none | +e2e | — | |

## 4. Depth features (SHOULD)

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| S1 | USSD state machine + simulator UI | `[ ]` | none | +e2e | — | |
| S2 | Offline queue + service worker | `[ ]` | none | +e2e | — | Demo in airplane mode |
| S3 | Remittances + purpose-locked sub-wallet | `[ ]` | none | +int | — | |
| S4 | Ubuntu Trust Score | `[ ]` | none | +prop | — | |
| S5 | Live webhook console | `[ ]` | none | +e2e | — | Supabase Realtime |
| S6 | Split-a-bill via Telegram group | `[ ]` | none | +e2e | — | |

## 4b. Conversational layer (SHOULD) — `docs/12`, `docs/13`

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| S7a | Agent route + shared core | `[~]` | **live-verified** | +int | #32 | `POST /api/agent` over `src/server/agent/respond.ts` — **one core, both channels**. Gemini for prose, deterministic fallback when it is slow, unconfigured or wrong, so silence is impossible. Node runtime, not Edge (the `pg` pool). Owes automated tests and a Telegram cut-over. |
| S7b | Agent tools — read-only set | `[~]` | **live-verified** | +int | #32 | `read_wallet`, `read_transactions`, `read_fare_split`, all against real Postgres, every amount carrying `sourceTxnId`/`sourceAccountId`. **The server builds the artifact; the model only writes prose** — so rule #14 is a shape of the program, not a prompt. Three of the eleven tools in `docs/11` §9a. |
| S7c | Artifact schema (zod discriminated union) | `[ ]` | none | +prop | — | **Still genuinely not done.** `src/lib/artifacts/types.ts` carries a TypeScript union and an explicit `TODO(S7c)`; **zod is not a dependency**, so there is no *runtime* validation. Harmless today because no agent produces artifacts yet — a hard blocker for S7a/S7b, which is where untrusted model output first arrives. ADR-0013. |
| S7d | Artifact registry + panel + bottom sheet | `[~]` | unit | +e2e | #11 | 11 renderers + registry, panel, drawer and skeletons. 90 unit tests from fixtures. **The provenance guard is real and tested**: an amount with no `sourceTxnId`/`sourceAccountId` renders struck-through and "unverified", and disables the confirm control (CLAUDE.md #14). Owes `+e2e` and an axe sweep. |
| S7e | In-chat chips + re-open from history | `[~]` | unit | +e2e | #11 | Chip component and artifact context shipped; re-open from history not verified end to end. |
| S7f | `propose_*` + signed confirmation card | `[ ]` | none | **+int +sec** | — | **ADR-0014 — the safety-critical one** |
| S8a | Phrase bank build script | `[ ]` | none | unit | — | Run manually, never in CI |
| S8b | ElevenLabs live TTS with a daily cap | `[ ]` | none | +int | — | Degrades to phrase bank, then text |
| S8c | Speech input (Web Speech API) | `[ ]` | none | +e2e | — | On-device; audio never leaves the phone |
| S8d | isiZulu/isiXhosa/Sesotho/Afrikaans recordings | `[ ]` | n/a | n/a | — | Needs a native speaker and a microphone |

## 5. Quality and demo

| ID | Item | State | Tests | Required tests | PR | Notes |
|---|---|---|---|---|---|---|
| Q1 | Property-test suite for money invariants | `[ ]` | — | — | — | `docs/04` §3 |
| Q2 | RLS policy test suite | `[x]` | **+int** | — | #20 | 6 RLS tests, green against the live database. They found a **Critical** hole — see below. |
| Q3 | MoMo contract tests (2xx/4xx/5xx/timeout) | `[ ]` | — | — | — | |
| Q4 | E2E critical path (Playwright) | `[ ]` | — | — | — | |
| Q5 | Load test: 500 concurrent fares | `[ ]` | — | — | — | k6, asserts balance |
| Q6 | Chaos drills (dupe/late/out-of-order webhooks) | `[ ]` | — | — | — | |
| Q7 | Accessibility pass (axe) | `[ ]` | — | — | — | Judges score design |
| Q8 | Security review (secrets, authz matrix) | `[ ]` | — | — | — | |
| D1 | MoMo emulator for demo resilience | `[ ]` | none | +int | — | ADR-0009 |
| D2 | Seed data + demo reset script | `[ ]` | none | — | — | One command. **Not a blocker after all** — `ensureAccount` upserts by natural key, so the skeleton needed no seed data. Still wanted for a demo with plausible balances. |
| D3 | Demo rehearsed end to end 3x | `[ ]` | — | — | — | `docs/08` |
| D4 | Pitch deck | `[ ]` | — | — | — | |
| D5 | Demo video recorded | `[ ]` | — | — | — | Fallback if live fails |

---

## What has been tested

Nothing yet — no code exists. This section becomes a real record as PRs land.
Format: one line per merged workstream, with the evidence.

| Date | What | Test level reached | Evidence |
|---|---|---|---|
| 2026-09-02 | Branch protection on `main` | verified | Direct push rejected: `GH013 — Changes must be made through a pull request` |
| 2026-09-02 | Split engine invariant | **manual exhaustive** | 200,000 consecutive amounts × the 60/25/10/5 rule; every split summed exactly. Not yet the fast-check suite required by `docs/04` §3 — logged as debt below. |
| 2026-09-02 | TypeScript strict build | typecheck | `tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess` |
| 2026-09-02 | Starter UI renders | manual | Dev server `HTTP 200`; greeting, suggestions and composer all present in the response |
| 2026-09-02 | MoMo credentials, live | **integration** | All three products issue tokens. Idempotency confirmed against the real API: same `X-Reference-Id` twice → `202` then `409`. |
| 2026-09-02 | Sandbox test MSISDNs | **integration** | 40s poll per number. Four of six documented outcomes were wrong. `momoAPIs.md` §10 promoted `[P]` → `[V]`. Discovered the undocumented `CREATED` status. |
| 2026-09-02 | Telegram bot | **integration** | `getMe` + `getWebhookInfo` on `@momokasi_demo_bot`. Live. |
| 2026-09-02 | Money engine (PR #10) | unit + property + contract | **231 tests, 15 files.** Ledger balance, state transitions, MoMo response matrix, webhook/cron auth. Typecheck clean. |
| 2026-09-02 | Frontend (PR #11) | unit | **90 tests, 6 files.** Every artifact renders from a fixture; the provenance guard is locked in. Typecheck clean. |
| 2026-09-02 | **#10 + #11 combined** | unit + property + contract | **315 tests, 20 files** (321 less the 6 shared split tests counted once), typecheck clean, production build clean. The combination is what found the CRLF guard bug — neither PR failed alone. |
| 2026-09-02 | Money engine reviewed and merged (#10) | read, not just run | Diff read in full. Verified by hand: the overdraft trigger follows each account's normal balance; `claimTransition` takes `for update` so concurrent resolvers serialise; the callback body can only trigger a lookup and never sets a status; cron uses a constant-time compare; ledger tables carry no RLS policies at all. |
| 2026-09-02 | Supabase project 1 | **integration** | URL, anon and service_role keys all carry ref `edtduvwbejdfahkmfort`; GoTrue health 200; service_role authenticates against PostgREST 200. Region measured as `eu-west-2` (London) from the DB host's IPv6 against AWS's published ranges. |
| 2026-09-02 | `npm run check:momo` | **integration** | Dead on main (`ReferenceError: resolve is not defined`). Fixed and re-run live: token issued, all six MSISDN cases match the `[V]` table in `momoAPIs.md` §10, idempotency `202` then `409`. |
| 2026-09-02 | CI quality gate (#13) | **verified** | Typecheck, lint, full 231-test suite and production build all green locally on the bumped toolchain. Both content guards tested against a synthetic violation to prove they fire, and against this tree to prove they do not fire on prose. |
| 2026-09-02 | Dependency health | **verified** | `npm audit` 9 vulnerabilities (3 critical) → **0**. `npm ci` restored — it had been failing since PR #2. |
| 2026-09-02 | **#11 on the merged toolchain** | unit + property + contract | **315 tests, 20 files**, typecheck, lint and production build all clean. Caught vitest 4 silently not running the 84 component tests — see below. |
| 2026-09-02 | Prettier + reformat (#14) | **verified** | 41 code files reformatted. 315 tests, typecheck, lint and build all still clean afterwards. Markdown deliberately excluded — see `.prettierignore`. |
| 2026-09-02 | App runs on the merged tree | manual | `next dev` on the fully merged tree: `/` and `/chat` both **200**, `/api/health` `ok:true`. `database: unconfigured` is correct and expected — nothing binds the adapter yet (F5). |
| 2026-09-02 | Landing page photography (#15) | manual + build | Five WebP, **52MB of source JPEGs → 908KB**. Verified against the production build: `/` 200, all five `alt` texts present, `next/image` srcset emitting 8 widths, optimised variant serves 200, `aspect-ratio:4/5` generated. Originals moved to a gitignored `assets-src/` and regenerable with `npm run images`. |
| 2026-09-02 | Required status checks on `main` | **verified** | 8 checks now required — Lockfile, Typecheck, Lint, Format, Tests, Build, Money guards, A8 — with **`strict` on**, so a branch must be up to date with `main` before it merges. Read back from the API, not assumed. That last setting is what would have caught the #10 + #11 interaction *before* the merge instead of after. |
| 2026-09-02 | Telegram bot | **integration** | Re-checked live. Bot healthy; **no webhook set and 1 update queued**; `/api/telegram/webhook` does not exist (M5a). A sent message has nowhere to go. Not a fault — unbuilt, and gated on F7. |
| 2026-09-02 | DB wiring (#17) | unit + skip-verified | `pg` bound, bootstrap calls `setMoneyDb`, migration runner with checksum enforcement. **35 integration + RLS tests written**; they skip cleanly and visibly without `DATABASE_URL` (315 passed, 29 skipped). Typecheck, lint, format and build all green. |
| 2026-09-02 | **Deployed app is live** | **integration** | <https://mo-mo-hack.vercel.app> from the public internet: `/` and `/chat` 200, `/api/health` `ok:true`, and `POST /api/momo/callback/collection` **200** — MTN can reach our callback. Health also proves no env vars are set there yet. |
| 2026-09-02 | **Migrations applied to live Supabase** | **integration** | 3 migrations applied to `edtduvwbejdfahkmfort`. Connection reached via the **Session pooler** — the direct `db.<ref>.supabase.co` host is IPv6-only and does not resolve from this machine at all (`ENOTFOUND`). |
| 2026-09-02 | **Ledger invariants, real Postgres** | **integration** | **29 tests green.** All four DB invariants verified *firing*: unbalanced journal refused, ledger append-only, overdraft blocked in each account's own direction, terminal status immutable, `journal_id` write-once, split rules must sum to 10000bps. |
| 2026-09-02 | **RLS, real Postgres** | **integration** | 6 tests via `set local role` + `request.jwt.claims`. Found the **Critical** TRUNCATE hole (above), fixed in `0002`, re-verified closed. |
| 2026-09-02 | **Concurrency — Phase 3 exit criterion** | **integration** | Two connections racing one account: one spend committed, one refused, **global ledger sum exactly 0**, wallet never positive. |
| 2026-09-02 | Live spend guard (#18) | unit + **empirical** | 15 tests on the cap. Verified by pointing `.env.local` at `production` and running `npm run check:momo`: it **refused and exited before issuing a token**, then the env was restored. 331 tests pass overall. |
| 2026-09-02 | Footer rebuild + attribution | manual + build | Footer replaced: nav columns, the MTN MoMo mark and the TUMO OLO wordmark. Both logos are the owners' own assets, not traced — MoMo is MTN's `mtnmomoLogo.svg` payload (**`#FFCB05` / `#003A58`** sampled from the file), TUMO OLO is the outline served at tumoolo.tech, checked side by side against their own nav render. Screenshotted from the **production** build at 1280px and 390px. Caught a real overflow at 390px: the old small-print row pushed the copyright past the viewport edge, now stacked. Re-verified after merging `main`: **331 passed, 29 skipped**, typecheck, lint, format and build green. `/` still prerendered **static** at 6.3 kB / 112 kB First Load JS — the footer is a server component and ships no client JavaScript, though no pre-change baseline was measured to quote a delta. |
| 2026-09-02 | **Custom domain live** | **integration** | <https://momo.tumoolo.tech> from the public internet before any credentials existed: `/` **200**, `/api/health` **200**, `POST /api/momo/callback/collection` **200**. Same deployment as the `.vercel.app` alias. Also measured: the `MOMO_CALLBACK_HOST` in `.env.local` (`momo-kasi.vercel.app`) **404s `DEPLOYMENT_NOT_FOUND`** — a dead callback host, caught before it was pushed anywhere. |
| 2026-09-02 | **F9 — env vars on Vercel** | **integration** | 15 variables written to the `production` target and **read back from the API**, not trusted to a 200. Root cause of the apparent gap: they were already set on **preview** only. Verified by behaviour after a redeploy of the same commit (`11569c6`): `/api/health` `database: unconfigured` → **`configured`** on both aliases. |
| 2026-09-02 | **Cron auth, live** | **integration** | Three-way probe against the deployed function: no bearer → **401**, wrong bearer → **401**, correct `CRON_SECRET` → **through to the handler**. Proves the secret landed correctly and the constant-time compare behaves. |
| 2026-09-02 | **HIGH — money routes never bound the database** | **integration + static guard** | The same correct-bearer call returned **500**. Cause: `ensureMoneyDb()` had one caller in the codebase (`/api/health`), and `setMoneyDb` is a module-scoped singleton that serverless isolation does not share. `/api/cron/reconcile` 500'd on every tick; `/api/momo/callback/[kind]` returned **200 while never reaching the database**, because its catch swallows exactly that error. Fixed in both. Guarded by a static test over `src/app/api/**/route.ts`, and **the guard was proved to fire** against a synthetic violation. |
| 2026-09-02 | **✅ WALKING SKELETON — Phase 0 closed** | **integration, live** | A real `requesttopay` to MTN's sandbox (R1.00, MSISDN `46733123454`), resolved through the **deployed** function, writing a balanced journal. Measured: `SUCCESSFUL`, `journal d6df990b`, `MOMO_SETTLEMENT +100` / `SUSPENSE -100`, sum `0`, **initiate → resolved 66.4s**. Global ledger sum `0` over 8 rows. Driven by `tests/integration/walking-skeleton.test.ts`, opt-in behind `MOMO_SKELETON=1` because it cannot roll back. |
| 2026-09-02 | **CRITICAL — the ledger worked exactly once** | **integration + regression** | `ensureAccount`'s `on conflict` fallback passed 6 params to SQL referencing 5 → `could not determine data type of parameter $5`. That branch runs only when the account already **exists**, so the first journal against any account succeeded and every later one threw. Found on the second real collection. Missed by 361 tests because every integration test rolls back and so had never seen a committed account. Fixed; two idempotency tests added and **proved to fire** against the reintroduced bug. Second collection then resolved: `journal a7cc179a`. M9 in `MISTAKES.md`. |
| 2026-09-02 | **HIGH — MoMo callback host is bound at provisioning** | **integration, controlled experiment** | A mismatched `X-Callback-Url` returns **`500 INVALID_CALLBACK_URL_HOST`** and creates no payment — `momoAPIs.md` §4.1 had guessed "silently dropped". Proved by inversion: bound to host A, sending B is 500 and A is 202; after re-provisioning against B the results flip exactly; no callback URL is 202 either way. `GET /v1_0/apiuser/{id}` confirmed both bindings. The project had been provisioned against `momo-kasi.vercel.app`, **which 404s**, so the callback path had never worked. API user re-provisioned as `28b81c8c…` against `momo.tumoolo.tech`. §4.1 and §4.3 promoted `[P]` → `[V]`. |
| 2026-09-02 | **Telegram bot replies** (#24) | contract + **live end-to-end** | 27 contract tests, and the real bot answering from a local server via `scripts/telegram-dev-bridge.mjs`. Measured, not assumed: `/start` **0.75s** canned with no model call, an agent turn **5.5s**, a repeated `update_id` **8ms** with no second reply, a wrong or absent secret **401**. Suite **387 passed, 1 skipped** — higher than the usual 331/29 because `DATABASE_URL` was present locally, so the integration and RLS tests ran instead of skipping, and passed. |
| 2026-09-02 | Agent LLM provider | **integration** | `GROQ_API_KEY` is present in `.env.local` and **empty**, so ADR-0012's primary cannot serve a request. Fell back to Gemini (A11 in `docs/11`, already sanctioned). Model chosen by querying the live API, not from memory: `gemini-2.5-flash` **404s for new keys** and Google's own error names `gemini-3.6-flash` as the replacement. 3.6-flash is a thinking model that spends the output budget on reasoning and returns a truncated sentence until `thinkingLevel: 'low'` is set. |

---

## What needs testing (running debt)

Nothing yet. Anything merged at a lower test level than
`docs/04-TESTING-STRATEGY.md` requires is logged here with a date it must be paid down by.

| Item | Merged at | Needs | Due | Why deferred |
|---|---|---|---|---|
| ~~`src/domain/split.ts`~~ | — | ~~fast-check property suite~~ | **PAID 2026-09-02** | 6 properties green, 5,000+ generated cases |
| `src/domain/money.ts` | typecheck only | unit tests for `parseMinor` / `formatZAR` edge cases | Day 5 | as above |
| ~~Artifact renderers~~ | — | ~~fixture unit tests~~ | **PAID** | 90 tests in PR #11. axe sweep still owed. |
| Money engine (PR #10) | unit/property/contract | **integration against real Postgres** | Day 9 | Supabase does not exist yet — runs on the in-memory adapter |
| RLS policies | none | ~~write the tests~~ **run them** | Day 9 | Written in #17 (6 tests). They skip until `DATABASE_URL` exists — a skip that announces itself, never a fake pass. |
| Context sidebar | unit | drawer focus trap verified at 320px | Day 5 | Agent stopped mid-verification |
| `src/lib/agent/mock.ts` | manual | becomes the UI test fixture source | Day 18 | Replaced by the real agent route (S7a) |
| `src/server/agent/respond.ts` | **none — shipped untested** | routing + refusal tests | **PART-PAID 2026-09-02** | 30 tests in `tests/unit/agent/refusal.test.ts`. It shipped with none, and that is why M10 reached production. Still owed: the *modelled* path (needs a stubbed client) and `grounding()`. |
| `src/server/agent/tools.ts` | none | integration tests against real Postgres | Day 9 | The three read tools are exercised only through `/api/agent` by hand |

---

## Risks currently live

Full register in `docs/09-RISK-REGISTER.md`. The ones actually biting right now:

| Risk | State | Mitigation status |
|---|---|---|
| MoMo sandbox instability (outages reported Jul 2026) | Live | Emulator planned (D1), not built |
| Supabase free project pauses after 7 days idle | Live | Keep-alive planned (F8), not built |
| Vercel Hobby 10s function timeout | Live | Async-by-design; enforced in `docs/01` |
| Solo dev, 25 days, large scope | Live | Cut list defined in `docs/05` §6 |

---

## Audit ledger

One row per audit run. `runner/audit.mjs` reads this to know what has already happened, so a
finding is never re-reported as new. **An audit not written here did not happen.**

| Phase | Audit | Crit | High | Med | Low | Status | Date |
|---|---|---|---|---|---|---|---|
| 3 | A1 Comprehensive codebase | 0 | 2 | 5 | 4 | run · [`PHASE-3-A1.md`](docs/audits/results/PHASE-3-A1.md) | 2026-09-02 |
| 3 | A2 Design fidelity | 0 | 1 | 1 | 3 | run · [`PHASE-3-A2.md`](docs/audits/results/PHASE-3-A2.md) | 2026-09-02 |
| 3 | A3 Accessibility | 0 | 3 | 2 | 2 | run · [`PHASE-3-A3.md`](docs/audits/results/PHASE-3-A3.md) | 2026-09-02 |
| 3 | A4 Performance & CWV | 0 | 1 | 3 | 2 | run · [`PHASE-3-A4.md`](docs/audits/results/PHASE-3-A4.md) | 2026-09-02 |
| 3 | A5 Security | 0 | 4 | 4 | 2 | run · [`PHASE-3-A5.md`](docs/audits/results/PHASE-3-A5.md) | 2026-09-02 |
| 3 | A6 SEO & content | 0 | 2 | 4 | 2 | run · [`PHASE-3-A6.md`](docs/audits/results/PHASE-3-A6.md) | 2026-09-02 |
| 3 | A8 Dependency & supply chain | 0 | 0 | 0 | 0 | pass · `npm audit --audit-level=high`, 0 vulnerabilities | 2026-09-02 |

**Totals: 0 Critical · 13 High · 19 Medium · 15 Low.** Nineteen of the 22 High/Medium items are
in the *perimeter* — headers, auth, loading states, metadata. **Every money-integrity check
passed**, structurally rather than by convention (A5 §3).

---

## Open findings

Critical and High block the phase gate. `runner/audit.mjs gate` fails while any row here is
unresolved — where resolved means fixed, or accepted with a written reason.

**13 open Highs, 0 Criticals.** `audit:gate` fails while these stand, so **Phase 3 cannot be
declared closed** — which is the gate working, not a setback. Ordered by value-per-minute, and the
first six are collectively about two hours.

| ID | Audit | Severity | Location | Summary | Status |
|---|---|---|---|---|---|
| A5-02 | A5 | High | `src/server/agent/respond.ts` | The user's raw message goes to Gemini unscrubbed. POPIA s105/106 — a real MSISDN has **already** been sent (the M10 transcript). `scrub()` exists and is tested; it is simply not applied here | open |
| A3-03 | A3 | High | `globals.css` `--ring` | Focus ring measured **2.98:1** on cards, **3.01:1** on the ground. SC 1.4.11 needs 3:1. One value | open |
| A3-01 | A3 | High | `globals.css` `--border` / `--input` | Non-text contrast **1.27:1** and **1.39:1** against 3:1. The message composer's border is effectively invisible on the target device | open |
| A6-02 | A6 | High | `public/`, `src/app/` | No favicon — `/favicon.ico` is **404**. Blank browser tab beside every other submission | open |
| A6-01 | A6 | High | `src/app/layout.tsx` | No Open Graph or Twitter tags. Every shared link renders as a bare grey URL in WhatsApp, Slack and LinkedIn | open |
| A4-01 | A4 | High | `src/app/(app)/ledger/` | No `loading.tsx` on a route with a measured **722–1432 ms** TTFB. The page looks frozen; `ChipSkeleton` already exists | open |
| A3-02 | A3 | High | `src/app/(app)/chat/page.tsx` | `/chat` renders **zero** headings. No `h1` on the product's primary surface. Filed again as A6-05 (Medium), where it is an SEO problem — one `<h1>` closes both | open |
| A1-02 | A1 | High | `src/app/**` | No `error.tsx` anywhere — a thrown Server Component renders Next's generic "Application error" | open |
| A5-03 | A5 | High | `src/app/api/agent/route.ts` | Accepts cross-origin POSTs (verified: `Origin: evil.example` → 200). A third-party page can drain the Gemini quota through its visitors | open |
| A5-01 | A5 | High | no `headers()` / `middleware` | **No security headers at all** — no CSP, `nosniff`, `Referrer-Policy` or `frame-ancestors`. The A5 overlay explicitly said to flag this if Phase 3 closed without a CSP | open |
| A2-01 | A2 | High | `src/design/tokens.ts`, `package.json` | `tokens.ts` documents `npm run tokens` and **that script does not exist**. `globals.css` is a second hand-maintained copy. Verified 60/60 roles agree *today*; nothing keeps them agreeing | open |
| A5-04 | A5 | High | whole app | **No authentication.** Every RLS policy across 8 tables is therefore unexercised — design, not control. M9a | open · blocked on M9a |
| A1-01 | A1 | High | `/api/agent`, `/api/context` | Same root cause as A5-04, from the architecture side: both money-reading endpoints answer any caller and the read tools are scoped to no user | open · blocked on M9a |

---

## Deferred debt

Findings we consciously chose not to fix now, each with the reason and the date it comes due.
Deferring is legitimate; deferring silently is not.

| ID | Audit | Severity | Summary | Why deferred | Due |
|---|---|---|---|---|---|
| A5-04 / A1-01 | A5, A1 | High | No auth; 8 tables of RLS unexercised | M9a is a workstream, not a fix. Cut from the presentation on Day 1 for the same reason as WhatsApp — it cannot be done well in the window | Phase 4 |
| A5-05 / A1-05 | A5, A1 | Medium | In-memory rate limiter, per serverless instance | A durable limiter needs a Postgres table or Upstash; Upstash is out on free-tier grounds. Acceptable while the only cost is our own quota | Phase 6 |
| A1-06 | A1 | Medium | No zod runtime validation of artifacts (S7c) | Harmless while the server constructs every artifact. A hard blocker before any artifact is parsed from model output | Before the agent write path |
| A5-08 | A5 | Medium | `history` is client-supplied and echoed into the prompt | Bounded today — no write tools exist, so the worst case is a wrong card. Must become server-held before `propose_*` ships | Before S7f |
| A4-02 | A4 | Medium | Core Web Vitals never measured | One Lighthouse command, but the numbers change nothing before the demo and the bundle totals are already healthy | Phase 6 |
| A5 §5 | A5 | Medium | POPIA retention purging does not exist | There is nothing to purge yet — no proof photos (M4b unbuilt), no stored request bodies. Reported as absent, not as passing | Phase 6 |
| A3-04 | A3 | Medium | axe has never been run (Q7) | Cheap, and it needs a decision about whether to add `axe-core` as a dependency | Phase 6 |
| A1-03 | A1 | Medium | Agent core tests part-paid — modelled path and read tools uncovered | 30 tests landed with the M10 fix; the rest needs a stubbed client | Phase 4 |

---

## Session log

### 2026-09-02 (session 3) — the database is real, and it immediately found a Critical

**Merged #13-#21.** CI became an actual quality gate (9 checks), Prettier landed, the landing page
got photography, the board was reconciled against the code, live MoMo spend was capped, and the
database went from "written" to "running".

**The finding of the session: `anon` could `TRUNCATE` the ledger.** RLS with no policies denies
row operations; TRUNCATE is not a row operation. Supabase's default privileges had granted ALL
privileges on every table in `public` to `anon` and `authenticated`. Found within minutes of the
integration suite first reaching a real database, fixed in `0002`, verified closed.

**Second finding: `wallet_balance` was `numeric`, not `bigint`** — `sum(bigint)` widens in
Postgres. Nothing was rounded, but it broke the contract rule 1 promises.

**Neither was findable by the static CI guards**, which grep migration *text*. A type the database
infers and a privilege the platform grants are both invisible to a grep. That is the argument for
integration tests in one sentence.

**Phase 3's exit criterion is met**, measured rather than asserted: two connections racing one
account, one spend committed, one refused, global ledger sum exactly 0.

**Required status checks are on** — 8 of them, `strict`. It bit immediately and correctly: #21
was refused because the frontend agent's #20 had moved `main` underneath it.

**Still owed:** Vercel environment variables (nothing deployed has credentials), the walking
skeleton join, and Phase 3's six audits — none run.

### 2026-09-02 (session 2) — money engine merged, and CI made real

**Merged:** #10, the money engine, after reading the diff rather than trusting the test count.
The design holds up: the overdraft trigger correctly follows each account's normal balance
instead of the version printed in `docs/02`, which would have rejected the first collection ever
taken; `claimTransition` takes `for update`, so two resolvers racing the same transaction
serialise; the callback body can only ever trigger a lookup, never set a status.

**The session's real finding is that we could not have known any of that from CI.** `STATUS.md`
called both PRs green. Neither was — `Audits / A8` had been red on every branch since PR #2 —
and more importantly CI ran no tests, no typecheck, no lint and no build, so it was never in a
position to agree or disagree. Four more defects were sitting behind that: 9 vulnerabilities
including 3 critical, an ESLint setup that could not run non-interactively (so `npm run verify`
could not complete either), and `npm run check:momo` dead on `main` with a `ReferenceError`
since #9. Each was found by writing the gate, not by using the code.

**Two guards were themselves wrong, and both are now fixed.** `safe-merge.mjs` reported #10's
successful merge as a failure, because `--delete-branch` could not remove a local branch a
worktree was holding and the script concluded from the exit code instead of asking GitHub —
which is M2, committed by the script written to prevent M2. And the no-floating-point guard
fired on its own prose in any Windows checkout, because `core.autocrlf` gave it CRLF and its
comment-stripping regex cannot cross a `\r`; it passed in the tree that authored the file and on
Linux CI, which is the worst possible combination. `.gitattributes` fixes the cause.

**Supabase project 1 is live and verified** — all three values belong to ref
`edtduvwbejdfahkmfort`. It is in `eu-west-2`, London, measured from the database host's IPv6
against AWS's published ranges. That is a decision for Tumo (Q6), cheapest to reverse today.

**Still blocked:** Q1, the submission deadline. Asked a third time.

### 2026-09-02 (session 1 close) — credentials verified, money engine built, agents stopped

**Landed on main:** PRs #1-#5 and #7-#9. Planning set, code structure, frozen contracts, starter
UI, the audit suite, vitest + the split property suite, MoMo provisioning + smoke scripts, the
Telegram health check, `MISTAKES.md` with a guard per entry.

**Awaiting review:** #10 (money engine, 231 tests) and #11 (frontend shell, landing page, context
sidebar, 90 tests). Both green. Both stopped mid-task, not mid-thought — see each PR's "not
finished" section.

**Credentials:** MoMo (5 values, all three products verified live), Gemini, ElevenLabs, Telegram,
and two generated secrets. **Supabase is the only required one missing.**

**The finding that mattered:** the sandbox test MSISDN table was wrong in four of six cases, and the
sandbox emits an undocumented `CREATED` status. Caught because `momoAPIs.md` rated those facts `[P]`
and forbade coding against them. `46733123454` is the demo number — the only one that exercises a
real async resolution, ~25s.

**Mistakes recorded:** M1-M7 in `MISTAKES.md`, each with a guard. Two are now scripts
(`pr:merge`, `agent:worktree`) that make the mistake structurally hard rather than merely
remembered.

**Not started:** escrow, disbursements, outbox drain, stokvel, bills, Telegram bot handlers, the
agent route, voice, USSD, offline. No audit has been run yet.


Newest first. One short entry per working session so a fresh thread can catch up fast.

### 2026-09-02 (later) — Voice, agent and generative UI added to scope
- Repo created, made **public**, pushed, `main` protected. Protection **verified empirically**:
  a direct push was rejected by GitHub with `GH013`.
- Project moved to `C:\MoMo-Hack`.
- **Key finding: ElevenLabs supports no South African language** — not isiZulu, isiXhosa,
  Afrikaans, Sesotho or any other. Its African coverage is Swahili, Hausa, Lingala and Somali
  (Eleven v3 only). Lelapa AI's MoMo Kasivula does cover SA languages but has no free tier ($9.99/mo).
  Resolved with ADR-0011: provider-per-language voice plus a pre-generated phrase bank, which also
  brings ongoing voice cost to R0 and makes cached replies faster than live TTS.
- Studied `C:\Social-Assembly-Main` for the chat/artifact pattern. Adopted: CopilotKit generative
  UI, doc-chip-in-chat plus artifact panel, `ArtifactContext` with patch helpers, auto-open on
  stream completion, generated design tokens with a CI diff gate. Rejected: A2A multi-agent
  (violates ADR-0001) and `maxDuration = 120` (impossible on Vercel Hobby's 10s cap).
  Noted: that project has **no automated E2E tests**, so we take the flow and add the suite.
- ADRs 0011-0014 written. 0014 is the important one: **the agent cannot move money.**
- Still needed from Tumo: the frontend template, and the confirmed submission deadline.

### 2026-09-02 — Planning session
- Confirmed: 3-4 week timeline, solo + agents, daily-use wallet with gigs as the earn engine,
  single Next.js monolith.
- Verified against live sources: MoMo sandbox flow and test MSISDNs, MoMo SA strategy
  (TechCabal 1 Sep 2026), stokvel and taxi market sizing, SA Q2 2026 unemployment,
  GitHub Free branch-protection limits, Vercel Hobby cron limits, Supabase free-tier limits.
- Free GitHub account constraint surfaced mid-session, which forced ADR-0005 (public repo)
  and ADR-0006 (GitHub Actions as scheduler).
- Wrote `CLAUDE.md`, `PLANNING.md`, `STATUS.md`, `docs/00` through `docs/10`, ADRs 0001-0010.
- No code written. Next session starts at F1.
