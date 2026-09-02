/**
 * The context rail.
 *
 * Two things are being defended here. The first is the design constraint: the
 * chat is the spine of this app, so the rail must not become a second way to
 * navigate it. The second is the money rule — a number in the rail is exactly
 * as dangerous as a number in an artifact, so it obeys the same provenance
 * guard (CLAUDE.md #14, ADR-0013).
 */

import { describe, expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContextPanel } from '@/components/context/context-panel';
import { ContextDrawer } from '@/components/context/context-drawer';
import { ContextStrip } from '@/components/context/context-strip';
import { contextSnapshot, type KasiContext } from '@/lib/agent/mock';
import { minor } from '@/domain/money';
import { visibleText } from './render';

const noop = () => {};
const context = contextSnapshot();

const panel = (c: KasiContext = context) =>
  renderToStaticMarkup(createElement(ContextPanel, { context: c, onOpen: noop }));

describe('what the rail shows', () => {
  const html = panel();

  test('the position: available, held, and purpose-locked', () => {
    expect(html).toContain('R340.00');
    expect(html).toContain('R60.00');
    expect(html).toContain('R2 000.00');
    expect(visibleText(html)).toContain('available to spend');
  });

  test('the next obligation, with days remaining as a word', () => {
    const text = visibleText(html);
    expect(text).toContain('Masakhane stokvel');
    expect(text).toContain('R300.00');
    expect(text).toContain('3 days');
  });

  test('the last four movements, with direction as a sign', () => {
    const text = visibleText(html);
    expect(text).toContain('Kombi wash');
    expect(text).toContain('+ R60.00');
    expect(text).toContain('− R12.50');
    expect(context.recent).toHaveLength(4);
  });

  test('an unsettled row says so in words, not only in colour', () => {
    expect(visibleText(html)).toContain('not settled yet');
  });

  test('the connection state is stated, and names the sandbox', () => {
    // Server-rendered, so this is the optimistic branch. The offline branch is
    // reached from a `navigator.onLine` listener after mount.
    expect(visibleText(html)).toContain('Sandbox · connected');
    expect(html).toContain('role="status"');
  });
});

describe('the rail is not a second navigation system', () => {
  const html = panel();

  test('contains no links at all — every row opens an artifact', () => {
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });

  test('every row is a button with an explicit accessible name', () => {
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) expect(b).toContain('aria-label="');
  });

  test('rows announce what opening them will do', () => {
    expect(html).toContain('Open your money.');
    expect(html).toContain('Open the stokvel.');
    expect(html).toContain('Open your activity.');
  });

  test('amounts are announced in words, like everywhere else', () => {
    expect(html).toContain('340 rand available to spend');
    expect(html).toContain('received 60 rand');
  });
});

describe('the rail obeys the provenance rule', () => {
  test('the mock snapshot carries provenance on every amount', () => {
    expect(panel()).not.toContain('data-unsourced');

    // `next` is optional now — the rail omits the block when the ledger holds
    // no real obligation, rather than inventing a due date beside real money.
    const everything = [
      ...context.balances.map((b) => b.money),
      ...(context.next ? [context.next.money] : []),
      ...context.recent.map((r) => r.money),
    ];
    for (const m of everything) {
      expect(Boolean(m.sourceTxnId ?? m.sourceAccountId)).toBe(true);
    }
  });

  test('an amount without a source is flagged in the rail too', () => {
    const [first, ...rest] = context.balances;
    if (!first) throw new Error('fixture has no balances');
    const broken: KasiContext = {
      ...context,
      balances: [{ ...first, money: { amount: minor(34000n) } }, ...rest],
    };
    const html = panel(broken);
    expect(html).toContain('data-unsourced="true"');
    expect(visibleText(html)).toContain('unverified');
  });
});

describe('the phone form', () => {
  test('the strip carries the two numbers and opens the rest', () => {
    const html = renderToStaticMarkup(createElement(ContextStrip, { context, onOpen: noop }));
    expect(html).toContain('R340.00');
    expect(html).toContain('340 rand available');
    expect(html).toContain('Masakhane stokvel due in 3 days');
    expect(html).toContain('Open for the full picture');
  });

  test('the strip says so when the phone has no signal', () => {
    const html = renderToStaticMarkup(
      createElement(ContextStrip, { context, offline: true, onOpen: noop }),
    );
    expect(visibleText(html)).toContain('offline · captured here');
  });

  test('the drawer is a modal dialog, like the artifact sheet', () => {
    const html = renderToStaticMarkup(
      createElement(ContextDrawer, { context, onOpen: noop, onClose: noop }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('bg-overlay');
    expect(html).toContain('aria-label="Close the summary"');

    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });
});
