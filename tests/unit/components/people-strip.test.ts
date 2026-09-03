import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeopleStrip } from '@/components/people-strip';
import { parseEnumArray, type Person } from '@/lib/roster';

/**
 * The roster on the opening screen.
 *
 * The fixture below is the ACTUAL shape `GET /api/people` returns, taken from
 * the live endpoint against the seeded `demo_persona` table — not a shape
 * invented to suit the component. A component test whose fixture disagrees
 * with the route is a test of nothing.
 */
const PEOPLE: readonly Person[] = [
  {
    id: '8bbdcae1-6428-4b50-a01f-04a478199124',
    name: 'Mama',
    relation: 'MOTHER',
    supports: [],
    usualMinor: null,
    settlesToOperatorWallet: true,
  },
  {
    id: '59210b11-e5f1-4c00-a8d7-cee8e6248fd5',
    name: 'Baba',
    relation: 'FATHER',
    supports: ['AIRTIME'],
    usualMinor: 5000n,
    settlesToOperatorWallet: true,
  },
  {
    id: 'b3ac4ac4-2afe-4b83-9d28-2f793f029421',
    name: 'Gogo',
    relation: 'GRANDMOTHER',
    supports: ['ELECTRICITY'],
    usualMinor: 20000n,
    settlesToOperatorWallet: true,
  },
  {
    id: '5679adbb-5f91-4e19-bab7-736e94bc6ad0',
    name: 'Sipho — garden',
    relation: 'HELPER',
    supports: ['WAGE'],
    usualMinor: 15000n,
    settlesToOperatorWallet: true,
  },
];

const html = renderToStaticMarkup(createElement(PeopleStrip, { people: PEOPLE }));

describe('the roster renders the people and nothing more', () => {
  it('shows every person and what they are to you', () => {
    for (const name of ['Mama', 'Baba', 'Gogo', 'Sipho']) expect(html).toContain(name);
    expect(html).toContain('Grandmother');
    expect(html).toContain('Helps at home');
  });

  it('labels the amount "usually", never as a total or a balance', () => {
    // The failure this guards is a rename to something like "sent" or "owed".
    // Both would be invented figures — the roster is not linked to a single
    // ledger row — sitting beside real ones (CLAUDE.md #14).
    expect(html).toContain('usually R200.00');
    expect(html).toContain('usually R50.00');
    expect(html).toContain('usually R150.00');
    expect(html).not.toMatch(/\b(sent|owed|paid|balance|total)\b/i);
  });

  it('formats money through formatZAR rather than dividing by 100 in the markup', () => {
    // R200.00, not R200 and not 20000. A bare cents value on screen is the
    // symptom of a component that skipped the money type.
    expect(html).not.toContain('20000');
    expect(html).not.toContain('15000');
  });

  it('says where the money actually goes', () => {
    // Six names imply six wallets. There is one.
    expect(html).toContain('One MTN account in this demo');
    expect(html).toContain('settles to your own wallet');
  });

  it('drops the claim if a row ever stops settling to the operator wallet', () => {
    // Driven by the data, not by a hardcoded sentence that would outlive the
    // fact. When a real payee is added, the line must disappear on its own.
    const mixed = PEOPLE.map((p, i) => (i === 0 ? { ...p, settlesToOperatorWallet: false } : p));
    const out = renderToStaticMarkup(createElement(PeopleStrip, { people: mixed }));
    expect(out).not.toContain('One MTN account in this demo');
  });

  it('renders nothing at all when the roster is empty', () => {
    // The database being unreachable must leave a gap, not a placeholder family.
    expect(renderToStaticMarkup(createElement(PeopleStrip, { people: [] }))).toBe('');
  });

  it('shows no support line for family who are not supported', () => {
    const onlyMama = renderToStaticMarkup(createElement(PeopleStrip, { people: [PEOPLE[0]!] }));
    expect(onlyMama).toContain('Mama');
    expect(onlyMama).not.toContain('usually');
  });
});

describe('the custom enum array Postgres actually returns', () => {
  it('parses the raw literal, because pg has no parser for support_kind[]', () => {
    // node-pg parses text[] but NOT an array of a custom enum — it hands back
    // the string Postgres printed. `.map()` on that throws, which is how this
    // was found, in the seed script, at runtime.
    expect(parseEnumArray('{AIRTIME}')).toEqual(['AIRTIME']);
    expect(parseEnumArray('{ELECTRICITY,AIRTIME}')).toEqual(['ELECTRICITY', 'AIRTIME']);
  });

  it('treats an empty array as empty rather than as one blank entry', () => {
    // `'{}'.replace(...).split(',')` yields [''] — one empty string, which
    // renders as a support kind with no name. This is the case that bites.
    expect(parseEnumArray('{}')).toEqual([]);
  });

  it('passes a real array through, and survives null', () => {
    expect(parseEnumArray(['WAGE'])).toEqual(['WAGE']);
    expect(parseEnumArray(null)).toEqual([]);
    expect(parseEnumArray(undefined)).toEqual([]);
  });
});
