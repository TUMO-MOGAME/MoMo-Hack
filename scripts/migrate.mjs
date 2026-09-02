#!/usr/bin/env node
/**
 * Apply `supabase/migrations/*.sql` to the database in `DATABASE_URL`.
 *
 *   npm run db:migrate           apply anything outstanding
 *   npm run db:migrate -- --dry  say what would run, touch nothing
 *
 * F5. Deliberately about eighty lines of logic rather than the Supabase CLI:
 * the CLI wants Docker for local development and a linked project for remote,
 * and we need neither. All we require is "run these files, in order, once".
 *
 * THE THREE RULES THIS ENFORCES, because CLAUDE.md #4 says migrations are
 * forward-only and immutable once merged:
 *
 *   1. Ordered by filename. `0000_` before `0001_`, always.
 *   2. Applied exactly once, recorded in `schema_migration`.
 *   3. **Checksummed.** If a file's contents changed after it was applied, this
 *      REFUSES to continue. Editing an applied migration is the mistake rule 4
 *      exists to prevent, and a runner that silently ignores the edit lets the
 *      database and the repository disagree forever — the worst possible
 *      outcome, because nothing tells you.
 *
 * Each file runs inside a transaction, so a failure half way through leaves
 * nothing behind. Postgres does DDL transactionally, which is the whole reason
 * this can be simple.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { findEnvFile, loadEnv, colour } from './_env.mjs';

const { g, r, y, d, b } = colour;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(root, 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry');

// DATABASE_URL may be in the environment (CI) or in .env.local (a laptop).
let url = process.env.DATABASE_URL;
if (!url && findEnvFile()) {
  const { env } = loadEnv();
  url = env.DATABASE_URL;
}
if (!url) {
  console.error(
    `\n  ${r('✖')} DATABASE_URL is not set.\n\n` +
      `  Supabase dashboard -> Project Settings -> Database -> Connection string\n` +
      `  Take the ${b('Session pooler')} URI and put it in .env.local as DATABASE_URL.\n` +
      `  It is the one that works from a laptop and from Vercel, over IPv4.\n`,
  );
  process.exit(1);
}

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error(`\n  ${r('✖')} No .sql files in supabase/migrations.\n`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log(`\n  ${b('Migrations')}  ${d(DIR)}\n`);

try {
  await client.query(`
    create table if not exists schema_migration (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query('select name, checksum from schema_migration');
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));

  let ran = 0;

  for (const name of files) {
    const sql = readFileSync(join(DIR, name), 'utf8');
    const checksum = sha(sql);
    const previous = applied.get(name);

    if (previous === checksum) {
      console.log(`  ${d('·')} ${name.padEnd(28)} ${d('already applied')}`);
      continue;
    }

    if (previous !== undefined) {
      // CLAUDE.md #4. Refuse, loudly, and say what to do instead.
      console.error(
        `\n  ${r('✖')} ${name} has CHANGED since it was applied.\n\n` +
          `      applied checksum  ${previous}\n` +
          `      file checksum     ${checksum}\n\n` +
          `  Migrations are forward-only and immutable once merged (CLAUDE.md #4).\n` +
          `  Add a NEW migration that alters what this one created. Do not edit it.\n`,
      );
      process.exit(1);
    }

    if (dryRun) {
      console.log(`  ${y('→')} ${name.padEnd(28)} ${y('would apply')} ${d(checksum)}`);
      ran++;
      continue;
    }

    process.stdout.write(`  ${y('→')} ${name.padEnd(28)} applying…`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('insert into schema_migration (name, checksum) values ($1, $2)', [
        name,
        checksum,
      ]);
      await client.query('COMMIT');
      process.stdout.write(
        `\r  ${g('✓')} ${name.padEnd(28)} ${g('applied')}      ${d(checksum)}\n`,
      );
      ran++;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      process.stdout.write(`\r  ${r('✖')} ${name.padEnd(28)} ${r('failed')}\n\n`);
      console.error(`      ${error.message}\n`);
      console.error(`  Nothing was applied from this file — the transaction rolled back.\n`);
      process.exit(1);
    }
  }

  console.log(
    ran === 0
      ? `\n  ${g('✓')} Database is up to date. ${d(`${files.length} migration(s) on record.`)}\n`
      : `\n  ${g('✓')} ${ran} migration(s) ${dryRun ? 'would be applied' : 'applied'}.\n`,
  );
} finally {
  await client.end();
}
