# ADR-0005 — Public repository

- Status: Accepted
- Date: 2026-09-02

## Context

The user requires `main` to be protected, and requires zero spend (free GitHub account).
`MoMo-Hack` was created private.

Verified against GitHub's documentation: **rulesets and classic branch protection are available on
public repositories with GitHub Free; private repositories require Pro, Team or Enterprise.**
GitHub Actions minutes are **unlimited on public repositories** and capped at **2,000/month** on
private repositories on the free plan.

The scheduler (ADR-0006) runs every 5 minutes — roughly 4,300 minutes/month — which alone exceeds
the private-repo allowance before CI is even counted.

## Options

**A. Private + free.** No branch protection at all, and the scheduler is unaffordable. Two of the
user's explicit requirements fail simultaneously.

**B. Private + GitHub Pro ($4/mo).** Works, but violates the zero-spend constraint.

**C. Public + free.** Branch protection, unlimited Actions minutes, free CodeQL and Dependabot.
Cost: the code is visible to other entrants.

**D. Private during the build, public before submission.** Loses branch protection during exactly
the period it protects anything, and the Actions budget is tight throughout.

## Decision

**C.** The repository is public. Confirmed by the user on 2026-09-02 after being shown the trade-off.

## Consequences

**Easier:** everything the user asked for works, for free — protected `main`, a real CI gate, a
5-minute reconciler, CodeQL, Dependabot. A public, linear, conventionally-committed history is also
direct evidence for the "this is a real build" claim, and it is the answer to *"did you really build
this in a month?"* (`docs/08` §5).

**Harder:** the idea is visible to other entrants (R9). Accepted — hackathons are judged on
execution, and a competitor reading our repo still has to build it.

**Non-negotiable consequence:** **any secret ever committed is permanently compromised.** Not
"probably fine after a force-push" — public repositories are scraped continuously. Hence
`gitleaks` pre-commit *and* in CI, and an immediate-rotation policy (`docs/06` §8). This is the
single largest new risk this decision introduces, and it is entirely preventable.
