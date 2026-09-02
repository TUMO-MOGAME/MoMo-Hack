# 02 — Data Model

Postgres on Supabase. Every statement here becomes a migration in `supabase/migrations/`.

## 1. Rules that override convenience

1. **Money is `bigint`, in minor units (cents).** Never `numeric`, never `float8`, never `real`.
   `R12.50` is `1250`. A `numeric` column for money is a code-review rejection.
2. **No balance columns.** A balance is `SUM(amount)` over `ledger_entry`. If you find yourself
   adding `wallet.balance`, you are about to introduce a bug that will silently lose money.
   Use the `wallet_balance` view, or a materialised view if performance demands it later.
3. **Ledger tables are append-only.** No `UPDATE`, no `DELETE`. Corrections are reversing entries.
   Enforced by trigger, not by convention.
4. **RLS denies by default on every table.** A table without an explicit policy is unreadable.
5. **Ledger tables have no policies at all** — service-role only. The browser cannot reach them.
6. **Every timestamp is `timestamptz`.** Server time is UTC; the UI renders `Africa/Johannesburg`.

---

## 2. Chart of accounts

Every cent in the system sits in exactly one account. Account types decide the sign convention and
who is allowed to go negative.

| Account type | Normal balance | Can go negative? | Represents |
|---|---|---|---|
| `MOMO_SETTLEMENT` | debit (positive) | no | Money we hold at MTN. The system's only external door. |
| `USER_WALLET` | credit (negative) | **no** | What we owe a user. Spendable. |
| `ESCROW_HOLD` | credit | no | Funds committed to a job, not spendable by either party yet. |
| `STOKVEL_POOL` | credit | no | A group's pooled savings. |
| `FAMILY_LOCKED` | credit | no | Purpose-locked remittance. Spendable only on its allowed category. |
| `FUEL_POOL` | credit | no | A rank's automated fuel/parts stokvel. |
| `INSURANCE_POOL` | credit | no | A rank's micro-insurance float. |
| `DRIVER_FLOAT` | credit | no | Driver's daily wage accrual. |
| `PLATFORM_FEE` | credit | yes | Our revenue. |
| `ROUNDING` | credit | yes | Absorbs split remainders. Should stay within a few cents. |
| `SUSPENSE` | credit | yes | Inbound money we cannot yet attribute. **Must be zero at end of day.** |

Sign convention: **positive = debit, negative = credit.** A journal sums to exactly zero.

---

## 3. Core tables

### 3.1 Identity

```sql
create type user_role as enum ('COMMUTER','WORKER','DRIVER','OWNER','RANK_ADMIN','FUNDER');

create table profile (
  id            uuid primary key references auth.users(id) on delete cascade,
  msisdn        text not null unique,           -- E.164, this is the MoMo identity
  display_name  text not null,
  roles         user_role[] not null default '{COMMUTER}',
  telegram_id   bigint unique,                  -- links the bot to the account
  trust_score   int  not null default 0,        -- Ubuntu Trust Score, derived, cached
  created_at    timestamptz not null default now()
);
create index on profile (telegram_id);
```

A person can hold several roles. Nomsa is a `WORKER` and a `COMMUTER`; Thabo is an `OWNER` and a
`COMMUTER`. Modelling roles as an array rather than separate tables is what lets one wallet serve
the whole loop.

### 3.2 The ledger

```sql
create type account_type as enum (
  'MOMO_SETTLEMENT','USER_WALLET','ESCROW_HOLD','STOKVEL_POOL','FAMILY_LOCKED',
  'FUEL_POOL','INSURANCE_POOL','DRIVER_FLOAT','PLATFORM_FEE','ROUNDING','SUSPENSE'
);

create table ledger_account (
  id           uuid primary key default gen_random_uuid(),
  type         account_type not null,
  owner_id     uuid references profile(id),      -- null for system accounts
  subject_id   uuid,                             -- job id, stokvel id, rank id...
  currency     char(3) not null default 'ZAR',
  allow_negative boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (type, owner_id, subject_id, currency)
);

create table journal (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                    -- 'FARE_SPLIT','ESCROW_HOLD','PAYOUT',...
  reference_id uuid,                             -- momo_transaction.id when externally driven
  memo         text,
  created_at   timestamptz not null default now()
);

create table ledger_entry (
  id           bigserial primary key,
  journal_id   uuid not null references journal(id),
  account_id   uuid not null references ledger_account(id),
  amount       bigint not null,                  -- minor units; + debit, - credit
  created_at   timestamptz not null default now(),
  constraint amount_nonzero check (amount <> 0)
);
create index on ledger_entry (account_id, id);
create index on ledger_entry (journal_id);
```

### 3.3 The invariants, enforced by the database

Tests are good. Constraints the database refuses to violate are better — they hold even when an
agent writes code nobody reviewed carefully.

