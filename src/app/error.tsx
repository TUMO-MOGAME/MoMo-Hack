/** @jsxRuntime automatic */
'use client';

/**
 * A1-02. There was no error boundary anywhere in `src/app`.
 *
 * Without one, a thrown Server Component renders Next's built-in page, which in
 * production says **"Application error: a client-side exception has occurred"**
 * and nothing else. On a money product, in front of judges, that sentence is
 * worse than the failure it describes — it reads as "we do not know what our
 * software is doing".
 *
 * ── WHAT THIS SAYS, AND WHY THOSE WORDS ──────────────────────────────────────
 *
 * **"Nothing was changed."** That is the sentence that matters and it is true by
 * construction, not by hope: every surface a user can reach today is read-only
 * (there is no write tool below `respond()`, and `/ledger` only selects). A
 * person whose money app just showed an error needs to know their balance did
 * not move before they need anything else.
 *
 * It does NOT show `error.message`. A digest is enough for us to find it in the
 * log drain, and an error string can carry a connection target, a query, or a
 * row id. `/ledger`'s own catch already takes this care — it reports
 * "unconfigured" or "unreachable" and never the connection string — and an
 * error boundary that undoes that in one line would be a poor trade.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side, so this reaches the browser console and Vercel's log drain
    // via the framework's own reporting. The digest is the join key back to the
    // server-side stack; the message itself stays out of the DOM.
    console.error('app.render.failed', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
      <h1 className="font-display text-3xl">That didn&apos;t load.</h1>

      <p className="mt-4 text-base leading-relaxed text-foreground">
        Something went wrong drawing this page. <strong>Nothing was changed</strong> — every screen
        in this build only ever reads from the ledger.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-lg bg-brand px-5 text-base font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="grid min-h-11 place-items-center rounded-lg border border-border px-5 text-base font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Back to the start
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-muted-foreground">
          Reference <span className="tabular">{error.digest}</span>
        </p>
      ) : null}
    </main>
  );
}
