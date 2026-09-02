/** @jsxRuntime automatic */
'use client';

/**
 * The context rail as a modal drawer, for every viewport below `xl`.
 *
 * Same modal contract as the artifact sheet, and for the same reason — this is
 * a thing that covers the conversation, so it gets `role="dialog"`,
 * `aria-modal`, a focus trap, Escape, and focus restored to the strip that
 * opened it (`use-modal.ts`, A3 overlay).
 */

import { useId } from 'react';
import type { Artifact } from '@/lib/artifacts/types';
import type { KasiContext } from '@/lib/agent/mock';
import { ContextPanel } from '@/components/context/context-panel';
import { CloseIcon } from '@/components/icons';
import { useModal } from '@/components/use-modal';

export function ContextDrawer({
  context,
  onOpen,
  onClose,
}: {
  context: KasiContext;
  onOpen: (artifact: Artifact) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useModal<HTMLDivElement>(true, onClose);

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-popover animate-drawer"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            At a glance
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the summary"
            className="grid size-11 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <ContextPanel context={context} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}
