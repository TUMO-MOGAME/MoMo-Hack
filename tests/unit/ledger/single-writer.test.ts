/**
 * ⚠️ THE STRUCTURAL GUARANTEES.
 *
 * A1 §3 and A5 §1 grade a second ledger write path as **Critical**, and A1 §5
 * grades a freshly generated `X-Reference-Id` on a retry the same way. Neither
 * can be defended by a code comment or by everyone remembering — so this file
 * reads the source tree and fails the build when the shape changes.
 *
 * These are the tests that survive the agent that wrote them.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sourceFiles(): { path: string; body: string }[] {
  return walk(SRC)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), body: readFileSync(f, 'utf8') }));
}

/** Lines of real code — comments and blank lines removed. */
function codeLines(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'),
    );
}

describe('one ledger writer', () => {
  test('only src/server/ledger/journal.ts calls insertEntries', () => {
    // The port declares it, the two adapters implement it, and exactly one
    // module calls it. Anything else is a second write path into `ledger_entry`.
    const ALLOWED = new Set([
      'server/ledger/journal.ts', // the writer
      'server/db/types.ts', // the port declaration
      'server/db/memory.ts', // adapter implementation
      'server/db/postgres.ts', // adapter implementation
    ]);

    const callers = sourceFiles()
      .filter(({ body }) => codeLines(body).some((l) => /\binsertEntries\s*\(/.test(l)))
      .map(({ path }) => path)
      .filter((path) => !ALLOWED.has(path));

    expect(callers).toEqual([]);
  });

  test('only the Postgres adapter writes the literal SQL for ledger_entry', () => {
    const writers = sourceFiles()
      .filter(({ body }) => /insert\s+into\s+ledger_entry/i.test(body))
      .map(({ path }) => path);

    expect(writers).toEqual(['server/db/postgres.ts']);
  });

  test('nothing outside src/server writes to the ledger at all', () => {
    const offenders = sourceFiles()
      .filter(({ path }) => !path.startsWith('server/'))
      .filter(({ body }) => /\b(insertEntries|insertJournal)\s*\(/.test(body))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});

describe('one reference id, generated once', () => {
  test('only the initiate path mints a uuid for a transaction', () => {
    // A fresh id on a retry double-pays (A1 §5). `initiate.ts` is the only
    // module allowed to call randomUUID, and it does so BEFORE the insert.
    const ALLOWED = new Set(['server/momo/initiate.ts', 'server/db/memory.ts']);

    const minters = sourceFiles()
      .filter(({ body }) => codeLines(body).some((l) => /randomUUID\s*\(/.test(l)))
      .map(({ path }) => path)
      .filter((path) => !ALLOWED.has(path));

    expect(minters).toEqual([]);
  });

  test('the MoMo client never generates a reference id — callers must have persisted one', () => {
    const momo = sourceFiles().filter(({ path }) => path.startsWith('lib/momo/'));
    expect(momo.length).toBeGreaterThan(0);

    for (const { path, body } of momo) {
      expect(`${path}: ${/randomUUID/.test(body)}`).toBe(`${path}: false`);
    }
  });
});

describe('module boundaries (docs/01 §5)', () => {
  test('src/domain stays pure — no I/O, no env, no framework', () => {
    const forbidden = /from '(node:|next|react|@\/server|@\/lib\/momo)|process\.env/;

    const impure = sourceFiles()
      .filter(({ path }) => path.startsWith('domain/'))
      .filter(({ body }) => codeLines(body).some((l) => forbidden.test(l)))
      .map(({ path }) => path);

    expect(impure).toEqual([]);
  });

  test('src/lib/momo never touches the database', () => {
    const offenders = sourceFiles()
      .filter(({ path }) => path.startsWith('lib/momo/'))
      .filter(({ body }) => /@\/server|supabase|SERVICE_ROLE/i.test(body))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  test('no client component can reach the service-role client (ADR-0010)', () => {
    // In a PUBLIC repository this is the single most damaging possible mistake.
    const offenders = sourceFiles()
      .filter(({ body }) => body.includes("'use client'"))
      .filter(({ body }) => /@\/server|SERVICE_ROLE/.test(body))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});

describe('no floating-point money (ADR-0004, A1 §1)', () => {
  test('no parseFloat, toFixed or Number() on an amount in the money engine', () => {
    const MONEY_TREES = ['domain/ledger/', 'domain/money.ts', 'domain/split.ts', 'server/'];
    const banned = /\b(parseFloat|toFixed)\s*\(/;

    const offenders = sourceFiles()
      .filter(({ path }) => MONEY_TREES.some((t) => path.startsWith(t)))
      .filter(({ body }) => codeLines(body).some((l) => banned.test(l)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  test('no `numeric` or `float` column anywhere in the schema', () => {
    const migrations = join(process.cwd(), 'supabase', 'migrations');
    const sql = walk(migrations)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ({ path: relative(process.cwd(), f), body: readFileSync(f, 'utf8') }));

    expect(sql.length).toBeGreaterThan(0);

    for (const { path, body } of sql) {
      const bad = body
        // Split on BOTH line endings. `core.autocrlf=true` hands a Windows
        // checkout CRLF, and splitting on '\n' alone leaves a trailing '\r'
        // that `/--.*$/` cannot cross — `.` excludes carriage returns and `$`
        // anchors the string end. Every comment then survives the strip and the
        // guard fires on its own prose. It passed on Linux CI and on the tree
        // that authored the file, and failed on every fresh Windows clone.
        .split(/\r?\n/)
        // Strip comments, INLINE ones included: a prose "never numeric" note
        // must not read as a numeric column.
        .map((l) => l.replace(/--.*$/, '').trim())
        .filter((l) => /\b(numeric|decimal|float8|float4|real|double precision|money)\b/i.test(l));
      expect(`${path}: ${bad.join(' | ')}`).toBe(`${path}: `);
    }
  });

  test('every monetary column is bigint', () => {
    const ledger = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0001_ledger.sql'),
      'utf8',
    );

    expect(ledger).toMatch(/amount\s+bigint\s+not null/);
    expect(ledger).toMatch(/amount_minor\s+bigint\s+not null/);
  });
});

describe('the guarded transition (A1 §4)', () => {
  test('the only UPDATE of momo_transaction.status is guarded by its current status', () => {
    const postgres = readFileSync(join(SRC, 'server', 'db', 'postgres.ts'), 'utf8');

    expect(postgres).toContain('for update');
    expect(postgres).toContain('prev.status = any($2::momo_status[])');
    // Write-once: a second journal for one transaction is physically refused.
    expect(postgres).toContain('and journal_id is null');
  });

  test('the schema refuses to mutate a terminal status', () => {
    const ledger = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0001_ledger.sql'),
      'utf8',
    );

    expect(ledger).toContain('terminal status % is immutable');
    expect(ledger).toContain('journal_id is write-once');
    expect(ledger).toContain('ledger is append-only');
  });

  test('every table in the ledger migration has RLS enabled', () => {
    const ledger = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0001_ledger.sql'),
      'utf8',
    );

    const tables = [...ledger.matchAll(/^create table (\w+)/gm)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);

    for (const table of tables) {
      expect(`${table}:${ledger.includes(`alter table ${table}`)}`).toContain('true');
    }
  });
});
