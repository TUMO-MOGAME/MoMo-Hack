/** @jsxRuntime automatic */
'use client';

/**
 * Primitives every artifact shares (docs/13 §8).
 *
 * Two rules live here and nowhere else:
 *   1. Money is formatted by `formatZAR` and announced by `moneyLabel`.
 *      No component does its own arithmetic on an amount (CLAUDE.md #1).
 *   2. Money without provenance renders a WARNING, not a number (ADR-0013).
 */

import { formatZAR, type Minor } from '@/domain/money';
import type { SourcedMoney } from '@/lib/artifacts/types';
import { moneyLabel, UNSOURCED_BADGE, UNSOURCED_LABEL } from './summary';

/** Provenance is the contract. Missing it is a bug we surface, not hide. */
export function isSourced(money: SourcedMoney): boolean {
  return Boolean(money.sourceTxnId ?? money.sourceAccountId);
}

export interface MoneyProps {
  readonly money: SourcedMoney;
  readonly className?: string;
  /** "+" for money in, "-" for money out. A sign, never a recalculation. */
  readonly sign?: '+' | '−';
  /** Overrides the spoken form, e.g. "received 60 rand". */
  readonly announce?: string;
}

/**
 * The only component in the app allowed to put an amount on screen.
 *
 * A screen reader gets "twelve rand fifty", not the glyph soup a currency
 * string turns into (A3 overlay, "Money-specific accessibility").
 */
export function Money({ money, className = '', sign, announce }: MoneyProps) {
  if (!isSourced(money)) return <UnsourcedMoney money={money} />;
  const formatted = formatZAR(money.amount as Minor);
  return (
    <span
      className={`tabular whitespace-nowrap ${className}`}
      aria-label={announce ?? `${sign === '−' ? 'minus ' : ''}${moneyLabel(money.amount as Minor)}`}
    >
      <span aria-hidden="true">
        {sign ? `${sign} ` : ''}
        {formatted}
      </span>
    </span>
  );
}

/**
 * docs/13 §3 rule 2. The agent cannot type a number into an artifact; if one
 * arrives without a `sourceTxnId` or `sourceAccountId` we show that it is not
 * trustworthy rather than quietly rendering it.
 *
 * Colour is never the only signal (A3): there is an icon, a struck-through
 * amount and the word "unverified".
 */
export function UnsourcedMoney({ money }: { money: SourcedMoney }) {
  return (
    <span
      data-unsourced="true"
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-destructive"
    >
      <WarningIcon />
      <span className="tabular line-through" aria-hidden="true">
        {formatZAR(money.amount as Minor)}
      </span>
      <span
        aria-hidden="true"
        className="rounded-sm bg-destructive px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive-foreground"
      >
        {UNSOURCED_BADGE}
      </span>
      <span className="sr-only">{UNSOURCED_LABEL}</span>
    </span>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-3">{children}</div>;
}

export function Label({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm text-foreground">{children}</div>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** The small all-caps line above a number. 12px floor — cracked screens. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-widest text-muted-foreground">{children}</div>;
}

export type PillTone = 'success' | 'warning' | 'destructive' | 'brand' | 'muted';

const PILL_TONE: Record<PillTone, string> = {
  // Solid, not tinted. A 15%-alpha tint of `warning` on `card` measures 4.2:1
  // in the light theme; the solid pair is 4.6:1 and 10.5:1. A3 treats anything
  // under 4.5:1 as High because it means a balance is unreadable outdoors.
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  brand: 'bg-brand text-brand-foreground',
  muted: 'bg-secondary text-secondary-foreground',
};

/**
 * A status badge. Always carries a word — status colour is never the only
 * signal (A3), because roughly 1 in 12 men cannot separate our success green
 * from our warning amber, and neither can anyone in direct sunlight.
 */
export function Pill({
  tone,
  children,
  icon,
}: {
  tone: PillTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${PILL_TONE[tone]}`}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}

/** Shown when an artifact is well-formed but has nothing in it yet. */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-5 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

/** A short explanatory note under an artifact. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

export function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
