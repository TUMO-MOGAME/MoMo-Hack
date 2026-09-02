/** @jsxRuntime automatic */
'use client';

/**
 * Loading states.
 *
 * The agent streams (docs/13 §2), so an artifact exists before it is complete.
 * A panel that is blank for 1-3 seconds on Slow 3G reads as broken, and our
 * user's next move is to close the app. Each skeleton mirrors the shape of the
 * artifact it stands in for, so nothing jumps when the real thing lands.
 *
 * The shimmer is a CSS animation, so `prefers-reduced-motion` in globals.css
 * flattens it to a static block rather than removing the placeholder.
 */

import type { ArtifactType } from '@/lib/artifacts/types';

function Bar({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton rounded-sm ${w} ${h}`} />;
}

function Lines({ n }: { n: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Bar w="w-2/5" h="h-3.5" />
            <Bar w="w-1/4" h="h-3" />
          </div>
          <Bar w="w-20" h="h-4" />
        </div>
      ))}
    </div>
  );
}

function BigAmount() {
  return (
    <div className="mb-6 space-y-3">
      <Bar w="w-24" h="h-3" />
      <Bar w="w-48" h="h-11" />
    </div>
  );
}

/**
 * `status`/`aria-busy` rather than a spinner: the screen reader announces
 * "loading" once instead of narrating an animation.
 */
export function ArtifactSkeleton({ type }: { type: ArtifactType | string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="animate-rise">
      <span className="sr-only">Loading this view. The numbers are still coming from the ledger.</span>
      <div aria-hidden="true">
        {type === 'confirm' ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <BigAmount />
              <Lines n={3} />
            </div>
            <Bar h="h-14" />
            <Bar h="h-12" />
          </div>
        ) : type === 'job-list' ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4">
                <div className="space-y-2">
                  <Bar w="w-1/2" h="h-4" />
                  <Bar w="w-1/3" h="h-3" />
                </div>
              </div>
            ))}
          </div>
        ) : type === 'error' ? (
          <Bar h="h-16" />
        ) : (
          <>
            <BigAmount />
            <Lines n={4} />
          </>
        )}
      </div>
    </div>
  );
}

/** The in-chat chip while the turn is still streaming. */
export function ChipSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3"
    >
      <span className="sr-only">Preparing a view.</span>
      <div className="skeleton size-9 shrink-0 rounded-md" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2" aria-hidden="true">
        <Bar w="w-16" h="h-2.5" />
        <Bar w="w-2/3" h="h-3.5" />
      </div>
    </div>
  );
}
