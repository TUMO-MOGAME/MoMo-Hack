/**
 * Find and load `.env.local`, from any worktree.
 *
 * `.env.local` is gitignored, so it exists in exactly one working tree — the
 * one where you pasted your keys. But we deliberately run agents in separate
 * worktrees (MISTAKES.md M4), and a script run from one of those would
 * otherwise report "no .env.local" while the file sits perfectly well next
 * door.
 *
 * So: look in this worktree first, then in every other worktree git knows about.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptsRoot = resolve(fileURLToPath(import.meta.url), '..', '..');

/** Every working tree for this repo, this one first. */
function worktrees(from) {
  const out = [from];
  try {
    const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      cwd: from,
    });
    for (const line of listing.split('\n')) {
      if (line.startsWith('worktree ')) {
        const p = line.slice('worktree '.length).trim();
        if (p && !out.includes(p)) out.push(p);
      }
    }
  } catch {
    /* not a git repo, or git missing — the local check still applies */
  }
  return out;
}

/** Absolute path to the `.env.local` we should use, or null. */
export function findEnvFile(from = scriptsRoot) {
  for (const dir of worktrees(from)) {
    const p = join(dir, '.env.local');
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Parse `.env.local` into a plain object.
 * Exits with a useful message rather than a stack trace when it is missing.
 */
export function loadEnv(from = scriptsRoot) {
  const path = findEnvFile(from);
  if (!path) {
    console.error(
      '\n  No .env.local found in any worktree.\n' +
        '  Copy .env.example to .env.local and paste your keys in.\n',
    );
    process.exit(1);
  }
  const env = Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  );
  return { env, path };
}

/** Never print a secret. Use this if a value must appear in output at all. */
export const redact = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)}` : '(empty)');

export const colour = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};
