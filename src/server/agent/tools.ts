/**
 * The agent's READ tools (S7b). Real ledger, real numbers, real provenance.
 *
 * ⚠️ SERVER ONLY — opens the service-role Postgres connection (ADR-0010).
 *
 * ── THE RULE THESE EXIST TO ENFORCE ──────────────────────────────────────────
 *
 * CLAUDE.md #14: *never put a number in an artifact that did not come from a
 * tool call.* Until now the honest way to keep that rule was `persona.ts`'s
 * GROUNDING block, which tells the model it has no tools and therefore may not
 * state a single amount. That is a rule enforced by asking nicely.
 *
 * These functions replace it with something structural: **the model does not
 * build artifacts at all.** The server reads the ledger and assembles the
 * artifact; the model writes prose around it. There is no code path where a
 * generated token becomes a rand value, because the artifact is finished before
 * the model is called.
 *
 * The provenance guard then proves it from the other side — any amount without a
 * `sourceTxnId` or `sourceAccountId` renders struck through and "unverified", so
 * if a number ever does sneak in from somewhere else, the UI says so unprompted.
 */

import type { Minor } from '@/domain/money';
import type { Artifact, BalanceRow, SplitPartRow, TxnRow } from '@/lib/artifacts/types';
import { DEFAULT_FARE_SPLIT, split } from '@/domain/split';
import { getPool } from '@/server/db/connection';

const PURPOSE_LABEL: Record<string, string> = {
  FARE: 'Taxi fare',
  AIRTIME: 'Airtime',
  ELECTRICITY: 'Prepaid electricity',
  SCHOOL_FEES: 'School fees',
  STOKVEL_CONTRIB: 'Stokvel contribution',
  ESCROW_FUND: 'Job funding',
  SPLIT_BILL: 'Split a bill',
  RANK_FLOAT: 'Rank float',
};

const SPLIT_LABEL: Record<string, string> = {
  OWNER: 'Taxi owner',
  DRIVER_FLOAT: 'Driver float',
  FUEL_POOL: 'Rank fuel pool',
  INSURANCE_POOL: 'Rank insurance',
};

/** How each account type presents. `kind` drives tint; the note carries meaning. */
const ACCOUNT_PRESENTATION: Record<
  string,
  { label: string; kind: BalanceRow['kind']; note: string }
> = {
  MOMO_SETTLEMENT: {
    label: 'Held at MTN',
    kind: 'POOL',
    note: 'Money that has settled at MoMo and not yet been attributed',
  },
  USER_WALLET: { label: 'Spendable', kind: 'WALLET', note: 'Available to spend now' },
  ESCROW_HOLD: { label: 'Held for a job', kind: 'ESCROW', note: 'Released when work is approved' },
  FAMILY_LOCKED: {
    label: 'Locked for family',
    kind: 'LOCKED',
    note: 'Can only be spent on its category',
  },
  STOKVEL_POOL: { label: 'Stokvel pool', kind: 'POOL', note: 'The group’s money, not yours yet' },
  FUEL_POOL: { label: 'Rank fuel pool', kind: 'POOL', note: 'Set aside from every fare' },
  INSURANCE_POOL: { label: 'Rank insurance', kind: 'POOL', note: 'Set aside from every fare' },
  DRIVER_FLOAT: { label: 'Driver float', kind: 'POOL', note: 'The driver’s share of fares' },
  SUSPENSE: {
    label: 'Awaiting delivery',
    kind: 'ESCROW',
    note: 'Paid for, product not yet issued',
  },
  PLATFORM_FEE: { label: 'Platform fee', kind: 'POOL', note: 'Our revenue' },
  ROUNDING: { label: 'Rounding', kind: 'POOL', note: 'Must stay at zero' },
};

/** Last four digits only — POPIA s105/106, docs/14 §5. */
function mask(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 4 ? '••••' : `•••• ${digits.slice(-4)}`;
}

function txnStatus(status: string): TxnRow['status'] {
  if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'TIMEOUT') return 'FAILED';
  return 'PENDING';
}

/**
 * `read_wallet` — every account with a non-zero balance.
 *
 * `wallet_balance` already reports `display_minor` as a `bigint` (it is cast in
 * `0002_lockdown_and_bigint_balances.sql`, because `sum(bigint)` returns
 * `numeric` in Postgres and that breaks the contract rule 1 promises).
 */
