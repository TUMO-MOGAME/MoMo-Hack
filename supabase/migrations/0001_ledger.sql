-- 0001_ledger.sql — the double-entry ledger, the MoMo transaction log, the
-- outbox and the versioned split rules.
--
-- Source of truth: docs/02-DATA-MODEL.md §2, §3, §4.
--
-- The four rules this file enforces in the database rather than in code, because
-- a constraint the database refuses to violate holds even when an agent writes
-- code nobody reviewed carefully (docs/02 §3.3):
--
--   I1  every journal sums to exactly zero
--   I2  the ledger is append-only
--   I3  accounts that may not go negative, do not
--   I4  a momo_transaction terminal status is immutable and its journal_id
--       is write-once
--
-- Forward-only. Once this is on `main` it is never edited (CLAUDE.md #4).

-- ===========================================================================
-- 1. Chart of accounts (docs/02 §2)
-- ===========================================================================

create type account_type as enum (
  'MOMO_SETTLEMENT','USER_WALLET','ESCROW_HOLD','STOKVEL_POOL','FAMILY_LOCKED',
  'FUEL_POOL','INSURANCE_POOL','DRIVER_FLOAT','PLATFORM_FEE','ROUNDING','SUSPENSE'
);

-- Sign convention: positive = debit, negative = credit. A journal sums to zero.
--
-- MOMO_SETTLEMENT is the only DEBIT-normal account in the chart: it is the money
-- we hold at MTN, the system's single external door. Every other account is
-- CREDIT-normal — it records what we OWE someone, so it sits at or below zero.
--
-- This function is what makes the overdraft trigger (I3) correct in both
-- directions. See the note above assert_no_overdraft().
create or replace function account_is_debit_normal(t account_type)
  returns boolean
  language sql
  immutable
  parallel safe
as $fn$
  select t = 'MOMO_SETTLEMENT'
$fn$;

create table ledger_account (
  id             uuid primary key default gen_random_uuid(),
  type           account_type not null,
  owner_id       uuid references profile(id),   -- null for system accounts
  subject_id     uuid,                          -- job id, stokvel id, rank id, category...
  currency       char(3) not null default 'ZAR',
  allow_negative boolean not null default false,
  created_at     timestamptz not null default now()
);

-- docs/02 §3.2 specifies `unique (type, owner_id, subject_id, currency)`.
-- A plain UNIQUE constraint would NOT do the job: in Postgres NULLs compare as
-- distinct, so ('MOMO_SETTLEMENT', null, null, 'ZAR') could be inserted twice and
-- the system would silently grow two settlement accounts. Coalescing the
-- nullable columns to the nil UUID gives real uniqueness on every supported
-- Postgres version (NULLS NOT DISTINCT would need PG15+).
create unique index ledger_account_natural_key on ledger_account (
  type,
  coalesce(owner_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
  currency
);

create table journal (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,      -- 'FARE_SPLIT','ESCROW_FUND','PAYOUT',...
  reference_id uuid,               -- momo_transaction.id when externally driven
  memo         text,
  created_at   timestamptz not null default now()
);

create index journal_reference_id_idx on journal (reference_id);

create table ledger_entry (
  id         bigserial primary key,
  journal_id uuid not null references journal(id),
  account_id uuid not null references ledger_account(id),
  amount     bigint not null,      -- MINOR UNITS. + debit, - credit. Never numeric.
  created_at timestamptz not null default now(),
  constraint amount_nonzero check (amount <> 0)
);

create index ledger_entry_account_idx on ledger_entry (account_id, id);
create index ledger_entry_journal_idx on ledger_entry (journal_id);

-- ===========================================================================
-- 2. The invariants (docs/02 §3.3)
-- ===========================================================================

-- I1 — a journal must balance to zero.
--
-- DEFERRABLE INITIALLY DEFERRED matters. Postings arrive one row at a time and
-- the balance is only meaningful once the whole journal is in, so this is
-- checked at COMMIT. Checking per-row would reject every legitimate journal.
create or replace function assert_journal_balanced() returns trigger
language plpgsql as $fn$
declare total bigint;
begin
  select coalesce(sum(amount), 0) into total
    from ledger_entry where journal_id = new.journal_id;
  if total <> 0 then
    raise exception 'journal % does not balance: %', new.journal_id, total;
  end if;
  return null;
end $fn$;

create constraint trigger journal_balances
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_journal_balanced();

-- I2 — the ledger is append-only. Corrections are reversing entries, never
-- edits. Enforced by trigger, not by convention.
create or replace function reject_mutation() returns trigger
language plpgsql as $fn$
begin
  raise exception 'ledger is append-only';
end $fn$;

create trigger no_update_ledger before update or delete on ledger_entry
  for each row execute function reject_mutation();

create trigger no_update_journal before update or delete on journal
  for each row execute function reject_mutation();

-- I3 — accounts that may not go negative, do not.
--
-- DEVIATION FROM docs/02 §3.3, DELIBERATE AND REPORTED:
-- the version printed in the data model checks `if bal > 0 then raise` for every
-- account. That is right for the ten CREDIT-normal account types and wrong for
-- MOMO_SETTLEMENT, which is DEBIT-normal — under the printed rule the very first
-- collection (MOMO_SETTLEMENT +A) would be rejected as "overdrawn", and the
-- system could never take a cent. The direction of the check has to follow the
-- account's normal balance, which is what account_is_debit_normal() provides.
--
-- The intent of the original — "an account that forbids it never goes negative
-- against its own normal balance" — is preserved exactly.
create or replace function assert_no_overdraft() returns trigger
language plpgsql as $fn$
declare
  bal  bigint;
  acct ledger_account%rowtype;
begin
  select * into acct from ledger_account where id = new.account_id;
  if acct.allow_negative then
    return null;
  end if;

  select coalesce(sum(amount), 0) into bal
    from ledger_entry where account_id = new.account_id;

  if account_is_debit_normal(acct.type) then
    -- Debit-normal: we cannot pay out money we do not hold at MTN.
    if bal < 0 then
      raise exception 'account % (%) overdrawn: %', acct.id, acct.type, bal;
    end if;
  else
    -- Credit-normal: the magnitude owed must not exceed what was funded.
    if bal > 0 then
      raise exception 'account % (%) overdrawn: %', acct.id, acct.type, bal;
    end if;
  end if;

  return null;
end $fn$;

create constraint trigger no_overdraft
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_no_overdraft();

-- ===========================================================================
-- 3. Balances (docs/02 §3.4)
-- ===========================================================================

-- There are no balance columns anywhere in this schema. A balance is a SUM over
-- ledger_entry, always (docs/02 §1 rule 2). Spendable balance excludes holds by
-- construction: escrow lives in a DIFFERENT account, so it is simply not in the
-- USER_WALLET sum. No available_balance arithmetic to get wrong.
--
-- DEVIATION FROM docs/02 §3.4, DELIBERATE AND REPORTED: the printed view has a
-- `raw` column written as `-abs(coalesce(sum(e.amount),0)) filter (where ...)`.
-- FILTER must attach directly to an aggregate, so that expression does not
-- parse, and the column is not referenced anywhere. Dropped. `signed_balance`
-- and `display_minor` are kept verbatim.
create view wallet_balance
with (security_invoker = on)
as
select
  a.id       as account_id,
  a.type,
  a.owner_id,
  a.subject_id,
  a.currency,
  coalesce(sum(e.amount), 0)      as signed_balance,
  abs(coalesce(sum(e.amount), 0)) as display_minor
from ledger_account a
left join ledger_entry e on e.account_id = a.id
group by a.id, a.type, a.owner_id, a.subject_id, a.currency;

-- security_invoker = on means this view is evaluated with the CALLER's rights,
-- so it inherits the ledger's deny-all RLS instead of laundering past it. A view
-- over an unpolicied table with the default (definer) semantics would hand the
-- whole ledger to `anon`, which in a PUBLIC repository (ADR-0005) is the single
-- most damaging mistake available. Belt and braces:
revoke all on wallet_balance from anon, authenticated;

-- ===========================================================================
-- 4. MoMo transactions (docs/02 §3.5)
-- ===========================================================================

create type momo_product as enum ('COLLECTION','DISBURSEMENT','REMITTANCE');
-- `CREATED` is not in MTN's documented vocabulary, but the live sandbox emits
-- it between accepting a request and starting to process it — verified
-- 2026-09-02 (momoAPIs.md §10). It is non-terminal and claimable, exactly like
-- PENDING. Leaving it out would break the one number that demonstrates
-- asynchronous resolution, which is also the demo number.
create type momo_status  as enum ('INITIATED','CREATED','PENDING','SUCCESSFUL','FAILED','REJECTED','TIMEOUT');

-- `id` is generated by US and sent as X-Reference-Id (momoAPIs.md §6). Our
-- primary key IS MTN's idempotency key, which is where the whole idempotency
-- story comes from: a second payment would need a second uuid, and only the
-- caller that created this row has one. There is no `default gen_random_uuid()`
-- here on purpose — the application must supply the id it is about to transmit,
-- persisted BEFORE a packet leaves (docs/03 §2).
create table momo_transaction (
  id            uuid primary key,
  product       momo_product not null,
  status        momo_status not null default 'INITIATED',
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null default 'ZAR',
  counterparty  text not null,                 -- MSISDN. Never logged in full (POPIA s105/106).
  external_id   text not null,                 -- human-readable ref, no spaces
  purpose       text not null,                 -- 'FARE','ESCROW_FUND','PAYOUT','STOKVEL',...
  subject_id    uuid,                          -- job / trip / stokvel run
  initiated_by  uuid references profile(id),
  request_body  jsonb,
  last_response jsonb,
  attempt_count int not null default 0,
  journal_id    uuid references journal(id),   -- set exactly once, on SUCCESSFUL
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  -- momoAPIs.md §6: an externalId containing spaces is rejected by MTN. Catch it
  -- here rather than discovering it as a 400 mid-demo.
  constraint external_id_has_no_spaces check (external_id !~ '\s')
);

-- The reconciler's working set (docs/03 §3 path B).
create index momo_transaction_unresolved_idx on momo_transaction (status, created_at)
  where status in ('INITIATED','CREATED','PENDING');

create unique index momo_transaction_external_id_key on momo_transaction (external_id);

-- I4 — terminal statuses are immutable and journal_id is write-once.
--
-- docs/02 §3.5 proposes `create unique index ... on momo_transaction (id) where
-- journal_id is not null` for this. That index cannot actually fire: `id` is
-- already the primary key, so it can never see a duplicate. The real guard is
-- this trigger, plus the `and journal_id is null` predicate in the writer's
-- UPDATE. The index is kept anyway, harmless, so the schema still matches the
-- document a reviewer will have open.
create unique index momo_txn_single_journal on momo_transaction (id)
  where journal_id is not null;

create or replace function assert_momo_transaction_guards() returns trigger
language plpgsql as $fn$
begin
  -- momoAPIs.md §12 rule 1: a late callback contradicting a terminal state is
  -- logged and discarded, never applied.
  if old.status in ('SUCCESSFUL','FAILED','REJECTED','TIMEOUT')
     and new.status is distinct from old.status then
    raise exception 'momo_transaction %: terminal status % is immutable (attempted %)',
      old.id, old.status, new.status;
  end if;

  -- A second journal for one transaction is a double-posting. Physically refuse.
  if old.journal_id is not null and new.journal_id is distinct from old.journal_id then
    raise exception 'momo_transaction %: journal_id is write-once', old.id;
  end if;

  -- The id IS the X-Reference-Id. Changing it would orphan the upstream record.
  if new.id is distinct from old.id then
    raise exception 'momo_transaction %: id is immutable', old.id;
  end if;

  new.updated_at := now();
  return new;
end $fn$;

create trigger momo_transaction_guards
  before update on momo_transaction
  for each row execute function assert_momo_transaction_guards();

-- ===========================================================================
-- 5. Outbox (docs/02 §3.8)
-- ===========================================================================

-- Written in the SAME transaction as the ledger. This is why a webhook replayed
-- five times sends one message: the outbox row is written once, inside the
-- guarded transition that only one caller wins.
create table outbox (
  id              uuid primary key default gen_random_uuid(),
  channel         text not null,                   -- 'TELEGRAM','SMS','PUSH'
  recipient       text not null,
  payload         jsonb not null,
  status          text not null default 'PENDING', -- PENDING | SENT | DEAD
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint outbox_status_valid check (status in ('PENDING','SENT','DEAD'))
);

create index outbox_pending_idx on outbox (status, next_attempt_at)
  where status = 'PENDING';

-- ===========================================================================
-- 6. Split rules (docs/02 §3.6)
-- ===========================================================================

-- Versioned and NEVER edited: a change creates version N+1, so an old fare can
-- always be re-explained with the rule that applied when it was collected. That
-- is what makes the ledger auditable, and it is the trust story on the slide.
create table split_rule (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,        -- 'RANK','ROUTE','GLOBAL'
  scope_id    uuid,
  version     int not null,
  active_from timestamptz not null default now(),
  constraint split_rule_scope_valid check (scope in ('RANK','ROUTE','GLOBAL'))
);

create unique index split_rule_version_key on split_rule (
  scope,
  coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
  version
);

create table split_component (
  rule_id      uuid not null references split_rule(id) on delete cascade,
  account_type account_type not null,
  basis_points int not null check (basis_points between 0 and 10000),
  label        text not null,
  primary key (rule_id, account_type)
);

create or replace function assert_split_complete() returns trigger
language plpgsql as $fn$
declare
  rid   uuid;
  total int;
begin
  rid := coalesce(new.rule_id, old.rule_id);

  -- A cascade delete of the parent rule removes its components legitimately.
  if not exists (select 1 from split_rule where id = rid) then
    return null;
  end if;

  select coalesce(sum(basis_points), 0) into total
    from split_component where rule_id = rid;

  if total <> 10000 then
    raise exception 'split rule % sums to % bps, expected 10000', rid, total;
  end if;
  return null;
end $fn$;

create constraint trigger split_complete
  after insert or update or delete on split_component
  deferrable initially deferred
  for each row execute function assert_split_complete();

-- ===========================================================================
-- 7. Row level security (docs/02 §4, ADR-0010)
-- ===========================================================================

-- Every table. No exceptions. A table without an explicit policy is unreadable.
alter table ledger_account   enable row level security;
alter table journal          enable row level security;
alter table ledger_entry     enable row level security;
alter table momo_transaction enable row level security;
alter table outbox           enable row level security;
alter table split_rule       enable row level security;
alter table split_component  enable row level security;

-- LEDGER TABLES GET NO POLICIES AT ALL. Not a restrictive policy — none.
-- RLS with zero policies denies every role except service_role, which bypasses
-- it. That is exactly ADR-0010: the browser never touches the ledger, and the
-- schema is readable by attackers anyway because the repo is public (ADR-0005),
-- so the guarantee has to be structural.
--   ledger_account   — no policies
--   journal          — no policies
--   ledger_entry     — no policies
--   outbox           — no policies

-- The one row a user is allowed to see about their own money movements.
-- Read-only: there is no insert/update/delete policy, so a client cannot
-- fabricate a transaction or advance its status.
create policy momo_transaction_select_own on momo_transaction
  for select to authenticated
  using (initiated_by = auth.uid());

-- Showing split rules publicly is DELIBERATE. A driver being able to see exactly
-- how the 60/25/10/5 was applied to their fare is the trust story.
create policy split_rule_public_read on split_rule
  for select to anon, authenticated
  using (true);

create policy split_component_public_read on split_component
  for select to anon, authenticated
  using (true);
