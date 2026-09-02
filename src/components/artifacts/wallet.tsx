/** @jsxRuntime automatic */
'use client';

/** The wallet artifact: what is spendable, and what is not. */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { moneyLabel } from './summary';
import { EmptyState, Footnote, isSourced, Kicker, Label, Money, Row, UnsourcedMoney } from './shared';

type WalletArtifact = Extract<Artifact, { type: 'wallet' }>;

/**
 * Held and locked money is tinted differently, but the note under each row is
 * what actually carries the meaning — colour is never the only signal (A3).
 */
const KIND_ACCENT: Record<string, string> = {
  WALLET: 'text-brand',
  ESCROW: 'text-info',
  LOCKED: 'text-warning',
  POOL: 'text-success',
};

const KIND_WORD: Record<string, string> = {
  ESCROW: 'held',
  LOCKED: 'locked',
  POOL: 'pooled',
  WALLET: 'available',
};

export function Wallet({ a }: { a: WalletArtifact }) {
  if (a.balances.length === 0) {
    return (
      <EmptyState
        title="No accounts yet"
        hint="Your wallet opens the first time money moves — a fare, a gig payout, or a stokvel contribution."
      />
    );
  }

  const available = a.balances.find((b) => b.kind === 'WALLET');
  const rest = a.balances.filter((b) => b.kind !== 'WALLET');

  return (
    <div>
      {available ? (
        <div className="mb-6">
          <Kicker>Available</Kicker>
          {isSourced(available.money) ? (
            <div
              className="font-display text-5xl tabular text-brand"
              aria-label={`${moneyLabel(available.money.amount as Minor)} available`}
            >
              <span aria-hidden="true">{formatZAR(available.money.amount as Minor)}</span>
            </div>
          ) : (
            <div className="mt-1 text-2xl">
              <UnsourcedMoney money={available.money} />
            </div>
          )}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="divide-y divide-border">
          {rest.map((b) => (
            <Row key={b.label}>
              <Label sub={b.note}>{b.label}</Label>
              <Money
                money={b.money}
                className={`text-base ${KIND_ACCENT[b.kind] ?? ''}`}
                announce={`${moneyLabel(b.money.amount as Minor)} ${KIND_WORD[b.kind] ?? ''}`}
              />
            </Row>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing held back"
          hint="Every cent in this wallet is spendable right now."
        />
      )}

      <Footnote>
        Held and locked money sits in its own account, so it is never counted as spendable. That is
        the ledger, not a UI rule.
      </Footnote>
    </div>
  );
}
