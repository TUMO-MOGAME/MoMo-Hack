/** @jsxRuntime automatic */
'use client';

/**
 * The context rail — ambient answers to "what do I have, what do I owe, what
 * just happened".
 *
 * THE RULE THAT SHAPES IT: the chat is the spine of this app, not a sidebar.
 * So there are no links in here and no navigation. Every row is a button that
 * opens an ARTIFACT — the same thing a chip in the conversation does — which
 * means the rail adds context without adding a second way to use the app.
 *
 * Contents, in the order a person at a rank cares about them:
 *   1. what is spendable right now, and what is held back;
 *   2. the next thing they owe, with days remaining (PLANNING.md §3 — the
 *      stokvel obligation is the retention mechanic, so it is on screen);
 *   3. the last four movements;
 *   4. whether the phone actually has signal (docs/00 §6a — ICASA
 *      disconnection is abrupt and mid-session, so "queued" must be visible
 *      somewhere persistent rather than discovered later).
 *
 * Every amount goes through `Money`, so the provenance rule applies here
 * exactly as it does inside an artifact (CLAUDE.md #14, ADR-0013).
 */

import { useEffect, useState } from 'react';
import type { Artifact } from '@/lib/artifacts/types';
import type { KasiContext } from '@/lib/agent/mock';
import { moneyLabel } from '@/components/artifacts/summary';
import { ClockIcon, Kicker, Money, Pill } from '@/components/artifacts/shared';
import {
  CalendarIcon,
  ChevronIcon,
  SignalIcon,
  SignalOffIcon,
  WalletIcon,
} from '@/components/icons';
import type { Minor } from '@/domain/money';

export interface ContextPanelProps {
  readonly context: KasiContext;
  readonly onOpen: (artifact: Artifact) => void;
}

/**
 * `navigator.onLine` is read after mount, never during render — the server has
 * no idea whether this phone has signal, and guessing produces a hydration
 * mismatch. Optimistic until proven otherwise.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span aria-hidden="true">{icon}</span>
      <Kicker>{children}</Kicker>
    </div>
  );
}

/** Every tappable row in the rail. 44px minimum, one visible focus ring. */
function OpenRow({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary"
    >
      {children}
      <span
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      >
        <ChevronIcon size={14} />
      </span>
    </button>
  );
}

const KIND_ACCENT: Record<string, string> = {
  WALLET: 'text-brand',
  ESCROW: 'text-info',
  LOCKED: 'text-warning',
  POOL: 'text-success',
};

const KIND_WORD: Record<string, string> = {
  WALLET: 'available',
  ESCROW: 'held',
  LOCKED: 'locked',
  POOL: 'pooled',
};

