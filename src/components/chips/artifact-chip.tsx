/** @jsxRuntime automatic */
'use client';

/**
 * The compact in-chat card (docs/13 §4).
 *
 * The chip stays in the conversation for good. Scroll back three days, tap it,
 * and the artifact reopens from stored data — no re-prompting and no second LLM
 * call. That is the single best idea in the Social-Assembly reference and we
 * keep it exactly.
 */

import { ARTIFACT_KICKER, type Artifact } from '@/lib/artifacts/types';
import { artifactSummary } from '@/components/artifacts/summary';
import { ChevronIcon, DocIcon } from '@/components/icons';

export function ArtifactChip({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  const confirm = artifact.type === 'confirm';
  return (
    <button
      type="button"
      onClick={onOpen}
      // The spoken summary IS the accessible name (docs/13 §7). A screen-reader
      // user hears the same sentence the phrase bank speaks.
      aria-label={`Open ${ARTIFACT_KICKER[artifact.type]}: ${artifact.title}. ${artifactSummary(artifact)}`}
      className="group flex min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-brand"
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-md ${
          confirm ? 'bg-brand text-brand-foreground' : 'bg-secondary text-brand'
        }`}
        aria-hidden="true"
      >
        <DocIcon size={16} />
      </span>
      <span className="min-w-0 flex-1" aria-hidden="true">
        <span className="block text-xs uppercase tracking-widest text-muted-foreground">
          {ARTIFACT_KICKER[artifact.type]}
        </span>
        <span className="block truncate text-sm text-foreground">{artifact.title}</span>
      </span>
      <span
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        <ChevronIcon size={16} />
      </span>
    </button>
  );
}
