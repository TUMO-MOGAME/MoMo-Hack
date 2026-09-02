# 04 — Testing Strategy

## 1. What we are actually defending against

Generic test coverage is not the goal. This is a money system, and money systems fail in specific,
well-known ways. Each test type below exists to close a named failure mode.

| Failure mode | Defended by |
|---|---|
| A split loses or invents a cent | Property tests on the split algorithm (§3) |
| A ledger stops balancing | DB constraint + property tests + the load test's final assertion |
| A webhook replay pays someone twice | Integration tests on the guarded transition (§4) |
| A user reads another user's wallet | RLS policy tests, allow **and** deny (§5) |
| MoMo returns something we did not anticipate | Contract tests against recorded responses (§6) |
| Concurrency corrupts balances under load | Load test that asserts correctness, not latency (§8) |
| A migration breaks staging | Migration replay tests (§7) |
| A secret reaches the public repo | Secret scanning in CI (§10) |
| The demo path breaks the day before | E2E critical path, run on every PR (§9) |

## 2. The shape

```
                 /\
                /  \        E2E  (Playwright)            ~12 specs
               /____\       critical path + demo script
              /      \
             /        \     Integration (real Postgres)  ~60 tests
            /__________\    RLS, repositories, routes, webhooks
           /            \
          /              \  Contract  (MSW + fixtures)   ~25 tests
         /________________\ every MoMo response shape we handle
        /                  \
       /                    \ Property (fast-check)      ~15 properties
      /______________________\ money invariants, state machines
     /                        \
    /                          \ Unit (Vitest)           ~150 tests
   /____________________________\ pure domain logic

   Plus, off to the side and just as important:
   Load (k6) · Chaos · Security · Accessibility · Visual · Smoke
```

**Tooling, all free:** Vitest, fast-check, Playwright, MSW, k6 (OSS), axe-core, gitleaks,
`supabase start` for a real local Postgres. No paid SaaS anywhere.

---

## 3. Property-based tests — the ones that matter most

`src/domain` is pure, which makes this cheap. These are the tests we show a technical judge.

```ts
import fc from 'fast-check';

// P1 — a split never creates or destroys value
test('split parts always sum to the input', () => {
  fc.assert(fc.property(
    fc.bigInt({ min: 1n, max: 100_000_000n }),
    fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 2, maxLength: 8 }),
    (amount, rawBps) => {
      const bps = normaliseToTenThousand(rawBps);
      const parts = split(amount, bps);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(amount);   // exact, always
      expect(parts.every(p => p >= 0n)).toBe(true);             // no negative shares
    },
  ), { numRuns: 5000 });
});

// P2 — a split is deterministic
test('the same input always produces the same split', () => { /* ... */ });

// P3 — every journal balances, whatever sequence of operations produced it
test('any sequence of domain operations leaves the ledger balanced', () => {
  fc.assert(fc.property(fc.array(arbitraryOperation(), { maxLength: 40 }), ops => {
    const ledger = ops.reduce(applyOperation, emptyLedger());
    expect(sumAll(ledger)).toBe(0n);
  }));
});

// P4 — terminal states are absorbing
test('no event can move a transaction out of a terminal state', () => {
  fc.assert(fc.property(terminalState(), fc.array(anyEvent()), (start, events) => {
    expect(events.reduce(transition, start)).toBe(start);
  }));
});

// P5 — resolution is idempotent
test('resolving N times equals resolving once', () => { /* ... */ });

// P6 — no account that forbids it ever goes negative
// P7 — escrow release + refund can never both succeed for the same job
// P8 — trust score is monotonic in completed jobs
```

**Rule: any function that touches money gets a property test before it gets a unit test.**
Examples prove a case works. Properties prove the *category* works. For split arithmetic, 5,000
generated cases in 200ms beats any number of hand-written examples.

---

## 4. Integration tests

Run against a real Postgres (`supabase start`), not a mock. Each test gets a transaction that is
rolled back, so the suite is order-independent and parallel-safe.

Coverage required:
- **Repositories** — every query, including the empty and the not-found case.
- **Guarded transitions** — the concurrency heart of the system:

```ts
test('two concurrent resolvers produce exactly one journal', async () => {
  const id = await seedPendingTransaction({ amountMinor: 1250n });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveTransaction(id, 'SUCCESSFUL')),
  );

  expect(results.filter(r => r.applied)).toHaveLength(1);   // exactly one winner
  expect(await countJournals(id)).toBe(1);
  expect(await ledgerSum()).toBe(0n);
});
```

- **Webhook handlers** — same payload delivered 5x, out of order, and after a terminal state.
- **Cron routes** — with a wrong `CRON_SECRET` (must 401), and a right one.
- **Outbox** — a message is delivered once even when the transaction is resolved twice.