export async function readWallet(): Promise<Artifact> {
  // GROUPED BY TYPE, not one row per account.
  //
  // The natural key of an account includes its subject, so a rank's fuel pool
  // and a job's escrow are separate rows — correct in the ledger, and wrong on a
  // screen. Ungrouped, this rendered "Held at MTN" three times with three
  // different figures, which reads as a bug rather than as three accounts.
  //
  // The aggregate is still a tool-read number (a `sum` over real rows), and the
  // note says how many accounts it spans so the total is never mistaken for a
  // single balance. `sourceAccountId` cites the largest constituent — enough to
  // start tracing from, and the count is disclosed rather than implied.
  const { rows } = await getPool().query(
    `select type::text as type,
            sum(display_minor)::text as total,
            count(*)::text as accounts,
            (array_agg(account_id order by display_minor desc))[1] as largest
       from wallet_balance
      where display_minor <> 0
      group by type
      order by sum(display_minor) desc
      limit 8`,
  );

  const balances: BalanceRow[] = rows.map((r) => {
    const p = ACCOUNT_PRESENTATION[String(r.type)] ?? {
      label: String(r.type),
      kind: 'POOL' as const,
      note: '',
    };
    const accounts = Number(r.accounts);
    return {
      label: p.label,
      kind: p.kind,
      money: {
        amount: BigInt(String(r.total)) as Minor,
        sourceAccountId: String(r.largest),
      },
      note: accounts > 1 ? `${p.note} · across ${accounts} accounts` : p.note,
    };
  });

  return { id: 'live-wallet', type: 'wallet', title: 'Where the money is', balances };
}

/**
 * `read_transactions` — recent activity, newest first.
 *
 * `sinceDays` exists because "how did I spend my money three months ago" is a
 * question this product must be able to answer from the ledger rather than from
 * a model's memory.
 */
export async function readTransactions(sinceDays = 90, limit = 12): Promise<Artifact> {
  const { rows } = await getPool().query(
    `select id, created_at, purpose, status::text as status,
            amount_minor::text as amount_minor, counterparty
       from momo_transaction
      where created_at >= now() - ($1 || ' days')::interval
      order by created_at desc
      limit $2`,
    [String(sinceDays), limit],
  );

  const items: TxnRow[] = rows.map((r) => ({
    id: String(r.id),
    at: new Date(String(r.created_at)).toISOString(),
    label: PURPOSE_LABEL[String(r.purpose)] ?? String(r.purpose),
    counterparty: mask(String(r.counterparty ?? '')),
    direction: 'IN',
    money: { amount: BigInt(String(r.amount_minor)) as Minor, sourceTxnId: String(r.id) },
    status: txnStatus(String(r.status)),
  }));

  return {
    id: 'live-transactions',
    type: 'transactions',
    title: 'Recent activity',
    items,
    caption:
      items.length > 0
        ? `Read from the ledger — the last ${sinceDays} days.`
        : 'Nothing in the ledger for that period yet.',
  };
}

/**
 * `read_fare_split` — the split of a REAL amount.
 *
 * Deliberately not a hardcoded R12.50. It takes the most recent settled
 * transaction and puts its actual amount through the same pure `split()` the
 * money engine uses, so every part carries that transaction's id. Returns
 * `null` when no money has moved: there would be nothing true to show, and an
 * invented example is precisely what rule #14 forbids.
 */
export async function readFareSplit(): Promise<Artifact | null> {
  const { rows } = await getPool().query(
    `select id, amount_minor::text as amount_minor
       from momo_transaction
      where status = 'SUCCESSFUL' and journal_id is not null
      order by created_at desc
      limit 1`,
  );

  const row = rows[0];
  if (!row) return null;

  const fare = BigInt(String(row.amount_minor));
  const txnId = String(row.id);

  const parts: SplitPartRow[] = split(fare as Minor, DEFAULT_FARE_SPLIT).map((p) => ({
    key: p.key,
    label: SPLIT_LABEL[p.key] ?? p.key,
    bps: DEFAULT_FARE_SPLIT.find((c) => c.key === p.key)?.bps ?? 0,
    money: { amount: p.amount as Minor, sourceTxnId: txnId },
  }));

  return {
    id: 'live-split',
    type: 'split-breakdown',
    title: 'How that fare divides',
    fare: { amount: fare as Minor, sourceTxnId: txnId },
    parts,
    route: 'Soweto → Joburg CBD',
  };
}
