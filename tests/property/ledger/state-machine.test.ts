/**
 * P4 and P5 from docs/04 §3 — the state-machine properties.
 *
 * `src/domain/ledger/state-machine.ts` is pure, which makes this cheap: tens of
 * thousands of generated event sequences run in well under a second. Examples
 * prove a case works; properties prove the CATEGORY works, and the category
 * here is "no sequence of events, in any order, can move money after we have
 * told a user it did not".
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  CLAIMABLE_STATUSES,
  MOMO_STATUSES,
  type MomoEvent,
  type MomoStatus,
  TERMINAL_STATUSES,
  canApply,
  claimableFor,
  isClaimable,
  isTerminal,
  postsLedger,
  reduce,
  targetForObserved,
  transition,
} from '@/domain/ledger/state-machine';
import { OBSERVED_STATUSES } from '@/lib/momo/test-msisdns';

const arbStatus = fc.constantFrom<MomoStatus>(...MOMO_STATUSES);
const arbTerminal = fc.constantFrom<MomoStatus>(...TERMINAL_STATUSES);
const arbClaimable = fc.constantFrom<MomoStatus>(...CLAIMABLE_STATUSES);

const arbEvent: fc.Arbitrary<MomoEvent> = fc.oneof(
  fc.constant<MomoEvent>({ type: 'ACCEPTED' }),
  fc.constant<MomoEvent>({ type: 'ALREADY_ACCEPTED' }),
  fc.constant<MomoEvent>({ type: 'SEND_TIMEOUT' }),
  fc.constant<MomoEvent>({ type: 'SEND_RETRYABLE' }),
  fc.constant<MomoEvent>({ type: 'SEND_REJECTED' }),
  fc.constant<MomoEvent>({ type: 'ABANDONED' }),
  arbStatus.map<MomoEvent>((status) => ({ type: 'OBSERVED', status })),
);

const arbEvents = fc.array(arbEvent, { maxLength: 40 });

describe('P4 — terminal states are absorbing', () => {
  test('no single event moves a transaction out of a terminal state', () => {
    fc.assert(
      fc.property(arbTerminal, arbEvent, (start, event) => {
        expect(transition(start, event)).toBe(start);
      }),
      { numRuns: 5000 },
    );
  });

  test('no SEQUENCE of events moves it out either', () => {
    // The late-callback case, generalised: whatever arrives, in whatever order,
    // a resolved transaction stays resolved (momoAPIs.md §12 rule 1).
    fc.assert(
      fc.property(arbTerminal, arbEvents, (start, events) => {
        expect(reduce(start, events)).toBe(start);
      }),
      { numRuns: 5000 },
    );
  });

  test('once terminal, always terminal — from ANY start', () => {
    fc.assert(
      fc.property(arbStatus, arbEvents, arbEvents, (start, first, rest) => {
        const middle = reduce(start, first);
        if (!isTerminal(middle)) return;
        expect(reduce(middle, rest)).toBe(middle);
      }),
      { numRuns: 5000 },
    );
  });
});

describe('P5 — the machine is deterministic and idempotent', () => {
  test('the same (state, event) always gives the same answer', () => {
    fc.assert(
      fc.property(arbStatus, arbEvent, (state, event) => {
        expect(transition(state, event)).toBe(transition(state, event));
      }),
      { numRuns: 2000 },
    );
  });

  test('applying the same event twice equals applying it once', () => {
    // Resolving N times equals resolving once. This is what makes a replayed
    // webhook harmless at the domain level, before any database guard.
    fc.assert(
      fc.property(arbStatus, arbEvent, (state, event) => {
        const once = transition(state, event);
        expect(transition(once, event)).toBe(once);
      }),
      { numRuns: 5000 },
    );
  });

  test('an OBSERVED event is a function of the observation alone', () => {
    fc.assert(
      fc.property(arbClaimable, arbClaimable, arbStatus, (a, b, observed) => {
        // Whatever claimable state the row is in, an authoritative status means
        // the same thing — which is why `resolveTransaction` needs no prior read.
        const fromA = transition(a, { type: 'OBSERVED', status: observed });
        const fromB = transition(b, { type: 'OBSERVED', status: observed });
        expect(fromA).toBe(fromB);
        expect(fromA).toBe(targetForObserved(observed));
      }),
      { numRuns: 2000 },
    );
  });
});

describe('the machine is total and closed', () => {
  test('every (state, event) pair yields a known status', () => {
    fc.assert(
      fc.property(arbStatus, arbEvents, (start, events) => {
        expect(MOMO_STATUSES).toContain(reduce(start, events));
      }),
      { numRuns: 5000 },
    );
  });

  test('nothing ever returns to INITIATED — a request cannot be un-sent', () => {
    fc.assert(
      fc.property(fc.constantFrom<MomoStatus>('CREATED', 'PENDING'), arbEvents, (start, events) => {
        expect(reduce(start, events)).not.toBe('INITIATED');
      }),
      { numRuns: 5000 },
    );
  });

  test('SEND_RETRYABLE never changes anything — that is what makes the re-send safe', () => {
    fc.assert(
      fc.property(arbStatus, (state) => {
        expect(transition(state, { type: 'SEND_RETRYABLE' })).toBe(state);
      }),
      { numRuns: 500 },
    );
  });

  test('a send failure can never FAIL a transaction MTN already holds', () => {
    // Once we are past INITIATED, MTN owns the outcome. A local error must not
    // be able to declare a payment dead.
    fc.assert(
      fc.property(fc.constantFrom<MomoStatus>('CREATED', 'PENDING'), (state) => {
        expect(transition(state, { type: 'SEND_REJECTED' })).toBe(state);
        expect(transition(state, { type: 'SEND_TIMEOUT' })).not.toBe('FAILED');
      }),
      { numRuns: 500 },
    );
  });
});

describe('the guard and the machine cannot drift', () => {
  test('claimableFor(target) is exactly the set canApply accepts', () => {
    fc.assert(
      fc.property(arbStatus, (target) => {
        const guard = claimableFor(target);
        for (const from of MOMO_STATUSES) {
          expect(guard.includes(from)).toBe(canApply(from, target));
        }
      }),
      { numRuns: 500 },
    );
  });

  test('a terminal target is claimable from every claimable state', () => {
    for (const target of TERMINAL_STATUSES) {
      expect([...claimableFor(target)].sort()).toEqual([...CLAIMABLE_STATUSES].sort());
    }
  });

  test('CREATED is only claimable from INITIATED — no backwards move from PENDING', () => {
    expect(claimableFor('CREATED')).toEqual(['INITIATED']);
    expect(claimableFor('PENDING')).toEqual(['INITIATED', 'CREATED']);
  });

  test('nothing is claimable INTO initiated', () => {
    expect(claimableFor('INITIATED')).toEqual([]);
  });
});

describe('the ledger is written in exactly one place', () => {
  test('postsLedger is true only on the way into SUCCESSFUL from a claimable state', () => {
    fc.assert(
      fc.property(arbStatus, arbStatus, (from, to) => {
        expect(postsLedger(from, to)).toBe(to === 'SUCCESSFUL' && isClaimable(from));
      }),
      { numRuns: 2000 },
    );
  });

  test('a terminal source never posts, whatever the target', () => {
    fc.assert(
      fc.property(arbTerminal, arbStatus, (from, to) => {
        expect(postsLedger(from, to)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('the vocabulary matches what the sandbox actually emits', () => {
  test('every OBSERVED status from live verification is modelled', () => {
    // momoAPIs.md §10 — CREATED was missing until it was measured on
    // 2026-09-02. A machine that rejects it mishandles the demo number.
    for (const status of OBSERVED_STATUSES) {
      expect(MOMO_STATUSES).toContain(status);
    }
    expect(MOMO_STATUSES).toContain('CREATED');
  });

  test('CREATED is non-terminal and claimable, exactly like PENDING', () => {
    expect(isTerminal('CREATED')).toBe(false);
    expect(isClaimable('CREATED')).toBe(true);
  });

  test('a 202 lands in CREATED, which is what MTN reports next', () => {
    expect(transition('INITIATED', { type: 'ACCEPTED' })).toBe('CREATED');
    expect(transition('INITIATED', { type: 'ALREADY_ACCEPTED' })).toBe('CREATED');
  });

  test('the full demo path resolves to SUCCESSFUL and posts exactly once', () => {
    const path: MomoEvent[] = [
      { type: 'ACCEPTED' },
      { type: 'OBSERVED', status: 'CREATED' },
      { type: 'OBSERVED', status: 'CREATED' },
      { type: 'OBSERVED', status: 'SUCCESSFUL' },
    ];

    let state: MomoStatus = 'INITIATED';
    let posts = 0;
    for (const event of path) {
      const next = transition(state, event);
      if (postsLedger(state, next)) posts++;
      state = next;
    }

    expect(state).toBe('SUCCESSFUL');
    expect(posts).toBe(1);
  });
});
