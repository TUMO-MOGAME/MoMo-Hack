/** @jsxRuntime automatic */
'use client';

/**
 * The phone form of the context rail.
 *
 * On a 320px screen a third column would be a cramped, unreadable strip that
 * steals room from the conversation, so below `xl` the rail collapses to this:
 * one 44px line above the composer carrying the two numbers a person opens the
 * app for — what is spendable, and what is due next — and a tap opens the rest
 * in a drawer.
 *
 * The chat loses one line of height and nothing else.
 */

import type { KasiContext } from '@/lib/agent/mock';
import type { Minor } from '@/domain/money';
import { ClockIcon, Money, Pill } from '@/components/artifacts/shared';
import { moneyLabel } from '@/components/artifacts/summary';
import { SignalOffIcon, WalletIcon } from '@/components/icons';

export function ContextStrip({
  context,
  offline,
  onOpen,
}: {
  context: KasiContext;
  offline?: boolean;
  onOpen: () => void;
}) {
  const available = context.balances.find((b) => b.kind === 'WALLET');
  // `next` is optional now — the ledger has no bills or stokvel schedules in it
  // yet, so there is often nothing true to put here. The pill disappears rather
  // than counting down to an invented date.
  const next = context.next;
  const days = next?.dueInDays;
  const dueWord =
    days === undefined ? null : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Your position: ${
        available ? `${moneyLabel(available.money.amount as Minor)} available` : 'no wallet yet'
      }.${
        next && dueWord ? ` ${next.label} due in ${dueWord.toLowerCase()}.` : ''
      } Open for the full picture.`}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-brand"
    >
      <span className="shrink-0 text-brand" aria-hidden="true">
        {offline ? <SignalOffIcon size={16} /> : <WalletIcon size={16} />}
      </span>

      <span className="min-w-0 flex-1" aria-hidden="true">
        {available ? (
          <Money money={available.money} className="text-sm font-semibold text-foreground" />
        ) : (
          <span className="text-sm text-muted-foreground">No wallet yet</span>
        )}
        <span className="ml-1.5 text-xs text-muted-foreground">
          {offline ? 'offline · captured here' : 'available'}
        </span>
      </span>

      {dueWord !== null && days !== undefined ? (
        <span className="shrink-0" aria-hidden="true">
          <Pill tone={days <= 1 ? 'warning' : 'muted'} icon={<ClockIcon />}>
            {dueWord}
          </Pill>
        </span>
      ) : null}
    </button>
  );
}