```sql
-- I1: a journal must balance to zero.
create or replace function assert_journal_balanced() returns trigger
language plpgsql as $$
declare total bigint;
begin
  select coalesce(sum(amount),0) into total
    from ledger_entry where journal_id = new.journal_id;
  if total <> 0 then
    raise exception 'journal % does not balance: %', new.journal_id, total;
  end if;
  return null;
end $$;

create constraint trigger journal_balances
  after insert on ledger_entry
  deferrable initially deferred          -- checked at COMMIT, after all rows are in
  for each row execute function assert_journal_balanced();

-- I2: the ledger is append-only.
create or replace function reject_mutation() returns trigger
language plpgsql as $$
begin raise exception 'ledger is append-only'; end $$;

create trigger no_update_ledger before update or delete on ledger_entry
  for each row execute function reject_mutation();
create trigger no_update_journal before update or delete on journal
  for each row execute function reject_mutation();

-- I3: accounts that may not go negative, do not.
create or replace function assert_no_overdraft() returns trigger
language plpgsql as $$
declare bal bigint; neg boolean;
begin
  select allow_negative into neg from ledger_account where id = new.account_id;
  if neg then return null; end if;
  select coalesce(sum(amount),0) into bal
    from ledger_entry where account_id = new.account_id;
  -- credit-normal accounts hold negative balances; magnitude must not exceed what was funded
  if bal > 0 then
    raise exception 'account % overdrawn: %', new.account_id, bal;
  end if;
  return null;
end $$;

create constraint trigger no_overdraft
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_no_overdraft();
```

> `deferrable initially deferred` matters. Postings arrive one row at a time; the balance is only
> meaningful once the whole journal is in. Checking per-row would reject every legitimate journal.

### 3.4 Balances

```sql
create view wallet_balance as
select a.id as account_id, a.type, a.owner_id, a.subject_id, a.currency,
       -abs(coalesce(sum(e.amount),0)) filter (where a.type <> 'MOMO_SETTLEMENT') as raw,
       coalesce(sum(e.amount),0) as signed_balance,
       abs(coalesce(sum(e.amount),0)) as display_minor
from ledger_account a
left join ledger_entry e on e.account_id = a.id
group by a.id;
```

Spendable balance for a user excludes holds by construction: escrow lives in a *different account*,
so it simply is not in their `USER_WALLET` sum. No `available_balance` arithmetic to get wrong.

### 3.5 MoMo transactions

```sql
create type momo_product as enum ('COLLECTION','DISBURSEMENT','REMITTANCE');
create type momo_status  as enum ('INITIATED','PENDING','SUCCESSFUL','FAILED','REJECTED','TIMEOUT');

create table momo_transaction (
  id             uuid primary key,               -- WE generate it. It IS the X-Reference-Id.
  product        momo_product not null,
  status         momo_status  not null default 'INITIATED',
  amount_minor   bigint not null check (amount_minor > 0),
  currency       char(3) not null default 'ZAR',
  counterparty   text not null,                  -- MSISDN
  external_id    text not null,                  -- our human-readable ref, no spaces
  purpose        text not null,                  -- 'FARE','ESCROW_FUND','PAYOUT','STOKVEL',...
  subject_id     uuid,                           -- job / trip / stokvel run
  initiated_by   uuid references profile(id),
  request_body   jsonb,
  last_response  jsonb,
  attempt_count  int not null default 0,
  journal_id     uuid references journal(id),    -- set exactly once, on SUCCESSFUL
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index on momo_transaction (status, created_at) where status in ('INITIATED','PENDING');
create unique index on momo_transaction (external_id);
```

`journal_id` being nullable-but-write-once is the guard against double-posting: the writer sets it
in the same transaction as the status change, and a partial unique index makes a second attempt fail.

```sql
-- one journal per momo transaction, ever
create unique index momo_txn_single_journal on momo_transaction (id) where journal_id is not null;
```

### 3.6 Split rules

```sql
create table split_rule (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,                     -- 'RANK','ROUTE','GLOBAL'
  scope_id    uuid,
  version     int not null,
  active_from timestamptz not null default now(),
  unique (scope, scope_id, version)
);

create table split_component (
  rule_id       uuid not null references split_rule(id) on delete cascade,
  account_type  account_type not null,
  basis_points  int not null check (basis_points between 0 and 10000),
  label         text not null,
  primary key (rule_id, account_type)
);

-- the sum must be exactly 10000 bps
create or replace function assert_split_complete() returns trigger
language plpgsql as $$
declare total int;
begin
  select coalesce(sum(basis_points),0) into total
    from split_component where rule_id = coalesce(new.rule_id, old.rule_id);
  if total <> 10000 then
    raise exception 'split rule % sums to % bps, expected 10000', coalesce(new.rule_id, old.rule_id), total;
  end if;
  return null;
end $$;

create constraint trigger split_complete
  after insert or update or delete on split_component
  deferrable initially deferred
  for each row execute function assert_split_complete();
```

The 60/25/10/5 split is `6000 / 2500 / 1000 / 500`. Rules are **versioned and never edited** — a
change creates version N+1, so an old fare can always be re-explained with the rule that applied
when it was collected. That is what makes the ledger auditable.

**Remainder handling.** `1250 * 6000 / 10000 = 750` exactly, but most amounts do not divide cleanly.
Algorithm, implemented once in `src/domain/split.ts`:

