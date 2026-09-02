# ADR-0009 — Ship a MoMo emulator

- Status: Accepted
- Date: 2026-09-02

## Context

The MoMo sandbox is a third party with no SLA. Outages on the collections sandbox — `token` and
`apiuser` endpoints unresponsive — were reported in July 2026 (`momoAPIs.md` §13). The entire demo
runs through it, and the demo is the submission.

Separately, CI needs to be deterministic and fast, and a test suite that fails because someone
else's sandbox is down is a test suite people learn to ignore.

## Options

**A. Depend on the sandbox everywhere.** Simple, and one outage ends the project (R1, score 20 —
the highest in the register).

**B. Mock MoMo in tests only.** Fixes CI, leaves the demo exposed.

**C. A full emulator implementing the same interface**, usable in tests, locally, and — critically —
switchable in production **without a redeploy**.

## Decision

**C.** `src/lib/momo/emulator/` implements the client interface. `MOMO_MODE` selects it, read
**per-request** rather than at build time, so flipping it in the Vercel dashboard takes effect in
about twenty seconds with no deployment.

Fixtures are **recorded from the real sandbox** (`npm run momo:record`), never hand-written, so the
emulator replays observed behaviour rather than our assumptions about it.

## Consequences

**Easier:** CI is deterministic, offline and fast. Local development needs no network. The failure
paths (`FAILED`, `REJECTED`, `TIMEOUT`, `409`, `5xx`) become trivially testable — several are hard
to trigger reliably in the real sandbox. And a sandbox outage ninety seconds before presenting
becomes a twenty-second recovery instead of a lost hackathon.

**Harder:** the emulator is code that must be maintained alongside the client, and it can drift from
reality. Mitigated by recording rather than inventing fixtures, and by preview deployments always
running against the real sandbox so drift surfaces on every PR.

**Integrity commitment, non-negotiable:** if the demo runs on the emulator, **we say so out loud**.
The line is *"the sandbox is having a moment — switching to our recorded-response emulator, which is
exactly why we built it; same code path"*. That reads as engineering maturity. Presenting an
emulator as the live sandbox, to MTN's own engineers, would be dishonest and the fastest possible
way to lose.
