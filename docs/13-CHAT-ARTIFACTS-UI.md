# 13 — Chat, Artifacts and Generative UI

The app is **a conversation that grows a dashboard**. You talk; the right view appears next to what
you said. No menus to learn, no tabs to hunt through.

Reference implementation studied: `C:\Social-Assembly-Main` (CopilotKit + AG-UI + artifact panel).
This document records what we take from it, what we change, and why.

---

## 1. What we take from Social-Assembly

Read on 2026-09-02: `apps/web/src/app/a2a-chat.tsx` (2,365 lines),
`artifact-panel.tsx` (1,346), `artifact-context.tsx`, `components/chat-cards/*`,
`api/copilotkit/route.ts`.

| Pattern | What it is | Verdict |
|---|---|---|
| **CopilotKit generative UI** | `useCopilotAction({ name, parameters, render })` — the agent calls a named action, the frontend renders it, progressively, keyed on `status: inProgress \| executing \| complete` | ✅ **adopt** |
| **Doc chip in chat + full artifact in a panel** | The chat holds a compact clickable card; the full thing lives beside it and is re-openable without re-prompting | ✅ **adopt** — this is the core idea |
| **`ArtifactContext`** | One `Artifact \| null` in React context, with `openArtifact` / `closeArtifact` / `updateArtifact` and typed patch helpers | ✅ **adopt** |
| **Discriminated union `Artifact` type** | `type: "markdown" \| "content-plan" \| "dashboard" \| …` with per-type optional payloads | ⚠️ **adapt** — we use a stricter zod-validated union |
| **Auto-open on `status === "complete"`** | The panel opens itself once the agent finishes streaming | ✅ **adopt** |
| **Patch actions** (`patchContentPlanPost`) | The agent edits one field of an open artifact rather than regenerating it | ✅ **adopt** — excellent for "actually make it R300" |
| **Generated design tokens with a CI diff gate** | `tokens:check` runs the generator and fails on `git diff --exit-code` | ✅ **adopt** — it belongs in our quality gate |
| **A2A / Python remote agents** | Separate Python services for specialist agents | ❌ **reject** — violates ADR-0001, and we do not need multi-agent |
| **`maxDuration = 120` on the runtime route** | Long-running orchestration in one request | ❌ **impossible for us** — see §2 |
| **Automated E2E tests** | *There are none in that project* | ➕ **we add them** (`docs/04` §9) |

> Worth stating plainly: Social-Assembly has **no `playwright.config`, no `*.spec.ts`, no test
> script**. So "how the E2E works" there means the end-to-end *user flow*, not an automated suite.
> We take the flow and add the suite — the demo script becomes an executable spec (`docs/08`).

---

## 2. The constraint that forces a change

Social-Assembly's CopilotKit route sets `maxDuration = 120` and orchestrates remote Python agents.
**Vercel Hobby caps functions at 10 seconds** (`docs/10` §1). A 120-second orchestration is simply
not available to us.

**Our adaptation — short turns, fast model, streaming:**

| Decision | Why |
|---|---|
| **Groq**, not a multi-agent orchestrator | Sub-200ms time-to-first-token; a turn completes in 1-3s, comfortably inside the budget |
| **One agent, many tools** — no A2A hop | Every extra service is another 10s budget to fit inside, and ADR-0001 says one runtime |
| **Streaming response, Edge runtime** | First token reaches the user in well under a second |
| **Data comes from tool calls against our own DB** | Fast, local, and the numbers are real |
| **Nothing long-running in a chat turn** | Anything slow is queued to the scheduler and the answer arrives as a notification |

This is a constraint that improves the product: a money assistant that takes 120 seconds to answer
"what's my balance" is a bad money assistant regardless of hosting.

---

## 3. The artifact type system

Social-Assembly's `Artifact` interface uses optional payload fields per type
(`plan?`, `dashboard?`, `settings?`). That is pragmatic but permits invalid combinations. Because
ours renders **money**, we use a strict discriminated union validated by zod at the boundary.

