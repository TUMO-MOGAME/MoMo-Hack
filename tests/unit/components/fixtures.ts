/**
 * Artifact fixtures for the component tests (docs/13 §9, "Unit: every artifact
 * renders from a fixture").
 *
 * These are hand-built rather than snapshotted so that the numbers in the
 * assertions are the numbers a reader can see here. Every `money` carries
 * provenance, exactly as the contract requires — except the two deliberately
 * broken fixtures at the bottom, which exist to prove the guard fires.
 */

import { minor } from '@/domain/money';
import type { Artifact } from '@/lib/artifacts/types';

export const walletFixture: Extract<Artifact, { type: 'wallet' }> = {
  id: 'w1',
  title: 'Your money',
  type: 'wallet',
  balances: [
    {
      label: 'Available',
      kind: 'WALLET',
      money: { amount: minor(34000n), sourceAccountId: 'acc_w1' },
    },
    {
      label: 'Held in escrow',
      kind: 'ESCROW',
      money: { amount: minor(6000n), sourceAccountId: 'acc_e1' },
      note: 'Kombi wash · releases on approval',
    },
    {
      label: 'School fees (locked)',
      kind: 'LOCKED',
      money: { amount: minor(200000n), sourceAccountId: 'acc_l1' },
      note: 'From Sipho, London · school fees only',
    },
  ],
};

export const transactionsFixture: Extract<Artifact, { type: 'transactions' }> = {
  id: 't1',
  title: 'This week',
  type: 'transactions',
  caption: 'R340 in, mostly from washes.',
  items: [
    {
      id: 'a',
      at: 'Today 07:12',
      label: 'Kombi wash',
      counterparty: 'Rank 42',
      direction: 'IN',
      money: { amount: minor(6000n), sourceTxnId: 'txn_a' },
      status: 'SUCCESSFUL',
    },
    {
      id: 'b',
      at: 'Today 07:40',
      label: 'Taxi fare',
      direction: 'OUT',
      money: { amount: minor(1250n), sourceTxnId: 'txn_b' },
      status: 'SUCCESSFUL',
    },
    {
      id: 'c',
      at: 'Mon',
      label: 'Tyre check',
      direction: 'IN',
      money: { amount: minor(9000n), sourceTxnId: 'txn_c' },
      status: 'PENDING',
    },
    {
      id: 'd',
      at: 'Sun',
      label: 'Airtime',
      direction: 'OUT',
      money: { amount: minor(2900n), sourceTxnId: 'txn_d' },
      status: 'FAILED',
    },
  ],
};

export const splitFixture: Extract<Artifact, { type: 'split-breakdown' }> = {
  id: 's1',
  title: 'Fare split · Rank 42',
  type: 'split-breakdown',
  route: 'Katlehong → Germiston',
  fare: { amount: minor(1250n), sourceTxnId: 'txn_8842' },
  parts: [
    {
      key: 'OWNER',
      label: 'Taxi owner',
      bps: 6000,
      money: { amount: minor(750n), sourceTxnId: 'txn_8842' },
    },
    {
      key: 'DRIVER_FLOAT',
      label: 'Driver float',
      bps: 2500,
      money: { amount: minor(313n), sourceTxnId: 'txn_8842' },
    },
    {
      key: 'FUEL_POOL',
      label: 'Fuel & parts pool',
      bps: 1000,
      money: { amount: minor(125n), sourceTxnId: 'txn_8842' },
    },
    {
      key: 'INSURANCE_POOL',
      label: 'Insurance pool',
      bps: 500,
      money: { amount: minor(62n), sourceTxnId: 'txn_8842' },
    },
  ],
};

export const stokvelFixture: Extract<Artifact, { type: 'stokvel' }> = {
  id: 'sv1',
  title: 'Masakhane Grocery Stokvel',
  type: 'stokvel',
  cadence: 'R300 every Monday',
  pool: { amount: minor(270000n), sourceAccountId: 'acc_s1' },
  target: { amount: minor(360000n), sourceAccountId: 'acc_s1' },
  members: [
    { name: 'MaDlamini', paid: true, next: false },
    { name: 'Zanele', paid: true, next: true },
    { name: 'Sibusiso', paid: false, next: false },
  ],
};

export const jobListFixture: Extract<Artifact, { type: 'job-list' }> = {
  id: 'j1',
  title: 'Jobs near you',
  type: 'job-list',
  jobs: [
    {
      id: 'j-a',
      title: 'Wash kombi',
      where: 'Rank 42 · 400m',
      money: { amount: minor(6000n), sourceAccountId: 'acc_j1' },
      state: 'OPEN',
    },
    {
      id: 'j-b',
      title: 'Queue marshalling, 3h',
      where: 'Rank 12 · 1.2km',
      money: { amount: minor(12000n), sourceAccountId: 'acc_j2' },
      state: 'FUNDED',
    },
  ],
};

export const trustFixture: Extract<Artifact, { type: 'trust-score' }> = {
  id: 'ts1',
  title: 'Ubuntu Trust Score',
  type: 'trust-score',
  score: 62,
  completed: 14,
  factors: [
    { label: '10 jobs completed', met: true },
    { label: '25 jobs completed — unlocks tool lease', met: false },
  ],
};

export const confirmFixture: Extract<Artifact, { type: 'confirm' }> = {
  id: 'c1',
  title: 'Confirm payment',
  type: 'confirm',
  action: {
    kind: 'PAYMENT',
    money: { amount: minor(4500n), sourceAccountId: 'acc_w1' },
    payeeLabel: 'Nomsa M.',
    payeeMasked: '•••• 4821',
    purpose: 'Kombi wash · Rank 42',
    fromLabel: 'Your wallet',
    fromBalance: { amount: minor(34000n), sourceAccountId: 'acc_w1' },
    signature: 'demo-signature-not-valid',
    expiresAt: '2026-09-02T10:00:00.000Z',
  },
};

export const errorFixture: Extract<Artifact, { type: 'error' }> = {
  id: 'e1',
  title: 'Problem',
  type: 'error',
  message: 'That request came back malformed.',
};

/**
 * DELIBERATELY BROKEN. `money` with neither `sourceTxnId` nor `sourceAccountId`
 * is exactly what ADR-0013 forbids, and the renderer must refuse to present it
 * as a balance. If this fixture ever renders a clean number, the model has been
 * handed the ability to invent amounts.
 */
export const unsourcedWalletFixture: Extract<Artifact, { type: 'wallet' }> = {
  id: 'w-bad',
  title: 'Your money',
  type: 'wallet',
  balances: [
    {
      label: 'Available',
      kind: 'WALLET',
      money: { amount: minor(34000n), sourceAccountId: 'acc_w1' },
    },
    { label: 'Held in escrow', kind: 'ESCROW', money: { amount: minor(6000n) } },
  ],
};

export const unsourcedConfirmFixture: Extract<Artifact, { type: 'confirm' }> = {
  ...confirmFixture,
  id: 'c-bad',
  action: { ...confirmFixture.action, money: { amount: minor(4500n) } },
};

/** Not a member of the union. Models the malformed turn ADR-0013 anticipates. */
export const unknownTypeFixture = {
  id: 'x1',
  title: 'Something new',
  type: 'holographic-projection',
} as unknown as Artifact;
