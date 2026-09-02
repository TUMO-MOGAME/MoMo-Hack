-- 0002_lockdown_and_bigint_balances.sql
--
-- Two defects found the moment the integration suite first ran against a real
-- Postgres. Neither was visible to any unit test, and neither could have been:
-- both are properties of the DATABASE, not of our TypeScript.
--
-- A NEW migration rather than an edit to 0001, because 0001 is on `main` and
-- migrations are forward-only and immutable once merged (CLAUDE.md #4).
--
-- ===========================================================================
-- 1. CRITICAL — anon and authenticated could TRUNCATE the ledger
-- ===========================================================================
--
-- 0001 enables RLS on every table and deliberately gives the ledger tables NO
-- policies, on the stated reasoning that "RLS with zero policies denies every
-- role except service_role" (ADR-0010). That is true for SELECT, INSERT,
-- UPDATE and DELETE. It is NOT true for TRUNCATE.
--
-- TRUNCATE is not a row operation, so row level security never sees it. It is
-- governed solely by the TRUNCATE table privilege — and Supabase's default
-- privileges grant ALL privileges on every new table in `public` to `anon` and
-- `authenticated`. Measured on the live database:
--
--     set local role anon;
--     truncate ledger_entry cascade;   -- SUCCEEDED
--
-- The entire ledger, erasable by the anonymous role. The append-only triggers
-- do not help: they fire on UPDATE and DELETE, and TRUNCATE is neither.
--
-- Not remotely exploitable today — PostgREST does not expose TRUNCATE, so the
-- anon API key alone cannot reach it, and a direct connection needs the
-- database password. But ADR-0010's guarantee is meant to be STRUCTURAL, and
-- "it happens to be unreachable through the API we currently use" is not that.
--
-- So: revoke everything, then grant back only what is deliberately public.
-- Deny by default, exactly as `docs/02` §1 rule 4 says.

revoke all on ledger_account   from anon, authenticated;
revoke all on journal          from anon, authenticated;
revoke all on ledger_entry     from anon, authenticated;
revoke all on outbox           from anon, authenticated;
revoke all on schema_migration from anon, authenticated;

-- A user may READ their own transactions (policy momo_transaction_select_own
-- in 0001) and nothing else. No insert, no update, no delete, and above all no
-- truncate: marking yourself paid is the most valuable forgery in the system.
revoke all    on momo_transaction from anon, authenticated;
grant  select on momo_transaction to authenticated;

-- Split rules are public on purpose — a driver seeing exactly how the
-- 60/25/10/5 applied to their fare is the trust story (0001 §7). Read only.
revoke all    on split_rule      from anon, authenticated;
revoke all    on split_component from anon, authenticated;
grant  select on split_rule      to anon, authenticated;
grant  select on split_component to anon, authenticated;

-- `profile` keeps its policies from 0001 (select/update own). Those need the
-- matching grants and nothing more.
revoke all on profile from anon, authenticated;
grant  select, update on profile to authenticated;

-- The view inherits from its base tables and is already security_invoker, but
-- 0001's `revoke all ... from anon, authenticated` on it ran before these
-- default privileges could be re-examined. Restate it.
revoke all on wallet_balance from anon, authenticated;

-- ===========================================================================
-- 2. `wallet_balance` exposed money as `numeric`, not `bigint`
-- ===========================================================================
--
-- CLAUDE.md #1: every monetary column is bigint. The view's columns were
-- `numeric`, because in Postgres `sum(bigint)` returns `numeric` — it widens to
-- avoid overflow. Nothing in 0001 asked for numeric; it arrived on its own.
--
-- Worth being precise about the risk, because `numeric` is NOT a float and is
-- exact: no value has been rounded. The problem is the contract. `docs/02` and
-- rule 1 promise bigint end to end, `postgres.ts`'s `toBigInt` is built around
-- that promise, and a `numeric` that arrives as a JS number is exactly the
-- ADR-0004 bug. The type should say what we mean.
--
-- Note what caught it: the CI "Money guards" job greps MIGRATIONS for banned
-- type names, and the text `sum(e.amount)` contains none of them. A static grep
-- over source can never see a type the database infers. Only the live schema
-- check in tests/integration could, and it did on its first run.
--
-- A view's column types cannot be changed by CREATE OR REPLACE, so drop first.

drop view if exists wallet_balance;

create view wallet_balance
with (security_invoker = on)
as
select
  a.id       as account_id,
  a.type,
  a.owner_id,
  a.subject_id,
  a.currency,
  coalesce(sum(e.amount), 0)::bigint      as signed_balance,
  abs(coalesce(sum(e.amount), 0))::bigint as display_minor
from ledger_account a
left join ledger_entry e on e.account_id = a.id
group by a.id, a.type, a.owner_id, a.subject_id, a.currency;

revoke all on wallet_balance from anon, authenticated;