```ts
// src/lib/artifacts/schema.ts — the ONLY definition of what the agent may render
export const ArtifactSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wallet'),          balances: z.array(BalanceSchema) }),
  z.object({ type: z.literal('transactions'),    items: z.array(TxnSchema), filter: FilterSchema }),
  z.object({ type: z.literal('split-breakdown'), fare: MoneySchema, parts: z.array(SplitPartSchema) }),
  z.object({ type: z.literal('stokvel'),         pool: PoolSchema, members: z.array(MemberSchema) }),
  z.object({ type: z.literal('job'),             job: JobSchema, timeline: z.array(StepSchema) }),
  z.object({ type: z.literal('job-list'),        jobs: z.array(JobSummarySchema) }),
  z.object({ type: z.literal('trust-score'),     score: z.number(), factors: z.array(FactorSchema) }),
  z.object({ type: z.literal('receipt'),         txn: TxnSchema, token: z.string().optional() }),
  z.object({ type: z.literal('confirm'),         action: ProposedActionSchema }),   // see §5
  z.object({ type: z.literal('chart'),           spec: ChartSpecSchema }),
  z.object({ type: z.literal('markdown'),        content: z.string() }),
]).and(z.object({ id: z.string(), title: z.string() }));

export type Artifact = z.infer<typeof ArtifactSchema>;
```

**Three rules that make this safe for a payments app:**

1. **The agent never emits HTML or markup.** It emits data matching this schema. There is no
   `dangerouslySetInnerHTML` anywhere in the artifact renderer. In a public repo, in a fintech app,
   letting an LLM emit markup is not a risk worth taking for any amount of flexibility.
2. **Every `Money` in an artifact is a `bigint` minor-unit string that came from a tool call.**
   The agent cannot type a number into an artifact. If it did not read it from the ledger, it cannot
   render it. This is validated: `MoneySchema` requires a matching `sourceTxnId` or `sourceAccountId`.
3. **Validation failure renders an error card, never a blank panel.** A malformed artifact is a bug
   we want to see, not one we want to hide.

---

## 4. The flow

```
  USER                    AGENT                      ARTIFACT PANEL
   │
   │ "How much did I make this week?"
   │   (typed, or spoken — docs/12)
   ├──────────────────────────>│
   │                           │ tool: get_transactions({ since: '7d' })
   │                           ├──────> ledger (real numbers)
   │                           │<──────
   │                           │
   │  "You made R340 this week │ tool: render_artifact({ type: 'transactions', … })
   │   — mostly from washes."  ├────────────────────────────>│
   │<──────────────────────────┤                             │ status: inProgress
   │                           │                             │   skeleton chip in chat
   │  [ 📄 This week · R340 ]  │                             │ status: complete
   │      ↑ doc chip in chat   │                             │   panel auto-opens
   │                           │                             │   phrase bank speaks summary
   │
   │ "Actually show me just the taxi washes"
   ├──────────────────────────>│
   │                           │ tool: patch_artifact({ filter: { category: 'WASH' } })
   │                           ├────────────────────────────>│
   │                           │                             │ panel updates in place
   │                           │                             │ chat does NOT re-render a new chip
```

**The chip stays in the chat history.** Scroll back three days and tap it — the artifact reopens
from stored data, no re-prompting, no new LLM call. That is the single best thing about
Social-Assembly's design and we keep it exactly.

---

## 5. The confirmation artifact — where money is different

Every other artifact is a view. `confirm` is the one that can lead to money moving, so it obeys
different rules.

```
┌──────────────────────────────────────┐
│  Confirm payment                     │
│                                      │
│  Pay          R 45.00                │   ← rendered from the PROPOSAL,
│  To           Nomsa M. (•••• 4821)   │     not from the agent's prose
│  For          Kombi wash · Rank 42   │
│  From         Your wallet · R 340.00 │
│                                      │
│  ┌────────────┐  ┌────────────────┐  │
│  │   Cancel   │  │  Confirm  →    │  │   ← the user's thumb is the
│  └────────────┘  └────────────────┘  │     only thing that moves money
└──────────────────────────────────────┘
```

Non-negotiable rules, enforced structurally:

1. **`propose_*` tools have no database write access.** They construct a proposal object and return
   it. There is no code path from the agent to the ledger.
2. **The proposal is server-signed and short-lived.** It carries an HMAC over
   `(amount, payee, purpose, user, expiry)` with a 120-second expiry. The confirm endpoint
   re-validates it server-side and ignores anything the client sends alongside it.
3. **The card renders from the signed proposal, never from the chat text.** If the agent *says*
   "R45" but the proposal contains R450, the card shows R450 — and the mismatch is logged as an
   incident. The user always sees the truth, not the narration.
4. **No auto-confirm. No "just do it" mode. Ever.** Not even for small amounts, not even if a user
   asks for it.
5. **Voice can never confirm.** A spoken "yes" does not move money — the tap does. Voice is noisy,
   voice is spoofable, and a TV in the background should not be able to pay someone.

This is the answer to *"what if your AI hallucinates a payment?"*, and it is worth rehearsing:
*"It can't. The agent can only propose. The proposal is server-signed, the card renders from the
signature, and a human thumb is the only thing in the system that moves money."*

