/**
 * The A3 claims, held in place.
 *
 * `docs/audits/A3.project.md` asks for specific, checkable things — a modal
 * bottom sheet, a full-height confirmation, one spoken sentence shared between
 * the screen reader and the voice layer, and a `prefers-reduced-motion` rule
 * that actually suppresses the animations rather than merely declaring a media
 * query. Each of those is asserted here so the next refactor cannot quietly
 * undo it.
 *
 * What this file cannot do is drive a keyboard — that is `docs/04` §9 (Q4,
 * Playwright) and the axe pass (Q7).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { ArtifactSheet } from '@/components/artifact-panel';
import { ArtifactChip } from '@/components/chips/artifact-chip';
import { artifactSummary, moneyLabel } from '@/components/artifacts/summary';
import { minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { confirmFixture, stokvelFixture, walletFixture } from './fixtures';

const noop = () => {};

function sheet(artifact: Artifact): string {
  return renderToStaticMarkup(createElement(ArtifactSheet, { artifact, onClose: noop }));
}

function chip(artifact: Artifact): string {
  return renderToStaticMarkup(createElement(ArtifactChip, { artifact, onOpen: noop }));
}

describe('money is announced in words', () => {
  test.each([
    [1250n, '12 rand 50 cents'],
    [34000n, '340 rand'],
    [200000n, '2000 rand'],
    [62n, '62 cents'],
    [305n, '3 rand 5 cents'],
  ])('%s minor units reads as "%s"', (amount, expected) => {
    expect(moneyLabel(minor(amount))).toBe(expected);
  });

  test('never reads a currency symbol out as a letter', () => {
    expect(moneyLabel(minor(1250n))).not.toContain('R');
  });
});

describe('the spoken summary IS the aria-label (docs/13 §7)', () => {
  test('the chip announces the same sentence the phrase bank would speak', () => {
    const summary = artifactSummary(walletFixture);
    expect(summary).toBe('You have 340 rand available.');
    expect(chip(walletFixture)).toContain(summary);
  });

  test('the sheet describes itself with the same sentence', () => {
    const summary = artifactSummary(stokvelFixture);
    expect(summary).toContain('The pool is at 2700 rand');
    expect(summary).toContain('Zanele is next.');
    expect(sheet(stokvelFixture)).toContain(summary);
  });

  test('the confirm summary matches the phrase bank line in docs/13 §7', () => {
    expect(artifactSummary(confirmFixture)).toBe(
      'Confirm: pay 45 rand to Nomsa M. Tap confirm when you are ready.',
    );
  });
});

describe('the mobile sheet is a real modal dialog', () => {
  const html = sheet(walletFixture);

  test('role, aria-modal and a label pointing at the heading', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    // The id it points at must actually exist on the heading.
    expect(html).toContain(`id="${labelledBy}"`);
  });

  test('is focusable, so focus can be moved into it on open', () => {
    expect(html).toContain('tabindex="-1"');
  });

  test('carries a close button with an explicit accessible name', () => {
    expect(html).toContain('aria-label="Close Your money"');
  });

  test('the scrim is presentational and stays out of the tab order', () => {
    // It used to be a full-screen <button>, which put a giant unlabelled
    // control between the user and the dialog content.
    expect(html).not.toContain('<button class="absolute inset-0');
    expect(html).toContain('aria-hidden="true"');
  });

  test('the scrim uses the semantic overlay token, not a raw palette colour', () => {
    expect(html).toContain('bg-overlay');
    expect(html).not.toContain('bg-black/');
  });
});

describe('a confirm artifact opens full height', () => {
  // docs/13 §6 and the A3 overlay: "A partly off-screen payment confirmation
  // is High." At 320px a 40%-height sheet puts Confirm below the fold.
  test('confirm pins to the top of the viewport', () => {
    expect(sheet(confirmFixture)).toContain('top-0');
  });

  test('other artifacts keep the partial sheet, so the chat stays visible', () => {
    const html = sheet(walletFixture);
    expect(html).toContain('max-h-[85dvh]');
    expect(html).not.toContain('top-0');
  });
});

describe('globals.css', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)),
    'utf8',
  );
  const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  test('reduced motion actually switches the sheet animation off', () => {
    expect(reducedMotion).toContain('.animate-sheet');
    expect(reducedMotion).toMatch(/\.animate-sheet[\s\S]*?animation: none !important/);
  });

  test('reduced motion actually switches the thinking dots off, at full opacity', () => {
    // Collapsing the duration alone parks the dots on their last keyframe,
    // which is 30% opacity — technically motionless, practically invisible.
    expect(reducedMotion).toMatch(/\.dot \{[\s\S]*?animation: none !important/);
    expect(reducedMotion).toMatch(/\.dot \{[\s\S]*?opacity: 1 !important/);
  });

  test('reduced motion flattens the skeleton shimmer', () => {
    expect(reducedMotion).toMatch(/\.skeleton \{[\s\S]*?animation: none !important/);
  });

  test('there is a visible focus ring, and it references the ring token', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 3px solid var(--ring)');
  });

  test('the overlay colour exists in both themes', () => {
    expect(css).toContain('--overlay: oklch(0 0 0 / 55%)');
    expect(css).toContain('--overlay: oklch(0 0 0 / 72%)');
    expect(css).toContain('--color-overlay: var(--overlay)');
  });
});

describe('design tokens are the single source of truth (A2)', () => {
  const tokens = readFileSync(
    fileURLToPath(new URL('../../../src/design/tokens.ts', import.meta.url)),
    'utf8',
  );

  test('every colour role in globals.css also exists in tokens.ts', () => {
    // A2: "A colour defined only in globals.css and not in tokens.ts is drift.
    // So is the reverse." `overlay` is the role this workstream added.
    expect(tokens).toContain("overlay: 'oklch(0 0 0 / 55%)'");
    expect(tokens).toContain("overlay: 'oklch(0 0 0 / 72%)'");
  });
});
