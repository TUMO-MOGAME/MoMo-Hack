-- 0003_demo_roster.sql — the people the demo actually pays.
--
-- A NEW migration and not an edit to 0000, because 0000 is on `main` and
-- migrations are forward-only and immutable once merged (CLAUDE.md #4).
-- Purely additive: one new table, one enum. Nothing existing is altered, so
-- this cannot break a working path on the morning of a demo.
--
-- ===========================================================================
-- WHY NOT `profile`
-- ===========================================================================
--
-- `profile` is the right table for a real person and the wrong one for this,
-- for two reasons that are both hard constraints rather than preferences:
--
--   1. `profile.id` is `references auth.users(id)`. A profile row cannot exist
--      without a Supabase Auth user, so seeding six family members would mean
--      creating six auth accounts — pulling in the whole authentication
--      workstream (A5-04 / A1-01) that was deliberately deferred. The roster
--      would be holding the demo hostage to the one thing we chose not to do.
--
--   2. `profile.msisdn` is `unique`. There is ONE MTN account in this demo, so
--      six people cannot each carry its number. The unique index forbids
--      exactly the thing the demo needs.
--
-- So the roster is its own table, and it says what it is in its name.
--
-- ===========================================================================
-- WHAT IS TRUE HERE AND WHAT IS SIMULATED — read this before rendering a row
-- ===========================================================================
--
-- TRUE: these are the people in the operator's life, the relationship, and
-- what each one is for — a garden cleaner who gets paid for work, a
-- grandmother who gets sent electricity, a father who gets sent airtime.
-- That is the product's actual story and none of it is invented.
--
-- SIMULATED: where the money lands. Every payout in this demo settles to the
-- ONE verified MTN wallet, because that is the only wallet we have. A row
-- therefore does NOT carry a per-person MSISDN, and that omission is
-- deliberate — a column holding six numbers that money never reaches is a
-- fabrication with a schema around it, and this project has a `MISTAKES.md`
-- entry (M10) about exactly the class of screen that tells someone money went
-- somewhere it did not.
--
-- `settles_to_operator_wallet` is therefore NOT NULL and DEFAULT TRUE: every
-- row asserts, in the data itself, that its money goes to the operator's own
-- wallet. Any UI that renders a person from this table can read that column
-- and say so. When real payees exist, add a nullable `msisdn` column in a
-- later migration and flip the flag per row.

create type kin_relation as enum (
  'MOTHER',
  'FATHER',
  'SISTER',
  'GRANDMOTHER',
  'GRANDFATHER',
  'HELPER'
);

-- What the operator sends this person, if anything.
create type support_kind as enum ('WAGE', 'ELECTRICITY', 'AIRTIME');

create table demo_persona (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  relation      kin_relation not null,
  -- Empty array = someone in the roster who is not paid. Real: a sister you
  -- do not support is still family, and a roster that only lists payees is a
  -- payments list wearing a family's clothes.
  supports      support_kind[] not null default '{}',
  -- Minor units. bigint, never float, never numeric (CLAUDE.md #1). NULL means
  -- "no usual amount", which is different from zero.
  usual_minor   bigint,
  -- See the header. Every payout in this demo lands in the operator's own
  -- wallet; the row says so rather than a comment in a component saying so.
  settles_to_operator_wallet boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),

  constraint demo_persona_usual_minor_nonneg check (usual_minor is null or usual_minor >= 0),
  constraint demo_persona_display_name_present check (length(trim(display_name)) > 0)
);

create unique index demo_persona_relation_idx on demo_persona (relation);

-- RLS denies by default on every table (docs/02 §1 rule 4). This one is READ
-- ONLY to the browser and that is a deliberate exception to "the browser never
-- touches the ledger" (CLAUDE.md #5): the roster is not the ledger, it holds
-- no balances and no money, and the opening screen needs it before anyone has
-- authenticated. Writes stay server-side with the service-role key — there is
-- no insert, update or delete policy, so `anon` and `authenticated` cannot
-- create a payee.
alter table demo_persona enable row level security;

create policy demo_persona_select_all on demo_persona
  for select to anon, authenticated
  using (true);

-- 0002 found that Supabase grants ALL privileges on new public tables to anon
-- and authenticated, and that TRUNCATE is not governed by RLS. The same hole
-- would exist on this table, so it is closed the same way, in the same
-- migration that creates it.
revoke all on demo_persona from anon, authenticated;
grant select on demo_persona to anon, authenticated;
