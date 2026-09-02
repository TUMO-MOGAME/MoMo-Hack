/** @jsxRuntime automatic */
'use client';

/** The Ubuntu Trust Score artifact: reputation you can borrow against. */

import type { Artifact } from '@/lib/artifacts/types';
import { CheckIcon, ClockIcon, EmptyState } from './shared';

type TrustArtifact = Extract<Artifact, { type: 'trust-score' }>;

export function TrustScore({ a }: { a: TrustArtifact }) {
  const clamped = Math.max(0, Math.min(100, a.score));
  const met = a.factors.filter((f) => f.met).length;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span
          className="font-display text-5xl tabular text-brand"
          aria-label={`Trust score ${a.score} out of 100`}
        >
          <span aria-hidden="true">{a.score}</span>
        </span>
        <span className="pb-2 text-sm text-muted-foreground">
          out of 100, from {a.completed} completed {a.completed === 1 ? 'job' : 'jobs'}
        </span>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={`Trust score ${clamped} out of 100`}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
      </div>

      {a.factors.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No history yet"
            hint="Finish a job with photo proof and your score starts building. Nothing here is a credit check."
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-xs text-muted-foreground">
            {met} of {a.factors.length} unlocked
          </p>
          <ul className="mt-2 space-y-3">
            {a.factors.map((f) => (
              <li key={f.label} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                    f.met ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                  aria-hidden="true"
                >
                  {f.met ? <CheckIcon /> : <ClockIcon />}
                </span>
                <span className={f.met ? 'text-foreground' : 'text-muted-foreground'}>
                  {f.label}
                  {/* Colour and a tick are not enough on their own (A3). */}
                  <span className="sr-only">{f.met ? ' — unlocked' : ' — not yet unlocked'}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
