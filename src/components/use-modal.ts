'use client';

/**
 * Modal behaviour, in one place.
 *
 * A3 asks for four specific things from the mobile bottom sheet, and each one
 * is here rather than sprinkled through the page:
 *   1. focus moves INTO the dialog when it opens;
 *   2. Tab and Shift+Tab cycle inside it and cannot escape;
 *   3. Escape dismisses it — the sheet must be keyboard-dismissible, not
 *      swipe-only;
 *   4. focus is RESTORED to whatever opened it on close, so a screen-reader
 *      user is put back on the chip they tapped, not at the top of the page.
 *
 * `onClose` is held in a ref on purpose. If it were an effect dependency, an
 * inline arrow from the caller would re-run the effect on every render and
 * yank focus back to the first control mid-interaction.
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

export function useModal<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    const restoreTo = document.activeElement as HTMLElement | null;

    const first = visibleFocusables(node)[0];
    (first ?? node).focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (!node) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = visibleFocusables(node);
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) {
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      const inside = node.contains(active);
      if (event.shiftKey) {
        if (!inside || active === firstItem) {
          event.preventDefault();
          lastItem.focus();
        }
      } else if (!inside || active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);

    // The page behind a modal must not scroll under the user's thumb.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (restoreTo && document.contains(restoreTo)) {
        restoreTo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return ref;
}
