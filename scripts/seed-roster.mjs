#!/usr/bin/env node
/**
 * Seed the demo roster — the people this demo actually pays.
 *
 *   npm run seed:roster            # insert or update, idempotent
 *   npm run seed:roster -- --show  # print what is there, change nothing
 *
 * IDEMPOTENT BY RELATION. `demo_persona` has a unique index on `relation`, so
 * this upserts rather than appending. Running it twice leaves six rows, not
 * twelve — which matters because the obvious way to "fix" a roster on a demo
 * morning is to run the seed again, and a seed that duplicates on the second
 * run is a seed that breaks precisely when it is used in anger
 * (`MISTAKES.md` M9: a rolled-back suite proves the first use of everything
 * and the second use of nothing).
 *
 * It NEVER touches the ledger, `momo_transaction`, or any balance. It writes
 * six rows to one table that holds no money.
 */

import pg from 'pg';
import { loadEnv, colour } from './_env.mjs';

const { env, path } = loadEnv();
const { g: G, d: D, b: B, y: Y } = colour;

/**
 * The roster.
 *
 * `usual_minor` is in CENTS and is a bigint in the database (CLAUDE.md #1).
 * The amounts are what a person in Katlehong actually sends, not round numbers
 * chosen to look tidy on a slide: R150 for a day's garden work, R200 of
 * electricity for a grandmother, R50 of airtime for a father.
 *
 * The sister holds no `supports` on purpose. A roster in which every row is a
 * payee is a payments list wearing a family's clothes — and the product's
 * claim is that it holds your PEOPLE, some of whom you support.
 */
const ROSTER = [
  { display_name: 'Mama', relation: 'MOTHER', supports: [], usual_minor: null, sort_order: 1 },
  {
    display_name: 'Baba',
    relation: 'FATHER',
    supports: ['AIRTIME'],
    usual_minor: 5000n,
    sort_order: 2,
  },
  {
    display_name: 'Gogo',
    relation: 'GRANDMOTHER',
    supports: ['ELECTRICITY'],
    usual_minor: 20000n,
    sort_order: 3,
  },
  {
    display_name: 'Mkhulu',
    relation: 'GRANDFATHER',
    supports: [],
    usual_minor: null,
    sort_order: 4,
  },
  { display_name: 'Sisi', relation: 'SISTER', supports: [], usual_minor: null, sort_order: 5 },
  {
    display_name: 'Sipho — garden',
    relation: 'HELPER',
    supports: ['WAGE'],
    usual_minor: 15000n,
    sort_order: 6,
  },
];

if (!env.DATABASE_URL) {
  console.error('  DATABASE_URL is not set. Looked in', path);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const showOnly = process.argv.includes('--show');

if (!showOnly) {
  for (const p of ROSTER) {
    await client.query(
      `insert into demo_persona
         (display_name, relation, supports, usual_minor, sort_order)
       values ($1, $2, $3::support_kind[], $4, $5)
       on conflict (relation) do update set
         display_name = excluded.display_name,
         supports     = excluded.supports,
         usual_minor  = excluded.usual_minor,
         sort_order   = excluded.sort_order`,
      [
        p.display_name,
        p.relation,
        p.supports,
        // bigint goes over the wire as a STRING. Passing a JS number here is
        // how a cents column quietly becomes a float somewhere downstream.
        p.usual_minor === null ? null : String(p.usual_minor),
        p.sort_order,
      ],
    );
  }
}

const { rows } = await client.query(
  `select display_name, relation, supports, usual_minor, settles_to_operator_wallet
     from demo_persona order by sort_order`,
);

/**
 * `supports` comes back as the raw literal `{AIRTIME,WAGE}`, not an array.
 *
 * node-pg parses `text[]` for you, but this column is `support_kind[]` — an
 * array of a CUSTOM ENUM — and pg has no registered parser for that type's
 * OID, so it hands back the string Postgres printed. Calling `.join()` on it
 * throws, which is how this was found. Parsed here rather than cast in SQL so
 * the column keeps its type; the API route does the same thing for the same
 * reason.
 */
function pgEnumArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const inner = value.replace(/^\{|\}$/g, '');
  return inner === '' ? [] : inner.split(',');
}

console.log(`\n  ${B('Demo roster')}  ${D(path)}\n`);
for (const r of rows) {
  const amount =
    r.usual_minor === null ? D('—') : `R${(Number(r.usual_minor) / 100).toFixed(2).padStart(7)}`;
  const list = pgEnumArray(r.supports);
  const supports = list.length ? list.join(', ') : D('not supported');
  console.log(
    `  ${G('·')} ${r.display_name.padEnd(16)} ${r.relation.padEnd(12)} ${amount}  ${supports}`,
  );
}

const wrong = rows.filter((r) => r.settles_to_operator_wallet !== true);
console.log(
  wrong.length === 0
    ? `\n  ${G('✓')} ${rows.length} people. Every payout settles to the operator's own wallet, and every row says so.\n`
    : `\n  ${Y('!')} ${wrong.length} row(s) claim to settle somewhere other than the operator's wallet. There is only one wallet.\n`,
);

await client.end();
process.exit(wrong.length === 0 ? 0 : 1);