---

## 6. Phone first

Social-Assembly's artifact panel is a desktop side panel. Our users are on phones at a taxi rank.

| Viewport | Chat | Artifact |
|---|---|---|
| < 768px (the real case) | Full screen | **Bottom sheet**, drag to expand to full, swipe down to dismiss |
| 768-1024px | Left 60% | Right 40%, collapsible |
| > 1024px | Left 480px | Fills the rest |

Mobile specifics that matter:
- The sheet opens to **40% height** by default so the conversation stays visible — the chat is the
  spine of the app, not a sidebar.
- `confirm` artifacts always open **full height**. A payment confirmation must never be partly
  off-screen.
- Every artifact must be legible at **320px** and readable in direct sunlight (contrast ≥ 4.5:1).
- Touch targets ≥ 44px. Confirm and Cancel are far apart and visually distinct — never two grey
  buttons side by side.

---

## 7. Voice and artifacts together

When an artifact opens, the phrase bank speaks a one-line summary (`docs/12` §3):

| Artifact | Spoken |
|---|---|
| `wallet` | "You have R{amount} available." |
| `split-breakdown` | "Your R{fare} fare was split four ways." |
| `stokvel` | "The pool is at R{amount}. {name} is next." |
| `confirm` | "Confirm: pay R{amount} to {name}. Tap confirm when you are ready." |
| `receipt` | "Paid. R{amount} to {name}." |

All of these are pre-generated fragments plus number clips, so they play in ~50ms at zero cost.

**Accessibility is the same mechanism, not an extra one.** The artifact's spoken summary *is* its
`aria-label`, so a screen-reader user and a voice user get the same sentence. Build the voice layer
and the accessibility layer falls out of it.

---

## 8. Files

```
src/lib/artifacts/
  schema.ts            zod discriminated union — the contract
  registry.tsx         type -> renderer component map
  proposal.ts          HMAC signing and verification for `confirm`

src/app/(app)/chat/
  chat-context.tsx     message history
  artifact-context.tsx open / close / patch      (pattern from Social-Assembly)
  artifact-panel.tsx   panel + bottom sheet
  actions.ts           useCopilotAction definitions

src/components/artifacts/
  wallet.tsx  transactions.tsx  split-breakdown.tsx  stokvel.tsx
  job.tsx  job-list.tsx  trust-score.tsx  receipt.tsx  confirm.tsx
  chart.tsx  markdown.tsx  error.tsx

src/components/chips/
  artifact-chip.tsx    the compact in-chat card

app/api/agent/route.ts   Edge runtime, streaming, Groq
```

---

## 9. Testing

The generative layer is exactly where a demo silently breaks, so it is tested like everything else.

| Level | What |
|---|---|
| Unit | Every artifact renders from a fixture; every zod schema rejects malformed input |
| Property | A `Money` field can never render a value without a `sourceTxnId` |
| Contract | Every tool the agent can call returns something matching its schema |
| Integration | `propose_payment` writes nothing to the database; the signed proposal round-trips; an expired proposal is refused |
| **Security** | A tampered proposal (amount changed client-side) is rejected server-side |
| E2E | Say a phrase → the right artifact opens with the right numbers |
| E2E | Agent says one amount, proposal contains another → the card shows the proposal's amount |
| a11y | Every artifact passes axe; the spoken summary matches the `aria-label` |

**The agent itself is not unit-tested for phrasing** — LLM output is not deterministic and asserting
on it produces flaky tests nobody trusts. We test the *scaffolding*: tool contracts, schema
validation, proposal integrity, and rendering. Those are deterministic and they are what can
actually hurt a user.

---

## 10. Design tokens

Adopted from Social-Assembly directly, including the CI gate: tokens are generated from a single
source, and `tokens:check` regenerates them and fails on `git diff --exit-code`. Drift between the
token source and the compiled CSS becomes a red check rather than a slow visual rot.

**The frontend template Tumo is providing takes precedence** over any visual choice implied here.
This document specifies *structure and behaviour* — what an artifact is, how it opens, what the
agent may emit — not colour, type or spacing. Those come from the template.

---

## 11. Free-tier position

| Dependency | Licence / cost |
|---|---|
| `@copilotkit/react-core`, `react-ui`, `runtime` | MIT, self-hosted, free |
| Groq | free tier, no card (`docs/12` §4.1) |
| Gemini Flash (fallback) | free tier, no card |
| `zod`, `react`, `next` | free |

**No new paid dependency.** CopilotKit's runtime is self-hosted inside our own Next.js app, so there
is no CopilotKit Cloud account and no per-seat cost.
