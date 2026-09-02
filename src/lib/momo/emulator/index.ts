/**
 * The MoMo emulator (ADR-0009, docs/03 §5).
 *
 * WHY THIS IS NOT OVER-ENGINEERING, AND WHY IT IS NOW LOAD-BEARING:
 *
 *  1. The Collections sandbox was reported down in July 2026 (momoAPIs.md §13),
 *     the single biggest demo-day risk in the project (R1).
 *  2. Live verification on 2026-09-02 found that `REJECTED` and `TIMEOUT` are
 *     UNREACHABLE in the sandbox — both numbers documented for them return
 *     `FAILED` (momoAPIs.md §10). The emulator is therefore the ONLY way to
 *     exercise those two branches. That moves it from demo insurance to a
 *     test-coverage requirement.
 *
 * INTEGRITY COMMITMENT (docs/03 §5): if we present against the emulator, we say
 * so out loud. Pretending an emulator is the live sandbox would be dishonest
 * and, in front of MTN engineers, a losing move.
 *
 * It implements `MomoClient` exactly, reproduces the MEASURED outcome table,
 * and simulates asynchrony faithfully — including the ~25s `CREATED` window on
 * the demo number, which is precisely what the live console exists to show.
 */

import { type EnvBag, readMomoConfig } from '../config';
import { MomoRequestError, upstream } from '../errors';
import { toMomoAmount } from '../currency';
import { assertExternalId, assertReferenceId } from '../client';
import { TEST_MSISDN } from '../test-msisdns';
import type {
  CollectionsApi,
  MomoClient,
  RequestToPayInput,
  RequestToPayResult,
  RequestToPayStatus,
} from '../types';
import type { MomoStatus } from '@/domain/ledger/state-machine';
import { requestToPayStatusBody } from './fixtures';

/** Measured: `46733123454` sits in CREATED for roughly 25 seconds. */
export const ASYNC_SETTLE_MS = 25_000;

/**
 * What a number does over time.
 *
 * `settled === null` means it NEVER settles — which is a real, measured
 * behaviour, not an omission.
 */
export interface EmulatedOutcome {
  /** The status reported before `settleAfterMs` has elapsed. */
  readonly initial: MomoStatus;
  /** The status after it. `null` for a transaction that never resolves. */
  readonly settled: MomoStatus | null;
  readonly settleAfterMs: number;
}

/**
 * The outcome table, **[V] measured against the live sandbox 2026-09-02**
 * (momoAPIs.md §10). Four of the six previously documented outcomes were wrong,
 * which is exactly why they were rated [P] and never coded against.
 *
 * The uncomfortable last line is deliberate: any number NOT on this list settles
 * SUCCESSFUL immediately, so a test written with a made-up number is a test that
 * cannot fail. An emulator kinder than reality teaches the wrong lessons.
 */
export function outcomeFor(msisdn: string, asyncSettleMs = ASYNC_SETTLE_MS): EmulatedOutcome {
  switch (msisdn) {
    case TEST_MSISDN.FAILS_FAST:
    case TEST_MSISDN.ALSO_FAILS: // documented REJECTED; the sandbox returns FAILED
    case TEST_MSISDN.ALSO_FAILS_2: // documented TIMEOUT; the sandbox returns FAILED
      return { initial: 'FAILED', settled: 'FAILED', settleAfterMs: 0 };

    case TEST_MSISDN.STAYS_PENDING:
      // Enters PENDING and stays there. The only way to exercise the stuck
      // transaction sweep and the reconciler's abandon path.
      return { initial: 'PENDING', settled: null, settleAfterMs: Number.POSITIVE_INFINITY };

    case TEST_MSISDN.ASYNC_SUCCESS:
      // THE DEMO PATH: 202 -> CREATED -> (~25s) -> SUCCESSFUL.
      return { initial: 'CREATED', settled: 'SUCCESSFUL', settleAfterMs: asyncSettleMs };

    default:
      return { initial: 'SUCCESSFUL', settled: 'SUCCESSFUL', settleAfterMs: 0 };
  }
}

/**
 * Force an outcome the sandbox cannot produce.
 *
 * `REJECTED` and `TIMEOUT` are modelled but unreachable upstream, so the
 * contract tests for those branches route through here (momoAPIs.md §10
 * consequence 2).
 */
export function forcedOutcome(status: MomoStatus, settleAfterMs = 0): EmulatedOutcome {
  return { initial: settleAfterMs > 0 ? 'CREATED' : status, settled: status, settleAfterMs };
}

interface EmulatedTransaction {
  readonly referenceId: string;
  readonly input: RequestToPayInput;
  readonly acceptedAt: number;
  readonly amount: string;
  readonly currency: string;
}

export interface EmulatorStore {
  get(referenceId: string): EmulatedTransaction | undefined;
  put(txn: EmulatedTransaction): void;
  has(referenceId: string): boolean;
  size(): number;
  reset(): void;
}

