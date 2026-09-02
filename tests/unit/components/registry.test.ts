/**
 * The registry (docs/13 §3, §8).
 *
 * Three states and only three: a skeleton while the turn streams, the right
 * component when it completes, and the error card when the type is not one we
 * know. "Validation failure renders a visible error card, never a blank panel
 * or a silent fallback" (ADR-0013) is a claim, and this is the test of it.
 */

import { describe, expect, test } from 'vitest';
import { ARTIFACT_RENDERERS, isKnownArtifactType } from '@/components/artifacts/registry';
import { ARTIFACT_KICKER, type ArtifactType } from '@/lib/artifacts/types';
import { renderArtifact, visibleText } from './render';
import { unknownTypeFixture, walletFixture } from './fixtures';

describe('coverage', () => {
  test('every artifact type in the contract has exactly one renderer', () => {
    const contractTypes = Object.keys(ARTIFACT_KICKER) as ArtifactType[];
    const registryTypes = Object.keys(ARTIFACT_RENDERERS).sort();
    expect(registryTypes).toEqual([...contractTypes].sort());
  });

  test('isKnownArtifactType is honest in both directions', () => {
    expect(isKnownArtifactType('wallet')).toBe(true);
    expect(isKnownArtifactType('holographic-projection')).toBe(false);
    expect(isKnownArtifactType(undefined)).toBe(false);
    // Not fooled by the prototype chain.
    expect(isKnownArtifactType('toString')).toBe(false);
  });
});

describe('unknown types', () => {
  const html = renderArtifact(unknownTypeFixture);

  test('render the error card rather than a blank panel', () => {
    expect(html).not.toBe('');
    expect(html).toContain('data-artifact-error="true"');
    expect(html).toContain('role="alert"');
  });

  test('name the type, so the bug is diagnosable from a screenshot', () => {
    expect(visibleText(html)).toContain('holographic-projection');
  });

  test('reassure the user that their money is fine', () => {
    expect(visibleText(html)).toContain('not a problem with your money');
  });
});

describe('streaming', () => {
  const html = renderArtifact(walletFixture, 'streaming');

  test('shows a skeleton, not the finished artifact', () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('skeleton');
    expect(html).not.toContain('R340.00');
  });

  test('announces "loading" once instead of narrating an animation', () => {
    expect(html).toContain('role="status"');
    expect(visibleText(html)).toContain('Loading this view');
  });

  test('an unknown type still gets a skeleton while it streams', () => {
    const unknown = renderArtifact(unknownTypeFixture, 'streaming');
    expect(unknown).toContain('aria-busy="true"');
  });
});
