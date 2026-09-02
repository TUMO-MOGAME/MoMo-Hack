/**
 * The provenance guard (CLAUDE.md #14, ADR-0013, docs/13 §3 rule 2).
 *
 * "Never put a number in an artifact that did not come from a tool call."
 * The renderer is the last line of that rule, and this file is what stops a
 * future refactor from quietly deleting it. If these tests go green while the
 * guard is gone, the model has been handed the ability to invent a balance.
 */

import { describe, expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { minor } from '@/domain/money';
import { Money } from '@/components/artifacts/shared';
import { renderArtifact, visibleText } from './render';
import { unsourcedConfirmFixture, unsourcedWalletFixture, walletFixture } from './fixtures';

function money(props: Parameters<typeof Money>[0]): string {
  return renderToStaticMarkup(createElement(Money, props));
}

describe('Money', () => {
  test('a sourced amount renders normally and is announced in words', () => {
    const html = money({ money: { amount: minor(1250n), sourceTxnId: 'txn_1' } });
    expect(html).toContain('R12.50');
    expect(html).toContain('aria-label="12 rand 50 cents"');
    expect(html).not.toContain('data-unsourced');
  });

  test('sourceAccountId is provenance too', () => {
    const html = money({ money: { amount: minor(34000n), sourceAccountId: 'acc_1' } });
    expect(html).not.toContain('data-unsourced');
    expect(html).toContain('aria-label="340 rand"');
  });

  test('an amount with NEITHER source renders the warning, not a clean number', () => {
    const html = money({ money: { amount: minor(4500n) } });

    // It is marked as broken, in three independent ways: an icon, a
    // strike-through, and the word "unverified". Colour is never alone (A3).
    expect(html).toContain('data-unsourced="true"');
    expect(html).toContain('line-through');
    expect(visibleText(html)).toContain('unverified');

    // And a screen reader is told what it means, rather than being read a
    // number that nobody in the system can vouch for.
    expect(html).toContain('Amount not verified against the ledger');

    // Critically: it is NOT presented as a balance. No accessible amount.
    expect(html).not.toContain('aria-label="45 rand"');
  });

  test('sub-rand amounts are announced as cents, not "zero rand"', () => {
    const html = money({ money: { amount: minor(62n), sourceTxnId: 'txn_x' } });
    expect(html).toContain('aria-label="62 cents"');
  });
});

describe('artifacts carrying unsourced money', () => {
  test('a wallet row without provenance shows the warning in place of the balance', () => {
    const html = renderArtifact(unsourcedWalletFixture);

    // The sourced row is untouched.
    expect(html).toContain('R340.00');
    expect(html).toContain('aria-label="340 rand available"');

    // The unsourced row is flagged, and never announced as an amount.
    expect(html).toContain('data-unsourced="true"');
    expect(visibleText(html)).toContain('unverified');
    expect(html).not.toContain('aria-label="60 rand held"');
  });

  test('an unsourced payment proposal cannot be confirmed', () => {
    const html = renderArtifact(unsourcedConfirmFixture);

    expect(html).toContain('data-unsourced="true"');
    // The one control in this app that moves money is disabled when the amount
    // it would move has no provenance. There is no path from an invented
    // number to a payment.
    expect(html).toContain('disabled=""');
  });

  test('a clean fixture never trips the guard', () => {
    expect(renderArtifact(walletFixture)).not.toContain('data-unsourced');
  });
});
