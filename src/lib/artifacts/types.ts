/**
 * The artifact contract (docs/13 §3).
 *
 * The agent NEVER emits markup. It emits data matching this union, and a fixed
 * registry maps each `type` to exactly one component. There is no
 * dangerouslySetInnerHTML anywhere in the artifact path.
 *
 * TODO(S7c): mirror this as a zod discriminated union and validate at the
 * boundary before anything reaches React. These types are the frozen contract
 * agents implement against in the meantime.
 */

import type { Minor } from '@/domain/money';

/**
 * Money inside an artifact must carry provenance. The model cannot type a
 * number in — it can only pass through one a tool read from the ledger.
 */
export interface SourcedMoney {
  readonly amount: Minor;
  readonly sourceTxnId?: string;
  readonly sourceAccountId?: string;
}

export interface BalanceRow {
  readonly label: string;
  readonly kind: 'WALLET' | 'ESCROW' | 'LOCKED' | 'POOL';
  readonly money: SourcedMoney;
  readonly note?: string;
}

export interface TxnRow {
  readonly id: string;
  readonly at: string;
  readonly label: string;
  readonly counterparty?: string;
  readonly direction: 'IN' | 'OUT';
  readonly money: SourcedMoney;
  readonly status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
}

export interface SplitPartRow {
  readonly key: string;
  readonly label: string;
  readonly bps: number;
  readonly money: SourcedMoney;
}

export interface JobRow {
  readonly id: string;
  readonly title: string;
  readonly where: string;
  readonly money: SourcedMoney;
  readonly state: 'OPEN' | 'ACCEPTED' | 'FUNDED' | 'PROOF_SUBMITTED' | 'RELEASED';
}

export interface StokvelMemberRow {
  readonly name: string;
  readonly paid: boolean;
  readonly next: boolean;
}

/** A proposed money movement. Server-signed. Renders a confirmation card. */
export interface ProposedAction {
  readonly kind: 'PAYMENT' | 'STOKVEL_JOIN' | 'JOB_ACCEPT';
  readonly money: SourcedMoney;
  readonly payeeLabel: string;
  readonly payeeMasked: string;
  readonly purpose: string;
  readonly fromLabel: string;
  readonly fromBalance: SourcedMoney;
  /** HMAC over (amount, payee, purpose, user, expiry). Verified server-side. */
  readonly signature: string;
  readonly expiresAt: string;
}

interface Base {
  readonly id: string;
  readonly title: string;
}

export type Artifact =
  | (Base & { type: 'wallet'; balances: BalanceRow[] })
  | (Base & { type: 'transactions'; items: TxnRow[]; caption?: string })
  | (Base & { type: 'split-breakdown'; fare: SourcedMoney; parts: SplitPartRow[]; route: string })
  | (Base & { type: 'stokvel'; pool: SourcedMoney; target: SourcedMoney; members: StokvelMemberRow[]; cadence: string })
  | (Base & { type: 'job-list'; jobs: JobRow[] })
  | (Base & { type: 'trust-score'; score: number; completed: number; factors: { label: string; met: boolean }[] })
  | (Base & { type: 'confirm'; action: ProposedAction })
  | (Base & { type: 'error'; message: string });

export type ArtifactType = Artifact['type'];

/** The kicker shown on the in-chat chip, per type. */
export const ARTIFACT_KICKER: Record<ArtifactType, string> = {
  wallet: 'Wallet',
  transactions: 'Activity',
  'split-breakdown': 'Fare split',
  stokvel: 'Stokvel',
  'job-list': 'Jobs',
  'trust-score': 'Trust score',
  confirm: 'Confirm payment',
  error: 'Problem',
};
