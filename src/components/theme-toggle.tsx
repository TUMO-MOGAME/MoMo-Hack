/** @jsxRuntime automatic */
'use client';

/**
 * The light/dark switch.
 *
 * ── IT RENDERS NOTHING UNTIL IT HAS MOUNTED, AND THAT IS DELIBERATE ──────────
 *
 * The server does not know which theme this browser chose — the choice lives in
 * `localStorage` and is applied by `THEME_BOOTSTRAP` before first paint. So any
 * icon rendered on the server is a guess, and a guess that is wrong half the
 * time produces a hydration mismatch AND a visibly wrong icon for one frame.
 *
 * Reserving the space and filling it after mount costs one frame of an empty
 * 44px box and is always right. `suppressHydrationWarning` would silence the
 * warning while keeping the wrong icon, which is the worse trade.
 */

import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, type Theme } from '@/lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      // Before mount there is nothing true to say, so the control is inert and
      // hidden from assistive tech rather than announcing a state it is guessing.
      disabled={theme === null}
      aria-hidden={theme === null}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      // The label names the DESTINATION, not the current state. "Dark theme" on
      // a button is ambiguous — it could mean "you are in it" or "go to it".
      aria-label={theme === null ? undefined : `Switch to the ${next} theme`}
      title={theme === null ? undefined : `Switch to the ${next} theme`}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-secondary ${className}`}
    >
      {theme === null ? null : theme === 'dark' ? (
        // In DARK, offer the sun.
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // In LIGHT, offer the moon.
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