export function createEmulatorStore(): EmulatorStore {
  const rows = new Map<string, EmulatedTransaction>();
  return {
    get: (id) => rows.get(id),
    put: (txn) => void rows.set(txn.referenceId, txn),
    has: (id) => rows.has(id),
    size: () => rows.size,
    reset: () => rows.clear(),
  };
}

/**
 * Process-wide store, so a `requestToPay` in one route and a `getStatus` in the
 * reconciler see the same transaction — exactly like the real sandbox.
 */
export const emulatorStore = createEmulatorStore();

export interface EmulatorOptions {
  readonly env?: EnvBag;
  readonly store?: EmulatorStore;
  /** Injectable clock, so tests do not sleep through a 25-second window. */
  readonly now?: () => number;
  /**
   * Per-MSISDN overrides, for the branches the sandbox cannot reach.
   * Use `forcedOutcome('REJECTED')` / `forcedOutcome('TIMEOUT')`.
   */
  readonly outcomes?: Readonly<Record<string, EmulatedOutcome>>;
}

/** Deterministic 0..1 from a reference id — a replayed demo fails identically. */
function seededUnit(referenceId: string): number {
  let hash = 2166136261;
  for (const ch of referenceId) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

export function createEmulatorClient(options: EmulatorOptions = {}): MomoClient {
  const store = options.store ?? emulatorStore;
  const now = options.now ?? Date.now;
  const env = (): EnvBag => options.env ?? process.env;

  /**
   * How long the demo number sits in CREATED. Defaults to the measured ~25s;
   * compressed in CI and, during a live demo, tuned to the length of the
   * sentence being spoken over it.
   */
  const asyncSettleMs = (): number =>
    Number.parseInt(env().MOMO_EMULATOR_LATENCY_MS ?? '', 10) || ASYNC_SETTLE_MS;

  /** 0..1. Injects UPSTREAM 500s so the recovery path is exercised locally. */
  const failRate = (): number => {
    const raw = Number.parseFloat(env().MOMO_EMULATOR_FAIL_RATE ?? '');
    return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0;
  };

  function maybeInjectFailure(referenceId: string): void {
    const rate = failRate();
    if (rate > 0 && seededUnit(referenceId) < rate) {
      throw new MomoRequestError('HTTP', upstream(500, true), 'emulator: injected failure');
    }
  }

  function outcome(msisdn: string): EmulatedOutcome {
    return options.outcomes?.[msisdn] ?? outcomeFor(msisdn, asyncSettleMs());
  }

  const collections: CollectionsApi = {
    async requestToPay(referenceId, input): Promise<RequestToPayResult> {
      const cfg = readMomoConfig(env());
      // The emulator validates exactly what MTN validates. An emulator that
      // accepts a malformed reference id would let a 400 reach us live.
      assertReferenceId(cfg, referenceId);
      assertExternalId(input.externalId);
      maybeInjectFailure(referenceId);

      if (store.has(referenceId)) {
        // Verified upstream behaviour: the same X-Reference-Id posted twice
        // returns 202 then 409, and a 409 is SUCCESS (momoAPIs.md §10).
        return { outcome: 'ALREADY_ACCEPTED', referenceId };
      }

      const money = toMomoAmount(input.amountMinor, cfg.targetEnvironment);
      store.put({
        referenceId,
        input,
        acceptedAt: now(),
        amount: money.amount,
        currency: money.currency,
      });

      // 202 Accepted. The transaction is NOT complete.
      return { outcome: 'ACCEPTED', referenceId };
    },

    async getStatus(referenceId): Promise<RequestToPayStatus> {
      const cfg = readMomoConfig(env());
      assertReferenceId(cfg, referenceId);

      const txn = store.get(referenceId);
      if (!txn) {
        // Unknown reference id — the same 404 the sandbox gives for a request
        // that never landed. This is what tells the reconciler to re-send.
        throw new MomoRequestError('HTTP', upstream(404, false), 'emulator: unknown reference id');
      }

      maybeInjectFailure(`${referenceId}:status`);

      const plan = outcome(txn.input.msisdn);
      const elapsed = now() - txn.acceptedAt;
      const status: MomoStatus =
        plan.settled !== null && elapsed >= plan.settleAfterMs ? plan.settled : plan.initial;

      const raw = requestToPayStatusBody({
        referenceId,
        status,
        amount: txn.amount,
        currency: txn.currency,
        externalId: txn.input.externalId,
        msisdn: txn.input.msisdn,
        payerMessage: txn.input.payerMessage,
        payeeNote: txn.input.payeeNote,
      });

      return {
        referenceId,
        status,
        externalId: txn.input.externalId,
        amount: txn.amount,
        currency: txn.currency,
        ...(typeof raw.financialTransactionId === 'string'
          ? { financialTransactionId: raw.financialTransactionId }
          : {}),
        ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
        raw,
      };
    },
  };

  return { mode: 'emulator', collections };
}
