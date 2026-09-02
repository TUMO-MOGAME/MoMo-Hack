/**
 * Rendering helper for the component tests.
 *
 * `vitest.config.ts` runs in the `node` environment and matches `*.test.ts`
 * only, both of which are frozen for this workstream. So these tests render
 * through `react-dom/server` — which React already ships — rather than adding a
 * DOM library and a testing-library dependency to `package.json`.
 *
 * That is a real trade, and worth naming: this proves what the markup CONTAINS
 * (the numbers, the labels, the warnings, the roles). It cannot prove what
 * happens on a click or a Tab. Interaction lives in the Playwright suite
 * (`docs/04` §9, Q4), which is where it belongs anyway.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactBody, type ArtifactStatus } from '@/components/artifacts/registry';
import type { Artifact } from '@/lib/artifacts/types';

export function renderArtifact(artifact: Artifact, status: ArtifactStatus = 'complete'): string {
  return renderToStaticMarkup(createElement(ArtifactBody, { artifact, status }));
}

/** The text a user actually sees, with tags and attributes stripped. */
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
