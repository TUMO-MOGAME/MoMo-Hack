/** @jsxRuntime automatic */

/**
 * `/ledger` — the real database, on a screen.
 *
 * ⚠️ WHY THIS PAGE EXISTS. Every other surface in this product is driven by
 * `mockAgent`: honest starter scope, clearly labelled, and completely invented.
 * That is a fine way to build a shell and a poor way to demonstrate a ledger.
 * The pitch is "money moved, and the books cannot be wrong" — a page of
 * plausible fiction argues the opposite of that, to exactly the audience least
 * likely to take it on trust.
 *
 * So this page reads Postgres and renders what it finds, through the same
 * artifact components the agent will use, with the same provenance guard
 * pointed at it. If it ever shows a number it did not read, the renderer
 * strikes it through and says "unverified" without being asked.
 *
 * SERVER COMPONENT. The query runs here, with the service-role connection, and
 * only plain data crosses to the client (ADR-0010, CLAUDE.md #5). The browser
 * never touches the ledger.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { LedgerLive } from '@/components/ledger-live';
import { readLedgerSnapshot } from '@/server/ledger/read';

export const metadata: Metadata = {
  title: 'Ledger · MoMo Kasi',
  description:
    'Every posting in the MoMo Kasi ledger, read live from Postgres. Double entry, enforced by the database.',
};

export const runtime = 'nodejs';
// Never cached. A ledger page that serves a stale total is worse than one that
// is slow, and this is the number the whole pitch rests on.
export const dynamic = 'force-dynamic';

export default async function LedgerPage() {
  let snapshot;
  let failure: string | null = null;

  try {
    snapshot = await readLedgerSnapshot();
  } catch (e) {
    // Name the condition, never the connection string. This page is public.
    failure = e instanceof Error && /DATABASE_URL/.test(e.message) ? 'unconfigured' : 'unreachable';
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10">
        <Link
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← MoMo Kasi
        </Link>
        <h1 className="font-display mt-4 text-3xl sm:text-4xl">The ledger, live</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          Not a mock-up. Every figure below is read from the Postgres database this application
          writes to, at the moment you loaded the page. Money is stored in integer cents and never
          as a floating-point number.
        </p>
      </header>

      {snapshot ? (
        <LedgerLive snapshot={snapshot} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-display text-lg">The ledger is not reachable</h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            {failure === 'unconfigured'
              ? 'This deployment has no database connection configured, so there is nothing to read. That is a deployment setting, not a fault in the ledger.'
              : 'The database did not answer. The ledger itself is unaffected — this page only reads.'}
          </p>
        </div>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        Amounts cross from the server as decimal strings and are revived as <code>bigint</code>{' '}
        before rendering. Nothing here is ever a JavaScript <code>number</code>.
      </p>
    </main>
  );
}
