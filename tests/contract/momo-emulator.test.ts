/**
 * The emulator must be indistinguishable from the sandbox at the interface, and
 * must reproduce the MEASURED outcome table exactly (ADR-0009, momoAPIs.md §10).
 *
 * This file carries more weight than it looks like it should. Live verification
 * on 2026-09-02 found `REJECTED` and `TIMEOUT` to be UNREACHABLE in the sandbox
 * — both numbers documented for them return `FAILED`. The emulator is therefore
 * the ONLY way to exercise those two branches, which moves it from demo
 * insurance to a test-coverage requirement.
 *
 * The uncomfortable behaviour is asserted deliberately: any number NOT on the
 * list settles SUCCESSFUL immediately, which is why a test written with a
 * made-up number is a test that cannot fail.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
  ASYNC_SETTLE_MS,
  createEmulatorClient,
  createEmulatorStore,
  forcedOutcome,
  outcomeFor,
} from '@/lib/momo/emulator';
import { getMomoClient } from '@/lib/momo';
import {
  ALL_TEST_MSISDNS,
  MODELLED_ONLY_STATUSES,
  OBSERVED_STATUSES,
  TEST_MSISDN,
} from '@/lib/momo/test-msisdns';
import { isMomoRequestError } from '@/lib/momo/errors';
import { MOMO_STATUSES } from '@/domain/ledger/state-machine';
import { REFERENCE_ID, TEST_ENV } from './_helpers';

const EMULATOR_ENV = { ...TEST_ENV, MOMO_MODE: 'emulator' };

function input(msisdn: string, externalId = 'fare-1') {
  return {
    amountMinor: 1250n,
    msisdn,
    externalId,
    payerMessage: 'MoMo Kasi taxi fare',
    payeeNote: 'Rank 42 fare',
  };
}

let clock = 0;
let store = createEmulatorStore();

function client(extra: Record<string, unknown> = {}) {
  return createEmulatorClient({ env: EMULATOR_ENV, store, now: () => clock, ...extra });
}

beforeEach(() => {
  clock = 1_000_000;
  store = createEmulatorStore();
});

describe('MOMO_MODE selection', () => {
  test('is read per call, never captured at module load', () => {
    // docs/03 §5 — if the sandbox dies ninety seconds before we present we flip
    // this in the Vercel dashboard and the demo continues, with no redeploy.
    expect(getMomoClient({ env: { ...TEST_ENV, MOMO_MODE: 'emulator' } }).mode).toBe('emulator');
    expect(getMomoClient({ env: { ...TEST_ENV, MOMO_MODE: 'sandbox' } }).mode).toBe('sandbox');
  });

  test('anything other than the literal "emulator" gives the real sandbox', () => {
    // Failing towards the truthful path matters: presenting emulator output as
    // live sandbox output would be dishonest (docs/03 §5).
    expect(getMomoClient({ env: { ...TEST_ENV, MOMO_MODE: 'EMULATOR' } }).mode).toBe('sandbox');
    expect(getMomoClient({ env: { ...TEST_ENV, MOMO_MODE: undefined } }).mode).toBe('sandbox');
  });
});

describe('the VERIFIED test MSISDN table (momoAPIs.md §10)', () => {
  test('46733123450 FAILS immediately — the failure path', async () => {
    const c = client();
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.FAILS_FAST));

    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('FAILED');
  });

  test('46733123451 and 46733123452 also FAIL — documented REJECTED/TIMEOUT are wrong', async () => {
    for (const msisdn of [TEST_MSISDN.ALSO_FAILS, TEST_MSISDN.ALSO_FAILS_2]) {
      store = createEmulatorStore();
      const c = client();
      await c.collections.requestToPay(REFERENCE_ID, input(msisdn));
      expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('FAILED');
    }
  });

  test('46733123453 enters PENDING and STAYS there, past any poll window', async () => {
    const c = client();
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.STAYS_PENDING));

    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('PENDING');

    clock += 40_000; // the measured 40s poll
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('PENDING');

    clock += 24 * 60 * 60 * 1000; // and a day
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('PENDING');
  });

  test('46733123454 goes CREATED -> SUCCESSFUL after ~25s — THE DEMO PATH', async () => {
    const c = client();

    const accepted = await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));
    expect(accepted.outcome).toBe('ACCEPTED');

    // CREATED is not in MTN's documented vocabulary. The sandbox emits it, and
    // a machine that rejects it mishandles the only number that demonstrates
    // asynchronous resolution.
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('CREATED');

    clock += ASYNC_SETTLE_MS - 1;
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('CREATED');

    clock += 2;
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('SUCCESSFUL');
  });

  test('an UNLISTED number always succeeds immediately — reproduced, not softened', async () => {
    expect(outcomeFor('27821234567').settled).toBe('SUCCESSFUL');
    expect(outcomeFor('27821234567').settleAfterMs).toBe(0);
    expect(outcomeFor('').initial).toBe('SUCCESSFUL');
  });

  test('every listed number has a mapping — the table and the code cannot drift', () => {
    expect(ALL_TEST_MSISDNS).toHaveLength(5);
    for (const msisdn of ALL_TEST_MSISDNS) {
      const plan = outcomeFor(msisdn);
      expect(MOMO_STATUSES).toContain(plan.initial);
    }
  });

  test('MOMO_EMULATOR_LATENCY_MS compresses the demo window for CI', async () => {
    const c = createEmulatorClient({
      env: { ...EMULATOR_ENV, MOMO_EMULATOR_LATENCY_MS: '10' },
      store,
      now: () => clock,
    });
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));

    clock += 11;
    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe('SUCCESSFUL');
  });
});

describe('statuses the sandbox cannot reach', () => {
  test.each(MODELLED_ONLY_STATUSES)('%s is exercised through the emulator', async (status) => {
    // momoAPIs.md §10 consequence 2 — REJECTED and TIMEOUT are modelled because
    // production may emit them, but no sandbox number produces them.
    const c = client({ outcomes: { [TEST_MSISDN.ASYNC_SUCCESS]: forcedOutcome(status) } });

    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));

    expect((await c.collections.getStatus(REFERENCE_ID)).status).toBe(status);
  });

  test('the observed and modelled-only sets together cover the terminal vocabulary', () => {
    const all = new Set<string>([...OBSERVED_STATUSES, ...MODELLED_ONLY_STATUSES]);
    for (const status of ['CREATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'REJECTED', 'TIMEOUT']) {
      expect(all.has(status)).toBe(true);
    }
    // Every one of them is a status our own machine knows about.
    for (const status of all) expect(MOMO_STATUSES).toContain(status);
  });
});

describe('response shape', () => {
  test('financialTransactionId appears only on SUCCESSFUL, and is stable', async () => {
    const c = client();
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));

    expect((await c.collections.getStatus(REFERENCE_ID)).financialTransactionId).toBeUndefined();

    clock += ASYNC_SETTLE_MS;
    const first = await c.collections.getStatus(REFERENCE_ID);
    const second = await c.collections.getStatus(REFERENCE_ID);

    expect(first.financialTransactionId).toBeDefined();
    expect(second.financialTransactionId).toBe(first.financialTransactionId);
  });

  test('a FAILED outcome carries a reason', async () => {
    const c = client();
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.FAILS_FAST));

    expect((await c.collections.getStatus(REFERENCE_ID)).reason).toBeDefined();
  });

  test('the amount comes back under the transmitted label, unchanged', async () => {
    const c = client();
    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));

    const status = await c.collections.getStatus(REFERENCE_ID);
    expect(status.amount).toBe('12.50');
  });
});

describe('the emulator validates what MTN validates', () => {
  test('a reused reference id is ALREADY_ACCEPTED — verified 202 then 409', async () => {
    const c = client();

    await c.collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS));
    const second = await c.collections.requestToPay(
      REFERENCE_ID,
      input(TEST_MSISDN.ASYNC_SUCCESS, 'fare-2'),
    );

    expect(second.outcome).toBe('ALREADY_ACCEPTED');
    expect(store.size()).toBe(1);
  });

  test('a non-v4 reference id is refused', async () => {
    await expect(
      client().collections.requestToPay('nope', input(TEST_MSISDN.ASYNC_SUCCESS)),
    ).rejects.toMatchObject({ error: { kind: 'VALIDATION', field: 'referenceId' } });
  });

  test('an externalId with a space is refused', async () => {
    await expect(
      client().collections.requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS, 'fare 1')),
    ).rejects.toMatchObject({ error: { kind: 'VALIDATION', field: 'externalId' } });
  });

  test('an unknown reference id is a 404 — how the reconciler learns a POST never landed', async () => {
    const caught = await client()
      .collections.getStatus(REFERENCE_ID)
      .catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.status).toBe(404);
  });
});

describe('failure injection', () => {
  test('MOMO_EMULATOR_FAIL_RATE=1 injects a retryable 500', async () => {
    const c = createEmulatorClient({
      env: { ...EMULATOR_ENV, MOMO_EMULATOR_FAIL_RATE: '1' },
      store,
      now: () => clock,
    });

    const caught = await c.collections
      .requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS))
      .catch((e: unknown) => e);

    expect(isMomoRequestError(caught) && caught.status).toBe(500);
    expect(isMomoRequestError(caught) && caught.retryable).toBe(true);
  });

  test('failure injection is deterministic — a replayed demo fails identically', async () => {
    const make = () =>
      createEmulatorClient({
        env: { ...EMULATOR_ENV, MOMO_EMULATOR_FAIL_RATE: '0.5' },
        store: createEmulatorStore(),
        now: () => clock,
      });

    const outcomes = await Promise.all(
      [make(), make()].map((c) =>
        c.collections
          .requestToPay(REFERENCE_ID, input(TEST_MSISDN.ASYNC_SUCCESS))
          .then(() => 'ok')
          .catch(() => 'failed'),
      ),
    );

    expect(outcomes[0]).toBe(outcomes[1]);
  });

  test('the default fail rate is zero', async () => {
    const result = await client().collections.requestToPay(
      REFERENCE_ID,
      input(TEST_MSISDN.ASYNC_SUCCESS),
    );
    expect(result.outcome).toBe('ACCEPTED');
  });
});
