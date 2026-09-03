import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_THEME, THEME_BOOTSTRAP, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * The no-flash theme bootstrap must reach the browser as executable script
 * text, and it must do so WITHOUT `dangerouslySetInnerHTML` — which the CI
 * money guard bans across all of `src`, not merely the artifact path.
 *
 * The failure this exists to catch is silent. If React ever stops rendering a
 * text child on `<script>`, the element still renders, the page still builds,
 * every other test still passes, and the only symptom is a white flash on the
 * way into a dark app on someone's phone. Nothing throws. That is
 * `MISTAKES.md` M8's shape exactly — a response that looks fine while the
 * effect never happened — so the effect is what gets asserted here.
 */

const layoutSource = readFileSync(
  fileURLToPath(new URL('../../../src/app/layout.tsx', import.meta.url)),
  'utf8',
);

describe('the theme bootstrap survives rendering', () => {
  it('renders the script body verbatim, with no dangerouslySetInnerHTML', () => {
    const html = renderToStaticMarkup(createElement('script', null, THEME_BOOTSTRAP));

    // The whole point: the browser must receive runnable code, not <script></script>.
    expect(html).toBe(`<script>${THEME_BOOTSTRAP}</script>`);
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(html).not.toBe('<script></script>');
  });

  it('carries no characters that would need escaping inside a script element', () => {
    // React does not escape a <script> text child, and it is right not to —
    // escaping would break the code. That makes the constant itself the safety
    // boundary: `</script>` inside it would end the element early and inject
    // markup. It is a frozen literal today; this fails the moment it stops being one.
    expect(THEME_BOOTSTRAP).not.toContain('</script');
    expect(THEME_BOOTSTRAP).not.toContain('<!--');
    expect(THEME_BOOTSTRAP).not.toContain('${');
  });

  it('is what the root layout actually puts in <head>', () => {
    // Rendering the constant correctly is worth nothing if the layout stopped
    // using it, so pin the call site too.
    expect(layoutSource).toContain('<script>{THEME_BOOTSTRAP}</script>');
    expect(layoutSource).not.toMatch(/dangerouslySetInnerHTML\s*[={:]/);
  });

  it('defaults to dark, in the constant and not only in the docstring', () => {
    expect(DEFAULT_THEME).toBe('dark');
    // The catch branch — private windows, blocked site data — must land on the
    // same theme an unconfigured visitor gets, or a storage failure becomes a
    // visible flash of the other theme.
    expect(THEME_BOOTSTRAP).toContain("catch(e){document.documentElement.classList.add('dark')");
  });
});
