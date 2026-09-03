/** @jsxRuntime automatic */
'use client';

/**
 * The rotating greeting on the opening screen.
 *
 * ── IT IS SILENT TO A SCREEN READER, ON PURPOSE ──────────────────────────────
 *
 * This word sits inside the page's `<h2>`, so it is part of a heading — and a
 * heading whose text changes every 2.6 seconds is a heading a screen reader
 * re-announces every 2.6 seconds, forever, over whatever the person was
 * actually reading. So the animated word is `aria-hidden` and a single stable
 * "Sawubona." is exposed instead. Assistive technology sees one unchanging
 * heading; everyone else sees the rotation.
 *
 * ── AND IT DOES NOT ROTATE UNDER `prefers-reduced-motion` ────────────────────
 *
 * WCAG 2.2.2 covers information that auto-updates, not only things that slide
 * about, and text that changes on its own is genuinely hard to read alongside
 * some attention and vestibular conditions. The interval is therefore never
 * started when reduced motion is asked for — not merely animated more quietly —
 * and the screen rests on "Sawubona.", which is what it always showed.
 *
 * That is checked in an effect rather than in CSS because CSS can only suppress
 * the transition; the `setInterval` would still be swapping the word. `A3`'s
 * standing complaint (see `globals.css` §motion) is that reduced motion gets
 * declared and not verified, so this one is asserted in
 * `tests/unit/design/greeting.test.ts`.
 *
 * ── FIRST PAINT ──────────────────────────────────────────────────────────────
 *
 * Index 0 on the server and index 0 on the client's first render, so the markup
 * agrees and hydration is clean. The cycle only starts afterwards, in an effect.
 */

import { useEffect, useState } from 'react';
import { GREETINGS, GREETING_INTERVAL_MS, nextGreetingIndex, shouldRotate } from '@/lib/greetings';

export function GreetingCycle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // `shouldRotate` lives in `@/lib/greetings` so the reduced-motion decision
    // is unit-tested in both directions rather than grepped for.
    if (!shouldRotate(window.matchMedia?.bind(window))) return;

    const id = window.setInterval(() => {
      setIndex(nextGreetingIndex);
    }, GREETING_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  const greeting = GREETINGS[index]!;

  return (
    <>
      {/* The heading's real, unchanging text. */}
      <span className="sr-only">{GREETINGS[0]!.hello}.</span>
      {/* `key` remounts the element, which is what re-triggers `animate-rise`
          on each change — and `animate-rise` is already switched off by name
          under reduced motion in `globals.css`, so the fade cannot come back
          on its own if the effect above is ever changed. */}
      <em
        key={greeting.code}
        lang={greeting.code}
        aria-hidden="true"
        className="font-display not-italic text-brand-text animate-rise"
      >
        {greeting.hello}.
      </em>
    </>
  );
}
