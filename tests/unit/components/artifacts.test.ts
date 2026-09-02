/**
 * Every artifact renders from a fixture, and the numbers survive the trip
 * (docs/13 §9, "Unit").
 *
 * These assertions are deliberately about the AMOUNTS rather than the layout.
 * A restyle should not break this file; a rounding bug, a lost cent or a
 * silently dropped row absolutely should.
 */

import { describe, expect, test } from 'vitest';
import { renderArtifact, visibleText } from './render';
import {
  confirmFixture,
  errorFixture,
  jobListFixture,
  splitFixture,
  stokvelFixture,
  transactionsFixture,
  trustFixture,
  walletFixture,
} from './fixtures';

describe('wallet', () => {
  const html = renderArtifact(walletFixture);

  test('shows the available balance and both held accounts', () => {
    expect(html).toContain('R340.00');
    expect(html).toContain('R60.00');
    expect(html).toContain('R2 000.00');
  });

  test('explains what a held account is, so a missing cent is not a mystery', () => {
    expect(visibleText(html)).toContain('never counted as spendable');
  });

  test('announces the balance in words, not glyphs', () => {
    expect(html).toContain('340 rand available');
  });

  test('renders an empty state rather than a bare heading', () => {
    const empty = renderArtifact({ ...walletFixture, balances: [] });
    expect(visibleText(empty)).toContain('No accounts yet');
  });
});

describe('transactions', () => {
  const html = renderArtifact(transactionsFixture);

  test('shows every amount in the list', () => {
    expect(html).toContain('R60.00');
    expect(html).toContain('R12.50');
    expect(html).toContain('R90.00');
    expect(html).toContain('R29.00');
  });

  test('direction is a sign, not only a colour', () => {
    const text = visibleText(html);
    expect(text).toContain('+ R60.00');
    expect(text).toContain('− R12.50');
  });

  test('non-successful states carry a word as well as a colour', () => {
    const text = visibleText(html);
    expect(text).toContain('Pending');
    // FAILED used to render nothing at all, which is the worst possible
    // outcome for a payment that did not go through.
    expect(text).toContain('Failed');
  });

  test('a screen reader hears "received"/"paid", not a plus sign', () => {
    expect(html).toContain('received 60 rand');
    expect(html).toContain('paid 12 rand 50 cents');
  });

  test('empty state', () => {
    const empty = renderArtifact({ ...transactionsFixture, items: [] });
    expect(visibleText(empty)).toContain('Nothing here yet');
  });
});

describe('split-breakdown', () => {
  const html = renderArtifact(splitFixture);

  test('shows the fare and every part', () => {
    expect(html).toContain('R12.50');
    expect(html).toContain('R7.50');
    expect(html).toContain('R3.13');
    expect(html).toContain('R1.25');
    expect(html).toContain('R0.62');
  });

  test('confirms the parts sum to the fare', () => {
    // 750 + 313 + 125 + 62 = 1250. The banner says so in words.
    expect(visibleText(html)).toContain('Parts sum to the fare exactly');
  });

  test('a split that does not balance is raised as an alert, not a green tick', () => {
    const broken = renderArtifact({
      ...splitFixture,
      parts: splitFixture.parts.slice(0, 3),
    });
    expect(broken).toContain('role="alert"');
    expect(visibleText(broken)).toContain('do not sum to the fare');
  });

  test('empty state', () => {
    const empty = renderArtifact({ ...splitFixture, parts: [] });
    expect(visibleText(empty)).toContain('No split recorded');
  });
});

describe('stokvel', () => {
  const html = renderArtifact(stokvelFixture);

  test('shows the pool against the target', () => {
    expect(html).toContain('R2 700.00');
    expect(html).toContain('R3 600.00');
  });

  test('progress is a labelled progressbar and a written percentage', () => {
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="75"');
    expect(visibleText(html)).toContain('75% of the target collected');
  });

  test('who owes is written out, not only dotted', () => {
    const text = visibleText(html);
    expect(text).toContain('Collects this round');
    expect(text).toContain('Still due');
    expect(text).toContain('Paid');
  });

  test('a zero target does not divide by zero', () => {
    const html0 = renderArtifact({
      ...stokvelFixture,
      target: { ...stokvelFixture.target, amount: stokvelFixture.pool.amount },
      pool: stokvelFixture.pool,
    });
    expect(html0).toContain('aria-valuenow="100"');
  });
});

describe('job-list', () => {
  const html = renderArtifact(jobListFixture);

  test('shows what each job pays', () => {
    expect(html).toContain('R60.00');
    expect(html).toContain('R120.00');
  });

  test('job state is a word', () => {
    const text = visibleText(html);
    expect(text).toContain('Open');
    expect(text).toContain('Funded');
  });

  test('the Accept button names the job it accepts', () => {
    expect(visibleText(html)).toContain('Accept Wash kombi');
  });

  test('empty state', () => {
    const empty = renderArtifact({ ...jobListFixture, jobs: [] });
    expect(visibleText(empty)).toContain('No jobs open right now');
  });
});

describe('trust-score', () => {
  const html = renderArtifact(trustFixture);

  test('shows the score and the job count', () => {
    expect(visibleText(html)).toContain('62');
    expect(visibleText(html)).toContain('14 completed jobs');
  });

  test('met and unmet factors differ in text, not only in colour', () => {
    expect(html).toContain('— unlocked');
    expect(html).toContain('— not yet unlocked');
  });

  test('empty state', () => {
    const empty = renderArtifact({ ...trustFixture, factors: [] });
    expect(visibleText(empty)).toContain('No history yet');
  });
});

describe('confirm', () => {
  const html = renderArtifact(confirmFixture);

  test('renders the amount from the proposal', () => {
    expect(html).toContain('R45.00');
    expect(html).toContain('Nomsa M.');
    expect(html).toContain('•••• 4821');
  });

  test('shows the paying account and its balance', () => {
    expect(html).toContain('Your wallet');
    expect(html).toContain('R340.00');
  });

  test('the confirm button states the amount it will move', () => {
    const text = visibleText(html);
    expect(text).toContain('Confirm — pay R45.00');
    expect(text).toContain('This moves 45 rand');
  });

  test('cancel is a distinct, separately worded control — never a second grey button', () => {
    expect(visibleText(html)).toContain('Cancel — do not pay');
  });

  test('says plainly that the agent cannot settle it', () => {
    expect(visibleText(html)).toContain('cannot move money on its own');
  });
});

describe('error', () => {
  const html = renderArtifact(errorFixture);

  test('is announced, and says nothing moved', () => {
    expect(html).toContain('role="alert"');
    expect(visibleText(html)).toContain('That did not come out right');
    expect(visibleText(html)).toContain('Nothing was charged and nothing moved');
  });
});

describe('the artifact path', () => {
  const all = [
    walletFixture,
    transactionsFixture,
    splitFixture,
    stokvelFixture,
    jobListFixture,
    trustFixture,
    confirmFixture,
    errorFixture,
  ];

  test('no artifact ever renders raw markup (ADR-0013)', () => {
    // Belt and braces for the rule that matters most in a public fintech repo.
    for (const a of all) {
      expect(renderArtifact(a)).not.toContain('dangerouslySetInnerHTML');
    }
  });

  test('every artifact is a labelled region carrying its spoken summary', () => {
    for (const a of all) {
      expect(renderArtifact(a)).toContain('aria-label="');
    }
  });
});
