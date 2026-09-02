/** @jsxRuntime automatic */
'use client';

/** The jobs artifact: paid work within walking distance. */

import type { Artifact, JobRow } from '@/lib/artifacts/types';
import type { Minor } from '@/domain/money';
import { moneyLabel } from './summary';
import { EmptyState, Money, Pill, type PillTone } from './shared';

type JobListArtifact = Extract<Artifact, { type: 'job-list' }>;

const STATE_LABEL: Record<JobRow['state'], string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  FUNDED: 'Funded — escrowed',
  PROOF_SUBMITTED: 'Proof sent',
  RELEASED: 'Paid out',
};

const STATE_TONE: Record<JobRow['state'], PillTone> = {
  OPEN: 'brand',
  ACCEPTED: 'muted',
  FUNDED: 'warning',
  PROOF_SUBMITTED: 'warning',
  RELEASED: 'success',
};

export function JobList({ a }: { a: JobListArtifact }) {
  if (a.jobs.length === 0) {
    return (
      <EmptyState
        title="No jobs open right now"
        hint="New work is posted at the rank through the day. Ask again later, or turn on a nudge and we will message you."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {a.jobs.map((j) => (
        <li
          key={j.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="min-w-40 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{j.title}</div>
            <div className="truncate text-xs text-muted-foreground">{j.where}</div>
            <div className="mt-1.5">
              <Pill tone={STATE_TONE[j.state]}>{STATE_LABEL[j.state]}</Pill>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Money
              money={j.money}
              className="text-base text-success"
              announce={`pays ${moneyLabel(j.money.amount as Minor)}`}
            />
            <button
              type="button"
              disabled={j.state !== 'OPEN'}
              className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Accept
              <span className="sr-only"> {j.title}</span>
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
