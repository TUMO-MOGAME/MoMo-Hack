/** @jsxRuntime automatic */
'use client';

/** The activity artifact: what came in, what went out, and what has not settled. */

import type { Artifact, TxnRow } from '@/lib/artifacts/types';
import type { Minor } from '@/domain/money';
import { moneyLabel } from './summary';
import { CheckIcon, ClockIcon, CrossIcon, EmptyState, Label, Money, Pill, Row } from './shared';

type TransactionsArtifact = Extract<Artifact, { type: 'transactions' }>;

/**
 * Every non-successful state gets a word AND an icon. Amber alone is invisible
 * on a cracked screen in the sun, and `FAILED` used to render nothing at all.
 */
function StatusBadge({ status }: { status: TxnRow['status'] }) {
  if (status === 'PENDING') {
    return (
      <Pill tone="warning" icon={<ClockIcon />}>
        Pending
      </Pill>
    );
  }
  if (status === 'FAILED') {
    return (
      <Pill tone="destructive" icon={<CrossIcon />}>
        Failed
      </Pill>
    );
  }
  return null;
}

export function Transactions({ a }: { a: TransactionsArtifact }) {
  if (a.items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        hint="Once you take a job or pay a fare, every movement shows up here with the account it touched."
      />
    );
  }

  return (
    <div>
      {a.caption ? <p className="mb-4 text-sm text-muted-foreground">{a.caption}</p> : null}
      <ul className="divide-y divide-border">
        {a.items.map((t) => (
          <li key={t.id}>
            <Row>
              <Label sub={`${t.at}${t.counterparty ? ` · ${t.counterparty}` : ''}`}>
                <span className="inline-flex flex-wrap items-center gap-2">
                  {t.label}
                  <StatusBadge status={t.status} />
                </span>
              </Label>
              <Money
                money={t.money}
                sign={t.direction === 'IN' ? '+' : '−'}
                className={`text-base ${t.direction === 'IN' ? 'text-success' : 'text-foreground'}`}
                announce={`${t.direction === 'IN' ? 'received' : 'paid'} ${moneyLabel(
                  t.money.amount as Minor,
                )}${t.status === 'SUCCESSFUL' ? '' : `, ${t.status.toLowerCase()}`}`}
              />
            </Row>
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-success">
          <CheckIcon />
        </span>
        Plus is money in, minus is money out. Every line is a balanced journal in the ledger.
      </p>
    </div>
  );
}
