/** @jsxRuntime automatic */
'use client';

/**
 * The live ledger — the real database, rendered through the real renderers.
 *
 * ⚠️ THE POINT OF THIS FILE. Everywhere else the artifact components are driven
 * by `mockAgent`, which is honest starter scope but means every number on the
 * product's screens is invented. This one is driven by `readLedgerSnapshot()`,
 * so what a visitor sees is what Postgres holds. Nothing here is illustrative.
 *
 * ── THE BIGINT BOUNDARY ──────────────────────────────────────────────────────
 *
 * Amounts arrive as decimal STRINGS because `bigint` cannot cross a Server →
 * Client component boundary (see the note in `src/server/ledger/read.ts`).
 * `BigInt()` on the way in, once, here — and after that it is money again and
 * behaves like money. No arithmetic happens on the string form, ever.
 *
 * ── PROVENANCE IS NOT DECORATION (CLAUDE.md #14) ─────────────────────────────
 *
 * Every amount below carries the `momo_transaction.id` it was read from. That
 * is not paperwork: the renderers strike through and mark "unverified" any
 * amount without a source, so if this file ever starts inventing numbers the
 * page says so on its own. The guard is load-bearing and it is pointed at us.
 *
 * The split is the sharpest case. It is NOT a decorative R12.50 — it is the
 * real amount of the most recent settled transaction, put through the real
 * split engine, carrying that transaction's id. If no money has moved, no split
 * is shown, because there would be nothing true to show.
 */

import { formatZAR, type Minor } from '@/domain/money';
import { DEFAULT_FARE_SPLIT, split } from '@/domain/split';
import type { Artifact, SplitPartRow, TxnRow } from '@/lib/artifacts/types';
import { ArtifactBody } from '@/components/artifacts/registry';
import { Kicker } from '@/components/artifacts/shared';
import type { LedgerPosting, LedgerSnapshot, LedgerTxn } from '@/lib/ledger/snapshot';

const PURPOSE_LABEL: Record<string, string> = {
  FARE: 'Taxi fare',
  AIRTIME: 'Airtime',
  ELECTRICITY: 'Prepaid electricity',
  SCHOOL_FEES: 'School fees',
  STOKVEL_CONTRIB: 'Stokvel contribution',
  ESCROW_FUND: 'Job funding',
  SPLIT_BILL: 'Split a bill',
};

const SPLIT_LABEL: Record<string, string> = {
  OWNER: 'Taxi owner',
  DRIVER_FLOAT: 'Driver float',
  FUEL_POOL: 'Rank fuel pool',
  INSURANCE_POOL: 'Rank insurance',
};

/** MoMo statuses are a wider set than the artifact's three. Map, do not cast. */
function txnStatus(status: string): TxnRow['status'] {
  if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'TIMEOUT') return 'FAILED';
  return 'PENDING';
}

function toTxnRow(t: LedgerTxn): TxnRow {
  return {
    id: t.id,
    at: t.at,
    label: PURPOSE_LABEL[t.purpose] ?? t.purpose,
    counterparty: t.counterpartyMasked,
    // Every purpose we can currently initiate is a COLLECTION: money in.
    direction: 'IN',
    money: { amount: BigInt(t.amountMinor) as Minor, sourceTxnId: t.id },
    status: txnStatus(t.status),
  };
}

export function LedgerLive({ snapshot }: { snapshot: LedgerSnapshot }) {
  const settled = snapshot.txns.find((t) => t.status === 'SUCCESSFUL' && t.journalId);

  const transactions: Artifact = {
    id: 'live-transactions',
    type: 'transactions',
    title: 'Recent activity',
    items: snapshot.txns.map(toTxnRow),
    caption: 'Read from the ledger, not illustrative.',
  };

  return (
    <div className="flex flex-col gap-8">
      <Invariant snapshot={snapshot} />

      <Card title="Recent activity" note={`${snapshot.txns.length} most recent, newest first`}>
        <ArtifactBody artifact={transactions} />
      </Card>

      {snapshot.postings.length > 0 ? (
        <Card
          title="The journal behind the latest payment"
          note="Every value movement is at least two postings that sum to zero."
        >
          <Journal postings={snapshot.postings} />
        </Card>
      ) : null}

      {settled ? <SplitCard txn={settled} /> : null}
    </div>
  );
}

