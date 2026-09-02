/** @jsxRuntime automatic */
'use client';

/** The fare-split artifact: where a R12.50 fare actually went, cent for cent. */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { moneyLabel } from './summary';
import {
  CheckIcon,
  EmptyState,
  Kicker,
  Label,
  Money,
  Row,
  WarningIcon,
  isSourced,
  UnsourcedMoney,
} from './shared';

type SplitArtifact = Extract<Artifact, { type: 'split-breakdown' }>;

const CHART = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'] as const;

function chartClass(i: number): string {
  return CHART[i % CHART.length] ?? 'bg-chart-1';
}

export function SplitBreakdown({ a }: { a: SplitArtifact }) {
  if (a.parts.length === 0) {
    return (
      <EmptyState
        title="No split recorded"
        hint="A fare splits at the moment of collection. If nothing is here, the collection has not settled yet."
      />
    );
  }

  const total = a.parts.reduce<bigint>((s, p) => s + p.money.amount, 0n);
  const balances = total === a.fare.amount;

  return (
    <div>
      <Kicker>{a.route}</Kicker>
      {isSourced(a.fare) ? (
        <div
          className="font-display text-4xl tabular text-brand"
          aria-label={`Fare ${moneyLabel(a.fare.amount as Minor)}`}
        >
          <span aria-hidden="true">{formatZAR(a.fare.amount as Minor)}</span>
        </div>
      ) : (
        <div className="mt-1 text-2xl">
          <UnsourcedMoney money={a.fare} />
        </div>
      )}

      {/* Decorative: every segment is restated as a labelled row below. */}
      <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {a.parts.map((p, i) => (
          <div key={p.key} className={chartClass(i)} style={{ width: `${p.bps / 100}%` }} />
        ))}
      </div>

      <ul className="mt-4 divide-y divide-border">
        {a.parts.map((p, i) => (
          <li key={p.key}>
            <Row>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`size-2 shrink-0 rounded-full ${chartClass(i)}`}
                  aria-hidden="true"
                />
                <Label sub={`${(p.bps / 100).toFixed(0)}% of the fare`}>{p.label}</Label>
              </div>
              <Money
                money={p.money}
                className="text-base"
                announce={`${p.label}, ${moneyLabel(p.money.amount as Minor)}`}
              />
            </Row>
          </li>
        ))}
      </ul>

      <p
        className={`mt-5 flex items-start gap-2 rounded-md px-3 py-2.5 text-xs leading-relaxed ${
          balances
            ? 'bg-success text-success-foreground'
            : 'bg-destructive text-destructive-foreground'
        }`}
        role={balances ? undefined : 'alert'}
      >
        <span className="mt-0.5 shrink-0">{balances ? <CheckIcon /> : <WarningIcon />}</span>
        <span>
          {balances
            ? 'Parts sum to the fare exactly. The remainder cent is distributed deterministically — property-tested with 5 000 generated cases.'
            : 'The parts do not sum to the fare. This is a bug, and the number above is the one to trust.'}
        </span>
      </p>
    </div>
  );
}
