# ADR-0006 — GitHub Actions as the scheduler

- Status: Accepted
- Date: 2026-09-02

## Context

The system needs recurring background work: reconciling non-terminal MoMo transactions, draining the
outbox, sweeping expired escrow, running stokvel collections, and pinging Supabase to stop it
pausing after 7 idle days.

Verified: **Vercel Hobby permits 2 cron jobs per project, each running at most once per day.** More
frequent cron expressions are rejected at deploy time. Reconciliation on a 24-hour cycle is not
reconciliation.

## Options

**A. Vercel Cron.** The obvious choice, and unusable — once per day, two jobs.

**B. Supabase `pg_cron`.** Available, but the work needs to call MoMo over HTTP; doing that from
inside Postgres means `pg_net` and putting orchestration logic in SQL, where it is hard to test.

**C. An external cron service** (cron-job.org, EasyCron). Free tiers exist, but it is another account,
another secret, another dependency, and no version control over the schedule.

**D. GitHub Actions on a `schedule` trigger**, calling secret-guarded HTTP routes.

## Decision

**D.** A workflow on `*/5 * * * *` that `curl`s `/api/cron/{job}` with a `CRON_SECRET` bearer token,
plus `/api/health` to keep Supabase awake. Unlimited free minutes because the repo is public
(ADR-0005).

## Consequences

**Easier:** the schedule lives in version control and changes through a PR like everything else.
`workflow_dispatch` gives a manual trigger, which is genuinely useful during the demo (the stokvel
run in `docs/08` §3 uses it). No new account, no new secret store. The cron routes are ordinary
HTTP endpoints, so they are testable like any other route.

**Harder:** GitHub's scheduled workflows are **best-effort** and can be delayed under platform load
(R5). We accept this because every cron route is idempotent and catches up — delay costs latency,
not correctness. Scheduled workflows are also disabled after 60 days of repository inactivity, which
is irrelevant for a 28-day project.

**Design obligation this creates:** every cron route must be safe to run twice, concurrently, or
late. That is enforced by the guarded-transition pattern (`docs/03` §3) and tested explicitly.