/**
 * The headline number, and the only one that matters: every posting ever
 * written, summed. It is not checked by application code — a DEFERRABLE trigger
 * in Postgres refuses the COMMIT — so this is a readout, not an assertion.
 */
function Invariant({ snapshot }: { snapshot: LedgerSnapshot }) {
  const balanced = snapshot.globalSum === '0';
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Kicker>The invariant</Kicker>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`font-display text-5xl tabular ${balanced ? 'text-success' : 'text-destructive'}`}
        >
          {snapshot.globalSum}
        </span>
        <span className="text-sm text-muted-foreground">
          {snapshot.postingCount} postings across {snapshot.accountCount} accounts, summed
        </span>
      </p>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        {balanced
          ? 'Double-entry: every value movement is at least two postings summing to zero. This is enforced by a deferred constraint trigger inside Postgres, checked at COMMIT — an unbalanced journal cannot be written, by a bug or by a race.'
          : 'This should be zero. A non-zero total means the ledger has been written by something that bypassed the journal writer.'}
      </p>
    </div>
  );
}

function Journal({ postings }: { postings: readonly LedgerPosting[] }) {
  const total = postings.reduce((t, p) => t + BigInt(p.amountMinor), 0n);
  return (
    <div>
      <div className="divide-y divide-divider">
        {postings.map((p) => {
          const amount = BigInt(p.amountMinor);
          const debit = amount > 0n;
          return (
            <div key={p.accountId} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-sm">
                <span className="font-medium">{p.accountType}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {debit ? 'debit' : 'credit'}
                </span>
              </span>
              <span
                className={`tabular text-base ${debit ? 'text-brand' : 'text-muted-foreground'}`}
              >
                {debit ? '+' : ''}
                {formatZAR(amount as Minor)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-divider pt-3">
        <span className="text-sm font-medium">Sum</span>
        <span className={`tabular text-base ${total === 0n ? 'text-success' : 'text-destructive'}`}>
          {formatZAR(total as Minor)}
        </span>
      </div>
    </div>
  );
}

/**
 * The fare split, of a REAL amount.
 *
 * Not a hardcoded R12.50. This takes the most recent settled transaction and
 * puts its actual amount through `split()` — the same pure function the money
 * engine uses, property-tested across thousands of generated cases — so the
 * parts carry that transaction's id and the total is exact by construction.
 */
function SplitCard({ txn }: { txn: LedgerTxn }) {
  const fare = BigInt(txn.amountMinor);
  const parts: SplitPartRow[] = split(fare as Minor, DEFAULT_FARE_SPLIT).map((p) => {
    const component = DEFAULT_FARE_SPLIT.find((c) => c.key === p.key);
    return {
      key: p.key,
      label: SPLIT_LABEL[p.key] ?? p.key,
      bps: component?.bps ?? 0,
      money: { amount: p.amount as Minor, sourceTxnId: txn.id },
    };
  });

  const artifact: Artifact = {
    id: 'live-split',
    type: 'split-breakdown',
    title: 'If that had been a taxi fare',
    fare: { amount: fare as Minor, sourceTxnId: txn.id },
    parts,
    route: 'Soweto → Joburg CBD',
  };

  return (
    <Card
      title="If that had been a taxi fare"
      note="The real amount above, through the real split engine — 60 / 25 / 10 / 5."
    >
      <ArtifactBody artifact={artifact} />
    </Card>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-lg">{title}</h2>
      <p className="mt-1 mb-5 max-w-prose text-sm text-muted-foreground">{note}</p>
      {children}
    </section>
  );
}
