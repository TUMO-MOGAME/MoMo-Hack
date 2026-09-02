# PHASE-3 — A2 Design fidelity

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (no pinned sha)
**Result:** 0 Critical · 1 High · 1 Medium · 3 Low · 0 waived · 2 not measured

**Scope:** `src/design/tokens.ts`, `src/app/globals.css`, every component under `src/components/**`
and `src/app/**`. **Graded on structure and system adherence, not aesthetics**, per the overlay —
the frontend template may yet supersede visual choices.
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**Token discipline in this codebase is close to exemplary, and I say that having tried hard to find
a violation.** Across 80 source files there is not one raw palette utility, not one inline
`oklch()`, and not one hex colour outside two places that are both correct: third-party brand marks
(MTN's own `#003A58` / `#FFCB05`, which *must* be literal — a partner's logo repainted in your
tokens is a worse error than a hardcoded hex) and a single documented `themeColor` meta value that
cannot take a CSS variable. Components reference roles — `bg-card`, `text-muted-foreground`,
`border-border` — throughout.

I verified the token source of truth against the generated stylesheet **programmatically, role by
role**: all 30 light roles and all 30 dark roles agree exactly, as do the radius scale and all three
motion durations with their two easing curves. The glowing-black palette is intact — pure black
ground, `0.08` cards, white foreground.

**The one real problem is that none of this is enforced.** `src/design/tokens.ts` instructs the
reader to regenerate the CSS with `npm run tokens` and **that script does not exist** — there is no
`tokens` entry in `package.json`. So `globals.css` is not generated from the tokens at all; it is a
second hand-maintained copy that happens, today, to agree. The overlay names this exactly: *"we
have adopted the architecture but not yet the gate — flag it if Phase 3 closes without one."*
Phase 3 is closing without one.

A correction worth recording, because it nearly became this report's headline: my first comparison
script reported **all 30 dark roles drifted**. It had matched the *light* scale out of `tokens.ts`
against the `.dark` CSS block. Re-extracting by line range gave zero drift. A structurally wrong
comparison produced a confident, specific, entirely false Critical — which is the argument for the
generated gate rather than for any hand-written checker, mine included.

### Top 5 risks

1. **No token generation and no drift gate (A2-01, High).** The documented command does not exist.
2. **Two files can silently disagree (A2-01 consequence).** They agree now; nothing keeps them so.
3. **`themeColor` is a third hand-maintained copy of `--background`** (A2-02, Low), untested.
4. **One arbitrary Tailwind value** (A2-03, Low) — the only crack in an otherwise clean system.
5. **Visual comparison against the reference was not possible** — see *Not measured*.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A2-01 | **High** | `src/design/tokens.ts:11-13`, `package.json` scripts | `tokens.ts` says *"regenerating the CSS (`npm run tokens`), never hand-editing globals.css"*. **There is no `tokens` script.** `npm run tokens` errors. So `globals.css` is not generated — it is a parallel hand-maintained copy, and there is no `tokens:check` CI job either | The single source of truth is only a source of truth if something derives from it. Verified today: 60/60 colour roles agree. Nothing prevents tomorrow's edit to one file from missing the other, and a brand colour that differs between the token file and the shipped CSS is invisible until someone reads both. The overlay asks for this to be flagged if Phase 3 closes without a gate | Write `scripts/tokens.mjs` to emit the `:root` and `.dark` blocks from `colors`, wire it as `npm run tokens`, and add a `tokens:check` CI job that regenerates and fails on `git diff --exit-code`. Until then, at minimum a unit test asserting every role in `tokens.ts` equals its `globals.css` value — the comparison this audit ran by hand |
| A2-02 | Medium | `src/app/layout.tsx:20` | `themeColor: '#000000'` is a **third** hand-maintained copy of dark `--background`, in a different colour space (hex, not oklch) | The comment correctly explains that `<meta name="theme-color">` cannot take a CSS variable, so the literal is unavoidable. What is avoidable is it drifting unnoticed — it paints the phone's browser chrome, so a mismatch shows as a visible seam above the app | Assert in a test that this hex equals the dark `--background`. `oklch(0 0 0)` is exactly `#000000`, so the assertion is exact today |
| A2-03 | Low | `src/app/(app)/chat/page.tsx:185` | `lg:max-w-[520px]` — the only arbitrary Tailwind value in the codebase | Not wrong, but it is the seam where a token system starts to leak. One magic number invites the next | Promote to a token (`--width-conversation`) or add a comment explaining why 520px specifically |
| A2-04 | Low | `src/components/brand-marks.tsx:54-57` | Literal `#000` / `#fff` inside the TUMO OLO wordmark SVG | **Correct as written** — a logo is a fixed asset, not a themed component, and repainting it with tokens would be the actual error. Reported only so the next audit does not re-flag it | None. Add a one-line comment saying the literals are deliberate |
| A2-05 | Low | `src/design/tokens.ts` | `tokens.ts` exports `glow`, `fonts`, `fontSize` — but components consume the CSS variables, never the TS objects. Nothing imports `tokens` | The TS module is documentation that compiles. That is fine and even useful for a future native app, but a reader may assume it is load-bearing. Related to A2-01: once generation exists, it becomes load-bearing for real | Note it in the docstring, or let A2-01's generator consume it — which resolves both |

---

## 3. Not measured

| Check | Why |
|---|---|
| **Visual comparison against the design reference** | `C:/Social-Assembly-Main/apps/web` is outside this repo and outside the working directories available to this session. Structural adherence was graded from `tokens.ts` and the overlay's written list of deliberate differences; pixel or screenshot comparison was not possible |
| **Rendered appearance on the target device** | The overlay's target is a 320px low-end Android in direct sunlight. No device and no emulator was available. Contrast was computed numerically instead — see A3, which found two non-text failures |

---

## 4. Waived

None.

---

## 5. Remediation roadmap

**Quick wins (< 1 day)**
- A2-02 and a token-equality unit test — perhaps 30 minutes, and it converts this audit's manual
  verification into something permanent.
- A2-03, A2-04, A2-05 — comments.

**Medium**
- A2-01 — `scripts/tokens.mjs` plus the `tokens:check` CI job. This is the finding that matters;
  everything else in this report is tidiness.

**Structural**
- None. The architecture is right; only its enforcement is missing.

---

## 6. What is genuinely good

- **Sixty colour roles verified identical between `tokens.ts` and `globals.css`** — light and dark,
  every role, compared mechanically rather than by eye.
- **Zero raw palette utilities across 80 files.** No `bg-neutral-900`, no `text-slate-700`, no
  inline `oklch()` in any component. This is the rule the overlay cares most about and it holds
  completely.
- **The radius and motion scales are used, not just declared.** `240ms cubic-bezier(0.4, 0, 0.2, 1)`
  for the message rise, `400ms cubic-bezier(0.2, 0, 0, 1)` for the sheet — the emphasized curve on
  the larger movement, which is the correct pairing and not an accident.
- **The deliberate differences from the reference are all documented in the overlay and all
  observed in the code.** MTN gold instead of violet, no `sidebar-*` roles, no `critical` tier,
  phone-first chat. Nothing has drifted into the codebase unrecorded.
- **The one literal colour in the app carries a comment explaining why it must be literal.** That is
  the difference between an exception and a lapse.
