/** @jsxRuntime automatic */
'use client';

/** The stokvel artifact: the pool, the target, and who owes. */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { moneyLabel } from './summary';
import {
  CheckIcon,
  ClockIcon,
  EmptyState,
  Footnote,
  Kicker,
  Pill,
  UnsourcedMoney,
  isSourced,
} from './shared';

type StokvelArtifact = Extract<Artifact, { type: 'stokvel' }>;

export function Stokvel({ a }: { a: StokvelArtifact }) {
  const target = a.target.amount;
  // Integer percentage for the bar width only. The money itself is untouched.
  const pct = target > 0n ? Number((a.pool.amount * 100n) / target) : 0;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div>
      <Kicker>{a.cadence}</Kicker>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {isSourced(a.pool) ? (
          <span
            className="font-display text-4xl tabular text-brand"
            aria-label={`Pool ${moneyLabel(a.pool.amount as Minor)}`}
          >
            <span aria-hidden="true">{formatZAR(a.pool.amount as Minor)}</span>
          </span>
        ) : (
          <UnsourcedMoney money={a.pool} />
        )}
        <span
          className="text-sm text-muted-foreground"
          aria-label={`of ${moneyLabel(target as Minor)}`}
        >
          <span aria-hidden="true">of {formatZAR(target as Minor)}</span>
        </span>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={`${clamped}% of the target collected`}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{clamped}% of the target collected</p>

      {a.members.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No members yet"
            hint="Invite the group by phone number. Every member sees the same pool balance, live."
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {a.members.map((m) => (
            <li
              key={m.name}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={m.paid ? 'text-success' : 'text-muted-foreground'}
                  aria-hidden="true"
                >
                  {m.paid ? <CheckIcon /> : <ClockIcon />}
                </span>
                <span
                  className={`truncate ${m.paid ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {m.name}
                </span>
              </span>
              {m.next ? (
                <Pill tone="brand">Collects this round</Pill>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {m.paid ? 'Paid' : 'Still due'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Footnote>
        800 000 stokvels. 11 million members. R50bn a year, in cash and paper books. Nobody defaults
        — their aunt is in the group.
      </Footnote>
    </div>
  );
}
