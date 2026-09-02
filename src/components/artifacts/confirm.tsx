/** @jsxRuntime automatic */
'use client';

/**
 * The confirmation artifact — the one surface in this app that can lead to
 * money moving, and the highest-stakes screen we ship (A3 overlay).
 *
 * docs/13 §5, ADR-0014:
 *   - it renders from the SERVER-SIGNED PROPOSAL, never from the agent's prose;
 *   - there is no auto-confirm and no voice confirm;
 *   - a human thumb is the only thing in the system that moves money.
 *
 * Layout rules that are accessibility requirements, not taste:
 *   - Confirm and Cancel are stacked, not two buttons side by side. A3 calls
 *     an adjacent pair of similar buttons a High finding, and one thumb at a
 *     taxi rank should not be able to mis-tap a payment.
 *   - Cancel sits lowest, where a thumb lands first, because it is the safe one.
 *   - Both are ≥ 48px, both are keyboard-reachable, both take the global
 *     focus-visible ring.
 *   - The action bar is sticky, so it is on screen at 320px without scrolling.
 */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';
import { moneyLabel } from './summary';
import { Kicker, Label, Money, Row, UnsourcedMoney, WarningIcon, isSourced } from './shared';

type ConfirmArtifact = Extract<Artifact, { type: 'confirm' }>;

export interface ConfirmProps {
  readonly a: ConfirmArtifact;
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}

export function Confirm({ a, onConfirm, onCancel }: ConfirmProps) {
  const { action } = a;
  const spokenAmount = moneyLabel(action.money.amount as Minor);

  return (
    <div>
      <div className="rounded-lg border border-brand bg-card p-5 glow-brand">
        <Kicker>Pay</Kicker>
        {isSourced(action.money) ? (
          <div
            className="font-display text-5xl tabular text-brand"
            aria-label={`Pay ${spokenAmount}`}
          >
            <span aria-hidden="true">{formatZAR(action.money.amount as Minor)}</span>
          </div>
        ) : (
          <div className="mt-1 text-2xl">
            <UnsourcedMoney money={action.money} />
          </div>
        )}

        <dl className="mt-5 divide-y divide-border">
          <Row>
            <dt>
              <Label sub={action.payeeMasked}>To</Label>
            </dt>
            <dd className="text-right text-sm text-foreground">{action.payeeLabel}</dd>
          </Row>
          <Row>
            <dt>
              <Label>For</Label>
            </dt>
            <dd className="text-right text-sm text-foreground">{action.purpose}</dd>
          </Row>
          <Row>
            <dt>
              <Label>From</Label>
            </dt>
            <dd className="text-right text-sm text-muted-foreground">
              {action.fromLabel} ·{' '}
              <Money
                money={action.fromBalance}
                announce={`balance ${moneyLabel(action.fromBalance.amount as Minor)}`}
              />
            </dd>
          </Row>
        </dl>
      </div>

      {/* Sticky so the two controls are reachable at 320px without scrolling. */}
      <div className="sticky bottom-0 -mx-1 mt-6 space-y-3 bg-popover px-1 pb-2 pt-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!isSourced(action.money)}
          className="w-full rounded-lg bg-brand px-4 py-4 text-base font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Confirm — pay <span className="tabular">{formatZAR(action.money.amount as Minor)}</span>
          <span className="sr-only"> to {action.payeeLabel}. This moves {spokenAmount}.</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-border bg-background px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Cancel — do not pay
        </button>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <span className="mt-0.5 shrink-0 text-brand">
          <WarningIcon />
        </span>
        <span>
          The assistant prepared this. It cannot move money on its own — this card is rendered from a
          server-signed proposal, your tap is the only thing that settles it, and the proposal stops
          being valid two minutes after it was made.
        </span>
      </p>
    </div>
  );
}
