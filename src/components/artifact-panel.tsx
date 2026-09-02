/** @jsxRuntime automatic */
'use client';

/**
 * The artifact surface: a side panel on desktop, a modal bottom sheet on a
 * phone (docs/13 §6).
 *
 * Phone-first is not a slogan here. Our user is on a 320px low-end Android at a
 * taxi rank (docs/audits/A3.project.md), so the sheet is the real case and the
 * desktop panel is the accommodation.
 */

import { useId } from 'react';
import { ARTIFACT_KICKER, type Artifact } from '@/lib/artifacts/types';
import { ArtifactBody, type ArtifactStatus } from '@/components/artifacts/registry';
import { artifactSummary } from '@/components/artifacts/summary';
import { CloseIcon } from '@/components/icons';
import { useModal } from '@/components/use-modal';

interface SurfaceProps {
  readonly artifact: Artifact;
  readonly status?: ArtifactStatus;
  readonly onClose: () => void;
}

function ArtifactHeader({ artifact, onClose, titleId }: SurfaceProps & { titleId: string }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {ARTIFACT_KICKER[artifact.type]}
        </div>
        <h2 id={titleId} className="text-lg text-foreground">
          {artifact.title}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${artifact.title}`}
        className="grid size-11 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

/** Desktop / tablet: the panel beside the conversation. */
export function ArtifactPanel({ artifact, status, onClose }: SurfaceProps) {
  const titleId = useId();
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <ArtifactHeader artifact={artifact} onClose={onClose} titleId={titleId} />
      <ArtifactBody artifact={artifact} status={status} onConfirm={onClose} onCancel={onClose} />
    </div>
  );
}

/**
 * Mobile: a real modal dialog.
 *
 * `confirm` opens FULL height. docs/13 §6 and the A3 overlay both say a payment
 * confirmation that is partly off-screen is a High finding — at 320px a 40%
 * sheet puts the Confirm button below the fold, which is the worst possible
 * place for it.
 */
export function ArtifactSheet({ artifact, status, onClose }: SurfaceProps) {
  const titleId = useId();
  const ref = useModal<HTMLDivElement>(true, onClose);
  const fullHeight = artifact.type === 'confirm';

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Presentational scrim. The dialog owns dismissal via Escape and the
          close button, so this is not in the tab order. */}
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-summary`}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 flex flex-col border-t border-border bg-popover animate-sheet ${
          fullHeight ? 'top-0' : 'max-h-[85dvh] rounded-t-xl'
        }`}
      >
        <div className="shrink-0 pb-1 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        </div>
        <p id={`${titleId}-summary`} className="sr-only">
          {artifactSummary(artifact)}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
          <ArtifactHeader artifact={artifact} onClose={onClose} titleId={titleId} />
          <ArtifactBody
            artifact={artifact}
            status={status}
            onConfirm={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

/** What the desktop panel shows before the first artifact arrives. */
export function EmptyPanel() {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <div className="font-display text-3xl text-muted-foreground">MoMo Kasi</div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ask a question and the answer opens here — your wallet, a fare split, the stokvel, work
          near you. Everything stays in the conversation, so you can scroll back and reopen it.
        </p>
      </div>
    </div>
  );
}
