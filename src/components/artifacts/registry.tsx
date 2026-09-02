/** @jsxRuntime automatic */
'use client';

/**
 * The artifact registry (docs/13 §3 and §8, ADR-0013).
 *
 * A `type` maps to exactly one component. The agent picks from this set; it
 * cannot invent a layout and it cannot emit markup. There is no
 * `dangerouslySetInnerHTML` anywhere below this file, and there never will be.
 *
 * Three states, always:
 *   streaming -> a skeleton shaped like the artifact that is coming
 *   complete  -> the renderer for its type
 *   unknown   -> the error card. Never a blank panel.
 */

import type { Artifact, ArtifactType } from '@/lib/artifacts/types';
import { ArtifactSkeleton } from './skeleton';
import { artifactSummary } from './summary';
import { Confirm } from './confirm';
import { ErrorCard, unknownArtifact } from './error';
import { JobList } from './job-list';
import { SplitBreakdown } from './split-breakdown';
import { Stokvel } from './stokvel';
import { Transactions } from './transactions';
import { TrustScore } from './trust-score';
import { Wallet } from './wallet';

/** The agent streams, so an artifact exists before it is finished. */
export type ArtifactStatus = 'streaming' | 'complete';

export interface RendererProps<K extends ArtifactType> {
  readonly a: Extract<Artifact, { type: K }>;
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}

type Renderer<K extends ArtifactType> = (props: RendererProps<K>) => React.ReactElement;

/** The map docs/13 §8 calls for. Adding a type is one entry plus one file. */
export const ARTIFACT_RENDERERS: { [K in ArtifactType]: Renderer<K> } = {
  wallet: Wallet,
  transactions: Transactions,
  'split-breakdown': SplitBreakdown,
  stokvel: Stokvel,
  'job-list': JobList,
  'trust-score': TrustScore,
  confirm: Confirm,
  error: ErrorCard,
};

export function isKnownArtifactType(type: unknown): type is ArtifactType {
  return typeof type === 'string' && Object.hasOwn(ARTIFACT_RENDERERS, type);
}

export interface ArtifactBodyProps {
  readonly artifact: Artifact;
  readonly status?: ArtifactStatus;
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}

/**
 * The single entry point into the artifact path.
 *
 * The region is labelled with the artifact's spoken summary, because docs/13 §7
 * says the spoken line and the `aria-label` are one string — build the voice
 * layer and the accessibility layer falls out of it.
 */
export function ArtifactBody({ artifact, status = 'complete', onConfirm, onCancel }: ArtifactBodyProps) {
  if (status === 'streaming') return <ArtifactSkeleton type={artifact.type} />;

  if (!isKnownArtifactType(artifact.type)) {
    return <ErrorCard a={unknownArtifact((artifact as { type?: unknown }).type)} />;
  }

  // The one cast in the artifact path. The registry is keyed by the same
  // literal union as the artifact itself, so the pairing is correct by
  // construction; TypeScript just cannot see through the index.
  const Renderer = ARTIFACT_RENDERERS[artifact.type] as unknown as (
    props: { a: Artifact; onConfirm?: () => void; onCancel?: () => void },
  ) => React.ReactElement;

  return (
    <section aria-label={artifactSummary(artifact)} className="animate-rise">
      <Renderer a={artifact} onConfirm={onConfirm} onCancel={onCancel} />
    </section>
  );
}
