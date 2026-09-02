/**
 * The spoken summary of an artifact.
 *
 * docs/13 §7: "the artifact's spoken summary IS its aria-label". One string,
 * two consumers — the phrase bank (docs/12 §3) and the screen reader. If they
 * ever diverge, a blind user and a voice user get different products, and A3
 * calls that a finding.
 *
 * Nothing here does arithmetic on money. Amounts are rendered by
 * `toDecimalString` from src/domain/money.ts and only ever re-worded.
 */

import { toDecimalString, type Minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';

/**
 * "1250" -> "12 rand 50 cents", which a screen reader says as
 * "twelve rand fifty cents". Reading out `R12.50` gives "R one two point five
 * zero" on some Android TalkBack versions, which is A3's worked example of
 * what not to ship.
 */
export function moneyLabel(amount: Minor): string {
  const decimal = toDecimalString(amount);
  const negative = decimal.startsWith('-');
  const [whole = '0', cents = '00'] = decimal.replace('-', '').split('.');
  // String surgery on an already-formatted amount, never a recomputation.
  const trimmedCents = cents.replace(/^0/, '');
  const spoken =
    cents === '00'
      ? `${whole} rand`
      : whole === '0'
        ? `${trimmedCents} cents`
        : `${whole} rand ${trimmedCents} cents`;
  return negative ? `minus ${spoken}` : spoken;
}

/** The amount a screen reader hears when provenance is missing (ADR-0013). */
export const UNSOURCED_LABEL =
  'Amount not verified against the ledger. This is a bug, not a balance.';

/** Short visible companion to the strike-through, so colour is never alone. */
export const UNSOURCED_BADGE = 'unverified';

function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * One sentence per artifact. Spoken on open, and used as the region's
 * `aria-label`. Deliberately plain English — many of our users read English as
 * a second or third language (docs/audits/A3.project.md).
 */
export function artifactSummary(artifact: Artifact): string {
  switch (artifact.type) {
    case 'wallet': {
      const available = artifact.balances.find((b) => b.kind === 'WALLET');
      return available
        ? `You have ${moneyLabel(available.money.amount)} available.`
        : 'Your wallet balances.';
    }
    case 'transactions':
      return `${count(artifact.items.length, 'transaction', 'transactions')} in ${artifact.title}.`;
    case 'split-breakdown':
      return `Your ${moneyLabel(artifact.fare.amount)} fare was split ${count(
        artifact.parts.length,
        'way',
        'ways',
      )}.`;
    case 'stokvel': {
      const next = artifact.members.find((m) => m.next);
      const pool = `The pool is at ${moneyLabel(artifact.pool.amount)} of ${moneyLabel(
        artifact.target.amount,
      )}.`;
      return next ? `${pool} ${next.name} is next.` : pool;
    }
    case 'job-list':
      return `${count(artifact.jobs.length, 'job', 'jobs')} near you.`;
    case 'trust-score':
      return `Your trust score is ${artifact.score} out of 100, from ${count(
        artifact.completed,
        'completed job',
        'completed jobs',
      )}.`;
    case 'confirm': {
      // "Nomsa M." already ends in a full stop; two in a row makes a screen
      // reader pause twice and reads as a stutter.
      const payee = artifact.action.payeeLabel.replace(/\.$/, '');
      return `Confirm: pay ${moneyLabel(
        artifact.action.money.amount,
      )} to ${payee}. Tap confirm when you are ready.`;
    }
    case 'error':
      return `Something went wrong. ${artifact.message}`;
  }
}
