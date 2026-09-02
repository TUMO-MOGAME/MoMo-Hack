# PHASE-3 — A3 Accessibility (WCAG 2.2 AA)

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (no pinned sha)
**Result:** 0 Critical · 3 High · 2 Medium · 2 Low · 0 waived · 4 not measured

**Scope:** `/`, `/chat`, `/ledger` as rendered in production; `src/components/**`;
`src/app/globals.css`. Graded against the overlay's user — **320px low-end Android, cracked screen,
direct Highveld sunlight, one hand, often a second or third language.**
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**The deliberate accessibility work here is real and unusually thoughtful, and it is undercut by
three specific measured failures.** The design decisions that are hardest to get right have been got
right: money is announced in words rather than digits ("twelve rand fifty", not "R one two five
zero"), the confirmation card stacks Confirm and Cancel vertically with Cancel *lowest* because
that is where a thumb lands first, `prefers-reduced-motion` genuinely suppresses the animations
rather than merely declaring a media query, the bottom sheet is a real modal dialog with a focus
trap and focus restoration, and there is a skip link because the conversation is long. An audit
overlay asked for each of those and each is present in the code.

Text contrast is excellent — I computed all thirteen text pairings numerically from the OKLCH
tokens, and the **worst is 7.26:1** against a 4.5:1 requirement. In direct sunlight that margin is
the difference between reading your balance and not, and the overlay is right to weight it heavily.
The team has earned that.

**But non-text contrast fails, and it fails on the two elements that matter most.** The border token
is white at 12% opacity, which composites to **1.27:1** against the black ground where SC 1.4.11
requires 3:1 — and that token draws the message input's boundary (`--input`, 15%, **1.39:1**). On a
cracked screen in sunlight the text field a user must find to type into is, by measurement,
effectively not there. The focus ring is 3px and well-considered, and at 35% white it lands at
**3.01:1** on the page background — passing by 0.01 — and **2.98:1** on cards, where it fails.

Separately, **`/chat` renders no headings at all** — zero `h1`–`h6` in the production HTML. The
wordmark is a `<span>` inside a link. A screen-reader user landing on the primary surface of this
product has no heading structure to orient by.

None of these are hard to fix. All three are token or markup changes measured in minutes, and
together they would move this from "thoughtfully designed" to "actually accessible".

### Top 5 risks

1. **Input and border contrast at 1.27–1.39:1 (A3-01, High).** The overlay says treat unreadability
   as High, and this is the control the user must find first.
2. **`/chat` has no heading structure (A3-02, High).** Zero headings on the main surface.
3. **Focus ring fails 3:1 on card surfaces (A3-03, High).** 2.98:1 — and the ring is the whole
   keyboard story.
4. **axe has never been run (Q7).** Programmatic checks are a *floor*, and this floor is unmeasured.
5. **No real keyboard journey or AT testing** — no Playwright, no screen reader. See *Not measured*.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A3-01 | **High** | `src/app/globals.css` dark block — `--border: oklch(1 0 0 / 12%)`, `--input: oklch(1 0 0 / 15%)` | **Measured non-text contrast: border 1.27:1, input 1.39:1** against the black ground. SC 1.4.11 requires **3:1** for the boundary of any control a user must perceive. Computed by OKLCH→sRGB conversion with alpha compositing over `--background` | The message composer's border is `border-input`. On the overlay's target device — cracked screen, direct sunlight — the field the user must locate to say anything at all has no perceivable edge. The same token draws every card outline and every secondary button | Raise `--input` to roughly 38–40% white (≈3:1) and `--border` to about 30% for interactive boundaries. If the soft look is wanted for *decorative* dividers, split the role: a low-contrast `--divider` for non-informational rules, and a compliant `--border` for anything bounding a control |
| A3-02 | **High** | `src/app/(app)/chat/page.tsx:182-200` | **`/chat` renders no headings.** Verified against production HTML: `curl … /chat \| grep -oE "<h[1-6]"` returns nothing. `/` returns 21 headings, `/ledger` returns 4 | WCAG 2.4.6 and 1.3.1. Heading navigation is the primary way a screen-reader user orients on a page, and this is the product's main surface. The wordmark is a `<span>` inside a `<Link>`, so there is not even an implicit title | Make the wordmark an `<h1>` (it can still be a link), or add a visually-hidden `<h1>Chat with MoMo Kasi</h1>`. The `<section aria-label="Conversation">` and `<main aria-label="Messages">` landmarks are already correct and should stay |
| A3-03 | **High** | `src/app/globals.css:186` — `--ring: oklch(1 0 0 / 35%)` | **Focus ring measured 3.01:1 on `--background` and 2.98:1 on `--card`.** Passes on the page ground by 0.01; fails on every card, panel and sheet | SC 1.4.11 and 2.4.11. `globals.css` correctly puts a 3px offset ring on every interactive element — the geometry is right and the colour is one step too dim. A focus indicator that fails on the surfaces where forms and buttons actually sit is the keyboard user's whole experience | Raise `--ring` to about 50% white. That gives roughly 4.2:1 on cards with headroom, and the ring is transient so the visual cost is small. This is a one-value change |
| A3-04 | Medium | No axe run anywhere; no `axe-core`, `jest-axe` or Playwright in `package.json` | Q7 is owed and has never run. `tests/unit/components/accessibility.test.ts` asserts specific design claims well, but it is not a programmatic sweep | Automated checks catch perhaps a third of WCAG issues — but they catch that third reliably and cheaply, and this project has never seen the list. It is also the cheapest design credibility available before a judged demo | `axe-core` against the rendered markup the existing component tests already produce (`renderToStaticMarkup`), so no browser and no Playwright dependency is needed |
| A3-05 | Medium | `src/app/(app)/chat/page.tsx:196` | The message log is `role="log"` with `aria-live="polite"` on the scroll container, and the thinking indicator is a second `aria-live` region nested inside it | Nested live regions can double-announce, and a `role="log"` that also contains a status region may re-read prior messages on some AT. Not verified with a real screen reader — see *Not measured* | Move the thinking indicator's `role="status"` out of the log container, or drop `aria-live` from the log and let the status region alone announce |
| A3-06 | Low | `src/app/(app)/chat/page.tsx` mic button | Voice is unbuilt, and the control is honest about it — `aria-label="Voice input is not available yet — use the message box"`, and it focuses the composer | Correct per the overlay ("voice is never the only route to anything"). Reported only to note that a control whose sole action is *"focus that other control"* is arguably better as no control at all until S8c — a screen-reader user tabs onto a button that does nothing they wanted | Either keep as-is with the honest label (defensible) or hide it until voice lands |
| A3-07 | Low | `src/components/artifacts/*` | Status is carried by colour role names (`success`, `warning`, `destructive`) | The overlay requires colour never be the only signal. Spot-checked: the transaction rows carry a text status alongside the tint, so this appears satisfied — but it was not verified across every artifact type | Confirm every status surface pairs colour with text or an icon |

---

## 3. Not measured

| Check | Why |
|---|---|
| **axe / automated WCAG sweep** | No axe dependency installed. Q7 remains owed — this is a gap, not a pass (A3-04) |
| **Real keyboard journeys** | Requires Playwright (Q4, `docs/04` §9), which is not installed. Focus trap, focus restoration and Escape-to-dismiss are asserted by the unit tests and by reading `use-modal.ts`, never driven |
| **Screen-reader verification** | No AT available in this environment. Announcement order, the nested-live-region concern in A3-05, and the aria-label/spoken-summary equivalence are read from source, not heard |
| **Rendering at 320px on the target device** | No device or emulator. Touch targets are `min-h-11` / `size-11` (44px) throughout the chat, which is correct by inspection, but layout at 320px in sunlight is unverified |

---

## 4. Waived

None.

---

## 5. Remediation roadmap

**Quick wins (< 1 day) — all three Highs are in this bucket**
- A3-03: raise `--ring` to ~50%. One line.
- A3-01: raise `--input` and split `--border`. Two lines plus a decision about dividers.
- A3-02: one `<h1>` on `/chat`.

Together perhaps an hour, and they close every High in this report. **Worth doing before the
presentation** — judges score design, and contrast is the part that is measurable in front of them.

**Medium**
- A3-04: axe over the existing static markup, no new browser dependency.
- A3-05: un-nest the live regions.

**Structural**
- Playwright keyboard journeys (Q4) and a real screen-reader pass. Phase 6.

---

## 6. What is genuinely good

Each verified, not taken from a comment:

- **Text contrast is excellent everywhere.** Thirteen pairings computed from the tokens; the worst
  is `destructive` at **7.26:1**, foreground at **21:1**, `muted-foreground` at **8.46:1**. For the
  stated user — sunlight, cracked screen — that margin is the feature.
- **Money is announced in words.** `1250n → "12 rand 50 cents"`, pinned by tests. A screen reader
  reading "R one two five zero" to someone checking their balance is the failure this avoids, and
  almost nobody thinks of it.
- **The confirmation card's button layout is reasoned, and the reasoning is right.** Stacked not
  adjacent; Cancel lowest because that is where a thumb lands first. The overlay grades an adjacent
  pair of similar buttons as High, and this build pre-empted it.
- **`prefers-reduced-motion` actually suppresses.** `animation-duration: 0.01ms !important` across
  `*`, `::before` and `::after`, plus `scroll-behavior: auto` — and `scrollBehaviour()` in the chat
  honours the same setting in JavaScript, which is the half everyone forgets.
- **The modal is a real modal.** `role="dialog"`, `aria-modal="true"`, focus moved in on open,
  trapped while open, Escape to dismiss, and focus restored to the opener on close —
  `use-modal.ts` implements all four, and its docstring names them as the four requirements.
- **The focus ring is 3px with a 2px offset, on `:where()` so specificity stays at 0.** The
  geometry is deliberately oversized for a cracked screen in sunlight. Only the colour is short.
- **A skip link exists** and points at the composer, which is the control a keyboard user actually
  wants — not a generic "skip to content".
