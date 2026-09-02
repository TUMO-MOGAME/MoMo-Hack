# ADR-0016 — Phase gates run the shared audit suite

- Status: Accepted
- Date: 2026-09-02

## Context

The delivery plan had a CI quality gate (`docs/04` §12) — typecheck, lint, tests, build. That
catches regressions. It does not catch *category* problems: an inaccessible confirmation card, a
design that has drifted from its reference, a dependency with a reachable CVE, an endpoint nobody
authenticated.

Tumo maintains a company audit suite, `tumoOLO_Audits`: A1-A9 plus S1, with a runner, a severity
ladder, and a rule that a project cannot quietly adopt a softer version of a shared standard. It
reads `planning.md` and `status.md` as a contract and computes what each phase owes.

## Options

**A. Ignore it; rely on the CI quality gate.** Cheapest, and it means the accessibility and design
work is graded by nobody, on a project whose judging criteria explicitly include design.

**B. Run every audit at every phase.** Thorough and unaffordable — ten audits at depth, seven times,
inside 28 solo days. The predictable outcome is that it gets skipped once and then never resumed.

**C. Run only the audits each phase owes, at that phase's close.**

## Decision

**C.** The project adopts the suite, restructured to its contract:

- `PLANNING.md` gains a **phase plan** (`### Phase N — Name`, phases 0-6) and an **Audit suite**
  section mapping each audit to its phases.
- `STATUS.md` gains the four sections the runner parses: **Right now** (with a `Current phase` row),
  **Phase board** (whose 5th column is the audits owed), **Audit ledger**, and **Open findings** —
  plus **Deferred debt**, so a deliberate deferral is written down rather than forgotten.
- Project specifics live in overlays (`docs/audits/A1.project.md`, A2, A3, A5, A7), never by editing
  a shared audit.
- `scripts/audit.mjs` locates the suite, so its path stays a machine fact rather than a repo fact.

A phase closes only when its owed audits have run, been written to `STATUS.md`, and
`npm run audit:gate` passes with no Critical or High outstanding.

## Consequences

**Easier:** the accessibility, design-fidelity and security work gets graded by something other than
the author's own optimism — which matters on a submission judged partly on design. The overlays are
where the genuinely valuable content went: A5 now knows that a re-used `X-Reference-Id` is Critical
because it double-pays, and A7 knows to mark store readiness N/A rather than as a failure.

**Harder:** two phase-gate obligations per phase on average, each costing real time. Mitigated by
`--only`, which limits a run to exactly what the board owes — Phase 0 is two audits, not ten.

**Two honest gaps, both recorded rather than papered over:**

1. **A9 (per-PR security review) is disabled.** It needs a paid `ANTHROPIC_API_KEY` and this project
   is R0 (`docs/10`). Its role is covered by manual PR review plus A5 at phases 3, 4 and 6. It shows
   up as a gap on every report, which is correct.
2. **CI cannot reach the suite.** The suite repo is private (its S1 upstream has no licence) and this
   repo is public, so `github.token` cannot read it. The workflow therefore runs only the
   deterministic `npm audit` unattended and gates the rest behind an `AUDIT_SUITE_TOKEN` secret,
   skipping with a visible warning when absent. Prompt audits run locally at a phase close.

Neither gap is allowed to read as a pass. That is the suite's own rule, and it is the reason to
adopt it rather than invent a private checklist.