---

## 5. RLS policy tests

Every row in the policy matrix (`docs/02` §4) gets a test asserting **both** directions. A policy
test that only checks the allow case is worse than none, because it creates false confidence.

```ts
describe('stokvel visibility', () => {
  test('a member can read their stokvel', async () => {
    const c = clientAs(member);
    expect((await c.from('stokvel').select().eq('id', s.id)).data).toHaveLength(1);
  });

  test('a non-member cannot read it', async () => {          // the test that matters
    const c = clientAs(stranger);
    expect((await c.from('stokvel').select().eq('id', s.id)).data).toHaveLength(0);
  });

  test('anon cannot read it', async () => { /* ... */ });
});

test('no authenticated client can write to the ledger', async () => {
  const c = clientAs(anyUser);
  const { error } = await c.from('ledger_entry').insert({ /* ... */ });
  expect(error).toBeTruthy();                                  // RLS must refuse
});
```

**A gate, not a guideline:** CI counts `create policy` statements in `supabase/migrations/**` and
fails if any policy name lacks a matching test. Adding a policy without a test cannot merge.

---

## 6. Contract tests

We do not control MoMo, so we test that *we* behave correctly against every response shape we claim
to handle. Fixtures are recorded from the real sandbox (`npm run momo:record`), never hand-written.

Matrix — every row is a test:

