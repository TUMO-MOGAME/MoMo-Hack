-- 0000_identity.sql — identity, the prerequisite for the ledger.
--
-- Source of truth: docs/02-DATA-MODEL.md §3.1 and §4.
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION (docs/02 §5 rule 2, one concern per
-- migration): `ledger_account.owner_id` and `momo_transaction.initiated_by`
-- both reference `profile(id)`. The ledger migration cannot declare those
-- foreign keys unless `profile` already exists. This migration does nothing
-- else.
--
-- Forward-only. Once this is on `main` it is never edited (CLAUDE.md #4).

create extension if not exists pgcrypto;

create type user_role as enum ('COMMUTER','WORKER','DRIVER','OWNER','RANK_ADMIN','FUNDER');

-- A person holds SEVERAL roles at once — Nomsa is a WORKER and a COMMUTER,
-- Thabo is an OWNER and a COMMUTER. Roles as an array rather than separate
-- tables is what lets one wallet serve the whole earn/circulate/spend loop.
create table profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  msisdn        text not null unique,           -- E.164; this is the MoMo identity
  display_name  text not null,
  roles         user_role[] not null default '{COMMUTER}',
  telegram_id   bigint unique,                  -- links the bot to the account
  trust_score   int not null default 0,         -- Ubuntu Trust Score, derived + cached
  created_at    timestamptz not null default now()
);

create index profile_telegram_id_idx on profile (telegram_id);

-- RLS denies by default on every table (docs/02 §1 rule 4).
alter table profile enable row level security;

-- docs/02 §4: authenticated may select/update their OWN row. Nothing else.
create policy profile_select_own on profile
  for select to authenticated
  using (id = auth.uid());

create policy profile_update_own on profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert policy: rows are created server-side with the service-role key on
-- sign-up. A client that could insert an arbitrary `profile` could claim an
-- arbitrary MSISDN, which is a MoMo identity (ADR-0010).
