# ADR-0001 — Single Next.js + TypeScript monolith

- Status: Accepted
- Date: 2026-09-02

## Context

The original brief specified Next.js for the frontend, Node/Express for webhooks, and Python/FastAPI
for escrow, splits and credit scoring. That is three runtimes, three test setups, three CI
pipelines, three deploy targets — for one developer with 25 days.

## Options

**A. Next.js + FastAPI + Node (as briefed).** Python is genuinely nicer for scoring algorithms, and
"polyglot microservices" looks impressive on an architecture slide. But it triples the operational
surface, adds a network hop inside every payment flow, adds cold starts on a free Render/Railway
tier, and means a type change has to be manually mirrored across a language boundary.

**B. Next.js + Supabase Edge Functions (Deno).** Keeps money logic next to the database and off
Vercel's 10s request path. But it is a second toolchain with weaker local DX, and the free tier's
500k invocations are not the constraint we are actually fighting.

**C. Single Next.js + TypeScript monolith.** One language, one deploy, one CI, one type system
end to end. Supabase for Postgres, auth, storage and realtime.

## Decision

**C.** One Next.js 15 application on Vercel, TypeScript throughout, Supabase for persistence.

## Consequences

**Easier:** types flow from the database schema to the UI with no manual mirroring. One `npm run
verify`. One deploy. Any agent can work anywhere without a context switch. Refactoring across the
whole stack is a single operation.

**Harder:** we are bound by Vercel Hobby's 10s function limit, which rules out any synchronous
long-running work. We accept this — see ADR-0006 and `docs/01` §6. It forces the async design a
payments system needs anyway, so the constraint improves the architecture rather than compromising it.

**Given up:** the polyglot architecture slide. We replace it with something better — a ledger, an
idempotency story, and a load test that asserts correctness. Technical judges respond to that more
than to a service count.