```
1. For each component: floor(amount * bps / 10000).
2. remainder = amount - sum(floors)
3. Distribute the remainder one cent at a time, in descending order of fractional part,
   ties broken by a stable component ordering.
4. Assert sum(parts) == amount. Property-tested exhaustively.
```

The `ROUNDING` account exists as a safety net; if the algorithm is right it stays empty, and a
non-zero rounding balance is an alarm.

### 3.7 Domain tables (abbreviated)

```sql
create table rank (
  id uuid primary key default gen_random_uuid(),
  name text not null, suburb text not null,
  admin_id uuid references profile(id),
  split_rule_id uuid references split_rule(id)
);

create table vehicle (
  id uuid primary key default gen_random_uuid(),
  rank_id uuid not null references rank(id),
  owner_id uuid not null references profile(id),
  driver_id uuid references profile(id),
  registration text not null, qr_token text not null unique
);

create type job_state as enum ('OPEN','ACCEPTED','FUNDED','PROOF_SUBMITTED','APPROVED','RELEASED','DISPUTED','CANCELLED');

create table job (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profile(id),
  worker_id uuid references profile(id),
  rank_id uuid references rank(id),
  title text not null, category text not null,
  price_minor bigint not null check (price_minor > 0),
  state job_state not null default 'OPEN',
  escrow_account_id uuid references ledger_account(id),
  proof_path text,                              -- Supabase Storage key
  created_at timestamptz not null default now()
);

create table stokvel (
  id uuid primary key default gen_random_uuid(),
  name text not null, admin_id uuid not null references profile(id),
  contribution_minor bigint not null check (contribution_minor > 0),
  cadence text not null,                        -- 'WEEKLY','MONTHLY'
  next_run_at timestamptz not null,
  pool_account_id uuid not null references ledger_account(id)
);

create table stokvel_member (
  stokvel_id uuid references stokvel(id) on delete cascade,
  profile_id uuid references profile(id),
  payout_position int not null,
  joined_at timestamptz not null default now(),
  primary key (stokvel_id, profile_id)
);
```

### 3.8 Outbox

```sql
create table outbox (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null,                    -- 'TELEGRAM','SMS','PUSH'
  recipient    text not null,
  payload      jsonb not null,
  status       text not null default 'PENDING',  -- PENDING | SENT | DEAD
  attempts     int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index on outbox (status, next_attempt_at) where status = 'PENDING';
```

Written in the same transaction as the ledger. Drained by the GitHub Actions scheduler. This is why
a webhook replayed five times sends one message: the outbox row is written once, inside the guarded
transition that only one caller wins.

---

## 4. RLS policy matrix

Every table gets `alter table X enable row level security;`. Then:

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `ledger_account` | — | — | full |
| `ledger_entry` | — | — | insert only |
| `journal` | — | — | insert only |
| `momo_transaction` | — | select **own** (`initiated_by = auth.uid()`) | full |
| `outbox` | — | — | full |
| `profile` | — | select/update **own** | full |
| `wallet_balance` (view) | — | select where `owner_id = auth.uid()` | full |
| `job` | select where `state = 'OPEN'` | select own or assigned; update per state machine | full |
| `stokvel` | — | select where member | full |
| `stokvel_member` | — | select where same stokvel | full |
| `vehicle` | — | select where owner/driver/rank admin | full |
| `rank` | select (public) | select | full |
| `split_rule`, `split_component` | select (public — transparency is a feature) | select | full |

**Showing split rules publicly is deliberate.** A driver being able to see exactly how the 60/25/10/5
was applied to their fare is the trust story. It goes on a slide.

Example, the non-obvious one:

```sql
create policy stokvel_visible_to_members on stokvel for select to authenticated
using (exists (
  select 1 from stokvel_member m
  where m.stokvel_id = stokvel.id and m.profile_id = auth.uid()
));
```

Every policy in this matrix gets a test that asserts both the allow **and** the deny.
See `docs/04-TESTING-STRATEGY.md` §5.

---

## 5. Migration conventions

```
supabase/migrations/
  20260903090000_initial_schema.sql
  20260903093000_ledger_invariants.sql
  20260904100000_split_rules.sql
  ...
supabase/seed.sql          -- demo data, idempotent, safe to re-run
```

Rules:
1. **Forward-only.** Never edit a migration that is on `main`. Add a new one.
2. **One concern per migration.** Easier to read in a PR, easier to bisect.
3. **Every migration must apply cleanly to an empty database *and* to the current staging database.**
   CI checks both.
4. **Destructive statements need a comment** explaining why, and a line in the PR description.
5. **Generated types are committed.** `supabase gen types typescript` output lives in
   `src/types/database.ts`, and CI fails if it drifts from the migrations. This catches the classic
   "migration merged, types stale, runtime explodes" failure.

Local loop:
```bash
supabase start          # docker postgres + studio
supabase db reset       # replay every migration + seed, from scratch
npm run db:types        # regenerate src/types/database.ts
```

Deploy: `supabase db push` runs on merge to `main`, against **staging** first, then production,
gated on the migration-replay job passing.
