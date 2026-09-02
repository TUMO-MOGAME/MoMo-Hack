# ADR-0010 — The browser never touches the ledger

- Status: Accepted
- Date: 2026-09-02

## Context

Supabase makes it easy and pleasant to query the database directly from the browser with RLS as the
guard. That is a good pattern for user-owned data. It is a dangerous pattern for a ledger: a single
missing or subtly wrong policy on `ledger_entry` would let a client insert postings — that is,
create money.

The repository is public (ADR-0005), so the schema and every policy are readable by anyone.

## Options

**A. RLS everywhere, including the ledger.** Elegant and uniform. But it makes the correctness of
the money supply depend on getting a `WITH CHECK` expression exactly right, in a public repo, under
deadline pressure.

**B. All database access through server routes.** Maximum control, but throws away Supabase's
realtime and direct-query ergonomics for ordinary reads, and slows every screen down.

**C. A split boundary.** User-owned data uses RLS and direct client queries. Ledger, `momo_transaction`
and `outbox` have **no policies at all** and are reachable only with the service-role key,
server-side.

## Decision

**C.** `ledger_account`, `ledger_entry`, `journal`, `momo_transaction` and `outbox` have RLS enabled
and **zero policies**, which means deny-all for `anon` and `authenticated`. Only the service-role
key reaches them, only from server code.

Users read their balances through the `wallet_balance` view, which is RLS-filtered to
`owner_id = auth.uid()` and is read-only by construction.

## Consequences

**Easier:** the worst-case outcome of an RLS mistake is now "a user reads data they should not",
never "a user creates money". The two failure classes are separated, and only one of them is
catastrophic. Realtime subscriptions still work for the live console because reads go through
policy-filtered surfaces.

**Harder:** every ledger mutation needs a server route or a `SECURITY DEFINER` function. That is a
small amount of extra plumbing, and it is exactly where we want the friction — writing money should
be deliberate.

**Enforced by:**
- An ESLint rule forbidding import of the service-role client from any `'use client'` file or
  anything under `app/(app)/`.
- An integration test asserting that an authenticated client's insert into `ledger_entry` is refused
  (`docs/04` §5).
- CI failing if any migration adds a policy to a ledger table.

Getting this wrong in a **public** repository would be the single most damaging mistake available to
us. It is worth the plumbing.