| Endpoint | 202 | 200 SUCCESSFUL | 200 FAILED | 200 PENDING | 400 | 401 | 409 | 429 | 500 | timeout | malformed JSON |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `requesttopay` | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `requesttopay/{id}` | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `transfer` | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transfer/{id}` | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `token/` | — | ✓ | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |

Specific behaviours asserted:
- `401` refreshes the token and retries **exactly once**.
- `409` marks `PENDING`, does **not** generate a new reference id, does **not** fail the transaction.
- `5xx` and timeouts leave the row recoverable, never `FAILED`.
- Malformed JSON does not crash the route.

**The lint rule that keeps these honest:** test files may only use MSISDNs from
`src/lib/momo/test-msisdns.ts`. Since any unlisted number always returns `SUCCESSFUL`
(`momoAPIs.md` §10), a test using a random number is a test that cannot fail.

---

## 7. Migration tests

```
M1  Every migration applies to an empty database, in order.          (supabase db reset)
M2  Every migration applies on top of the current staging schema.    (schema dump replay)
M3  Generated types match the migrations.                            (gen types + git diff)
M4  Seed data loads and is idempotent.                               (run it twice)
M5  Every invariant trigger actually fires.                          (deliberately try to violate it)
```

M5 is the interesting one — a constraint nobody has tried to break is a constraint that might not work:

```ts
test('the database refuses an unbalanced journal', async () => {
  await expect(
    db.transaction(async tx => {
      const j = await tx.journal.create({ kind: 'TEST' });
      await tx.ledgerEntry.create({ journalId: j.id, accountId: a, amount: 100n });
      // deliberately no matching credit
    }),
  ).rejects.toThrow(/does not balance/);
});
```

---

## 8. Load and concurrency

k6, run locally against a preview deployment. **The pass criterion is correctness, not latency.**

```js
// tests/load/fare-storm.js
export const options = { vus: 50, iterations: 500 };
export default function () {
  http.post(`${BASE}/api/momo/collections`, JSON.stringify({
    qrToken: __ENV.QR, amountMinor: 1250,
  }), { headers: { 'Content-Type': 'application/json' } });
}
export function teardown() {
  const r = http.get(`${BASE}/api/debug/ledger-integrity`);
  check(r, {
    'ledger balances to zero': b => b.json('sum') === 0,
    'exactly 500 journals':    b => b.json('journalCount') === 500,
    'rounding account empty':  b => b.json('roundingBalance') === 0,
  });
}
```

Three thresholds:
- **Correctness (blocking):** ledger sums to zero, one journal per fare, no orphan escrow.
- **Latency (informational):** p95 initiation under 2s. We are on a free tier; we report, not gate.
- **Free-tier safety:** the run must not exceed 10% of the monthly Supabase egress budget.

Run this at least twice: once at M2 (money engine complete) and once during freeze week. It is also
the slide that answers "did you think about scale?"

---

## 9. E2E

Playwright, Chromium only (free minutes are generous but not infinite). Two suites:

**`e2e/critical/` — runs on every PR, must be green to merge (~4 min):**
1. Commuter scans a fare QR, pays, sees the split appear in the rank ledger.
2. Client posts a job, worker accepts, escrow funds, proof uploads, client approves, worker is paid.
3. Stokvel contribution collects and the rotating payout lands with the right member.
4. Electricity purchase issues a token.
5. A user cannot see another user's wallet (the security path, through the real UI).

**`e2e/full/` — runs nightly and before freeze (~15 min):**
6. Telegram bot: the whole loop through a stubbed Bot API server.
7. USSD: the whole loop through the simulator.
8. Offline: go offline, capture a fare, come back online, it settles.
9. Remittance funds a locked sub-wallet; spending it outside the allowed category is refused.
10. Live console reflects a payment within 2 seconds.
11. Accessibility sweep (axe) over every route: zero serious or critical violations.
12. The demo script, start to finish, exactly as scripted in `docs/08`.

> **Spec 12 is the insurance policy.** The demo runbook is executable. If a change breaks the demo,
> CI tells us on the PR that broke it, not at 09:00 on submission day.

---

## 10. Security testing

| Check | Tool | When |
|---|---|---|
| Secret scanning | `gitleaks` | Every PR + pre-commit hook |
| Dependency vulnerabilities | `npm audit --audit-level=high` | Every PR |
| Static analysis | CodeQL (free on public repos) | Push to `main` + weekly |
| Dependency updates | Dependabot (free) | Weekly |
| Authorization matrix | Custom test | Every PR |
| Webhook auth | Contract tests | Every PR |
| `NEXT_PUBLIC_` leak check | ESLint rule | Every PR |

The authorization matrix test enumerates every route under `app/api/**` and asserts each one
rejects an unauthenticated request, unless it is on an explicit allowlist. A new route is
**denied by default** — you have to consciously add it to the allowlist, in a PR someone reads.

```ts
const PUBLIC_ROUTES = ['/api/health', '/api/momo/callback/[kind]', '/api/telegram/webhook', '/api/ussd'];

test.each(allApiRoutes())('%s rejects anonymous access', async route => {
  if (PUBLIC_ROUTES.includes(route)) return;
  expect((await fetch(route, { method: 'POST' })).status).toBeGreaterThanOrEqual(401);
});
```

Also run `/security-review` before freeze.

---

## 11. Accessibility

Judges score design. A demo that fails on a judge's phone loses points that have nothing to do with
the idea.

- axe-core in the E2E suite, zero serious/critical violations.
- Every interactive element reachable by keyboard.
- Contrast ratio ≥ 4.5:1 — assume a cracked screen in direct Highveld sun.
- Touch targets ≥ 44px.
- Works at 320px wide.
- Tested throttled to Slow 3G. If the first paint takes more than 3s on Slow 3G, it is a bug.

---

## 12. The quality gate

`main` cannot be merged into unless **all** of these pass:

```
1.  typecheck            tsc --noEmit
2.  lint                 eslint + prettier check
3.  unit + property      vitest run --coverage
4.  contract             vitest run tests/contract
5.  integration + RLS    vitest run tests/integration   (real Postgres in the runner)
6.  migrations           db reset + replay + type-drift check
7.  build                next build
8.  e2e:critical         playwright test e2e/critical
9.  gitleaks             no secrets
10. npm audit            no high or critical
11. STATUS.md changed    the PR must move the status board
```

Coverage thresholds — deliberately uneven, because uniform coverage targets waste effort:

| Path | Line coverage | Rationale |
|---|---|---|
| `src/domain/**` | **95%** | Pure, cheap to test, and it is the money |
| `src/server/**` | 85% | I/O boundaries, mostly integration-tested |
| `src/lib/momo/**` | 90% | Third-party edge, must handle every shape |
| `app/api/**` | 80% | Thin orchestration |
| `app/(app)/**` | none | Covered by E2E; unit-testing React here is low value |

Local shortcut: `npm run verify` runs 1-7 (skipping E2E) in about 90 seconds.

---

## 13. What we deliberately do not test

Stated so it is a decision, not an oversight:

- **Third-party availability.** We do not test that MoMo is up. We test that we survive it being down.
- **The Telegram Bot API itself.** Stubbed. We test our handlers.
- **Visual pixel regression.** Costs more than it returns in 25 days. We do manual review plus axe.
- **Cross-browser.** Chromium only. Noted as a known limitation.
- **Real device testing** beyond a manual pass on Tumo's phone before freeze.

---

## 14. Test data

- `supabase/seed.sql` builds the demo world: one rank, three vehicles, six workers, two stokvels,
  ~200 historical transactions so the dashboards look inhabited rather than empty.
- Seeded and deterministic — the same command yields the same world every time.
- `npm run demo:reset` restores it in under 10 seconds. Rehearse this; you will need it live.
- Every seeded MSISDN comes from the sandbox test table, so the demo's outcomes are chosen, not lucky.
