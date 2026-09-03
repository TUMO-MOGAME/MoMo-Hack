/** @jsxRuntime automatic */
'use client';

/**
 * "The people you support" — the roster on the opening screen.
 *
 * ── WHY THERE ARE NO AMOUNTS SENT, AND NO BALANCES ───────────────────────────
 *
 * The only number here is what you TYPICALLY send someone. It is not a total,
 * not a balance, and not "what you have paid Gogo this month" — because none
 * of those exist in the ledger yet, the roster is not linked to any
 * transaction, and a per-person total is exactly the figure that would have to
 * be invented to fill the space.
 *
 * That restraint is the rule, not modesty. CLAUDE.md #14: no number reaches a
 * screen without a `sourceTxnId` behind it. A roster row sitting beside a real
 * ledger figure is safe; a roster row *carrying* an invented figure is a
 * number with no provenance on the same screen as numbers that have one, and
 * nobody looking can tell the two apart. `usualMinor` is labelled "usually"
 * for that reason, in the markup, where a reader sees it.
 *
 * ── AND IT SAYS WHERE THE MONEY ACTUALLY GOES ────────────────────────────────
 *
 * There is ONE MTN account in this demo, so every payment settles to the
 * operator's own wallet. Six names on a screen imply six wallets, so the strip
 * states the truth once, quietly, underneath — driven by
 * `settlesToOperatorWallet` on the rows themselves rather than by a hardcoded
 * sentence that would outlive the fact. `MISTAKES.md` M10 is what happens when
 * a screen implies a movement that did not occur.
 *
 * Nothing here is clickable. Every other affordance on this screen SENDS A
 * REAL QUESTION, and there is no true question to ask about a person the
 * ledger has never heard of — a tap that returned "I have no record of Gogo"
 * is worse than no tap at all.
 */

import { formatZAR, minor } from '@/domain/money';
import type { Person, SupportKind } from '@/lib/roster';

/** How each support kind presents. Unknown kinds are dropped upstream. */
const SUPPORT: Record<SupportKind, string> = {
  WAGE: 'wages',
  ELECTRICITY: 'electricity',
  AIRTIME: 'airtime',
};

const RELATION: Record<Person['relation'], string> = {
  MOTHER: 'Mother',
  FATHER: 'Father',
  SISTER: 'Sister',
  GRANDMOTHER: 'Grandmother',
  GRANDFATHER: 'Grandfather',
  HELPER: 'Helps at home',
};

export interface PeopleStripProps {
  readonly people: readonly Person[];
}

export function PeopleStrip({ people }: PeopleStripProps) {
  if (people.length === 0) return null;

  const oneWallet = people.every((p) => p.settlesToOperatorWallet);

  return (
    <section className="w-full" aria-labelledby="people-heading">
      <h3
        id="people-heading"
        className="mb-2.5 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground"
      >
        The people you support
      </h3>

      <ul className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-3 rounded-xl border border-divider bg-card px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium leading-tight">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{RELATION[p.relation]}</span>
            </span>

            {p.supports.length > 0 ? (
              <span className="shrink-0 text-right">
                <span className="block text-xs text-brand-text">
                  {p.supports.map((s) => SUPPORT[s]).join(' · ')}
                </span>
                {p.usualMinor === null ? null : (
                  <span className="block font-mono text-xs text-muted-foreground">
                    {/* "usually", never a total — see the docstring. */}
                    usually {formatZAR(minor(p.usualMinor))}
                  </span>
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {oneWallet ? (
        <p className="mt-2.5 text-center text-xs text-muted-foreground">
          One MTN account in this demo — every payment settles to your own wallet.
        </p>
      ) : null}
    </section>
  );
}
