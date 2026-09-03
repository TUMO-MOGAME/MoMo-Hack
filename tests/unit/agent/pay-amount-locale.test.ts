/**
 * `/pay 0,20` IS TWENTY CENTS.
 *
 * South Africa writes the decimal separator as a comma. It is the SI convention,
 * it is what Afrikaans uses, and it is what an Android numeric keypad set to
 * `af-ZA` or `zu-ZA` puts under the thumb. `parsePayAmount` only accepted a dot,
 * so a correctly written amount returned `null` and the user was told *"Tell me
 * how much — like /pay 0.20"*.
 *
 * ── WHY THIS SITS IN THE LANGUAGE WORK AND NOT IN A PARSER TICKET ────────────
 *
 * It is the language audit reaching the money path, and it is the shape the
 * whole feature is about: the prompt layer was taught eleven languages while the
 * deterministic layer underneath it understood one number format. It failed
 * closed and it failed politely, which is the combination nobody reports — the
 * user assumes they typed it wrong.
 *
 * A separate file from `pay-command.test.ts` on purpose: that file owns the
 * command's behaviour, this one owns the property that an amount written the
 * South African way is an amount.
 */

import { describe, expect, test } from 'vitest';
import { parsePayAmount } from '@/server/momo/demo-collect';

describe('an amount written the South African way is an amount', () => {
  test.each([
    ['0,20', 20n],
    ['0.20', 20n],
    ['R0,20', 20n],
    ['r1,00', 100n],
    ['1,5', 150n],
    ['12,50', 1250n],
    ['12.50', 1250n],
  ])('%j parses to %s cents', (text, expected) => {
    expect(parsePayAmount(text)).toBe(expected);
  });

  test('the comma and the dot agree, cent for cent', () => {
    // The point is not that both parse. It is that they parse to the SAME
    // bigint — a locale difference that changed the amount would be far worse
    // than one that rejected it.
    expect(parsePayAmount('0,20')).toBe(parsePayAmount('0.20'));
    expect(parsePayAmount('12,50')).toBe(parsePayAmount('12.50'));
  });
});

describe('accepting a comma introduces no ambiguity', () => {
  test('a thousands separator is still refused', () => {
    // "1,250" is one thousand two hundred and fifty in English and one point
    // two five in Afrikaans. There is no reading of that which is safe to guess
    // at, and this is real money — so it stays `null` and the user gets the
    // hint. A thousands group always has exactly three digits; the pattern
    // allows at most two, so this is closed by construction rather than by a
    // rule someone has to remember.
    expect(parsePayAmount('1,250')).toBeNull();
    expect(parsePayAmount('1.250')).toBeNull();
  });

  test('a second token is still a refusal, not something to interpret', () => {
    // The guard that made "/pay 0.20 300" refuse rather than charge R3.00 must
    // not have been widened by allowing another separator.
    expect(parsePayAmount('0,20 0767221345')).toBeNull();
    expect(parsePayAmount('0,20 300')).toBeNull();
  });

  test('a bare comma or a lone separator is not an amount', () => {
    for (const text of [',', ',20', '0,', 'R,', '0,,20']) {
      expect(parsePayAmount(text), `${text} parsed as an amount`).toBeNull();
    }
  });
});