export function ContextPanel({ context, onOpen }: ContextPanelProps) {
  const online = useOnline();
  const available = context.balances.find((b) => b.kind === 'WALLET');
  // Hoisted, not read inline: TypeScript cannot narrow `context.next` inside the
  // `onClick` closure below, so the optional property is resolved once here.
  const next = context.next;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      {/* 1. the position */}
      <section aria-labelledby="ctx-wallet">
        <SectionHeading icon={<WalletIcon size={14} />}>
          <span id="ctx-wallet">Your position</span>
        </SectionHeading>

        {available ? (
          <div className="mt-2">
            <OpenRow
              label={`${moneyLabel(
                available.money.amount as Minor,
              )} available to spend. Open your money.`}
              onClick={() => onOpen(context.wallet)}
            >
              <span className="min-w-0 flex-1">
                <Money money={available.money} className="font-display text-3xl text-brand" />
                <span className="block text-xs text-muted-foreground">available to spend</span>
              </span>
            </OpenRow>
          </div>
        ) : null}

        <ul className="mt-3">
          {context.balances
            .filter((b) => b.kind !== 'WALLET')
            .map((b) => (
              <li key={b.label}>
                <OpenRow
                  label={`${b.label}. Open your money.`}
                  onClick={() => onOpen(context.wallet)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{b.label}</span>
                    {b.note ? (
                      <span className="block truncate text-xs text-muted-foreground">{b.note}</span>
                    ) : null}
                  </span>
                  <Money
                    money={b.money}
                    className={`text-sm ${KIND_ACCENT[b.kind] ?? ''}`}
                    announce={`${moneyLabel(b.money.amount as Minor)} ${KIND_WORD[b.kind] ?? ''}`}
                  />
                </OpenRow>
              </li>
            ))}
        </ul>
      </section>

      {/* 2. the next obligation — only when there IS one. No real bills or
          stokvel schedules exist in the ledger yet, and a fabricated due
          date next to a real balance is worse than a shorter rail. */}
      {next ? (
        <section aria-labelledby="ctx-next">
          <SectionHeading icon={<CalendarIcon size={14} />}>
            <span id="ctx-next">Next due</span>
          </SectionHeading>
          <div className="mt-2 rounded-lg border border-border bg-card p-1">
            <OpenRow
              label={`${next.label}, ${moneyLabel(next.money.amount as Minor)} due in ${
                next.dueInDays
              } days. Open the stokvel.`}
              onClick={() => onOpen(next.artifact)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {next.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{next.detail}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Money money={next.money} className="text-sm text-foreground" />
                {/* Days remaining is a word as well as a colour. */}
                <Pill tone={next.dueInDays <= 1 ? 'warning' : 'muted'} icon={<ClockIcon />}>
                  {next.dueInDays === 0
                    ? 'Today'
                    : next.dueInDays === 1
                      ? 'Tomorrow'
                      : `${next.dueInDays} days`}
                </Pill>
              </span>
            </OpenRow>
          </div>
        </section>
      ) : null}

      {/* 3. what just happened */}
      <section aria-labelledby="ctx-recent">
        <SectionHeading icon={<ClockIcon />}>
          <span id="ctx-recent">Just happened</span>
        </SectionHeading>
        <ul className="mt-2">
          {context.recent.map((r) => (
            <li key={r.id}>
              <OpenRow
                label={`${r.label}, ${r.direction === 'IN' ? 'received' : 'paid'} ${moneyLabel(
                  r.money.amount as Minor,
                )}, ${r.at}. Open your activity.`}
                onClick={() => onOpen(r.artifact)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{r.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.at}
                    {r.status === 'PENDING' ? ' · not settled yet' : ''}
                  </span>
                </span>
                <Money
                  money={r.money}
                  sign={r.direction === 'IN' ? '+' : '−'}
                  className={`text-sm ${r.direction === 'IN' ? 'text-success' : 'text-foreground'}`}
                  announce={`${r.direction === 'IN' ? 'received' : 'paid'} ${moneyLabel(
                    r.money.amount as Minor,
                  )}`}
                />
              </OpenRow>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. can this phone actually reach us */}
      <section aria-labelledby="ctx-conn" className="mt-auto">
        <SectionHeading icon={online ? <SignalIcon size={14} /> : <SignalOffIcon size={14} />}>
          <span id="ctx-conn">Connection</span>
        </SectionHeading>
        <p
          role="status"
          className="mt-2 flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
        >
          <span
            className={online ? 'mt-0.5 text-success' : 'mt-0.5 text-warning'}
            aria-hidden="true"
          >
            {online ? <SignalIcon size={14} /> : <SignalOffIcon size={14} />}
          </span>
          <span>
            {online ? (
              <>
                <span className="font-medium text-foreground">Sandbox · connected.</span> No real
                money moves here. Every number above came from the ledger, not from the assistant.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Offline.</span> Keep working — fares
                are captured on the phone and settle the moment you have signal.
              </>
            )}
            {context.queued > 0 ? (
              <>
                {' '}
                <span className="text-foreground">
                  {context.queued} {context.queued === 1 ? 'payment is' : 'payments are'} queued.
                </span>
              </>
            ) : null}
          </span>
        </p>
      </section>
    </div>
  );
}
