/** @jsxRuntime automatic */
'use client';

/**
 * The error artifact.
 *
 * ADR-0013: "validation failure renders a visible error card, never a blank
 * panel or a silent fallback." This is also what an unknown artifact type
 * falls back to, so a malformed turn is a bug we can see rather than an empty
 * rectangle the user is left staring at.
 */

import type { Artifact } from '@/lib/artifacts/types';
import { WarningIcon } from './shared';

type ErrorArtifact = Extract<Artifact, { type: 'error' }>;

export function ErrorCard({ a }: { a: ErrorArtifact }) {
  return (
    <div
      role="alert"
      data-artifact-error="true"
      className="rounded-lg border border-destructive bg-card p-4"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-destructive">
          <WarningIcon />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">That did not come out right</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{a.message}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Nothing was charged and nothing moved. Ask again, or say it a different way.
          </p>
        </div>
      </div>
    </div>
  );
}

/** An artifact whose `type` is not in the registry. Never render nothing. */
export function unknownArtifact(type: unknown): ErrorArtifact {
  return {
    id: 'artifact-unknown',
    title: 'Unsupported view',
    type: 'error',
    message: `This app does not know how to show a "${String(type)}" view. That is a bug on our side, not a problem with your money.`,
  };
}
