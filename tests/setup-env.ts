/**
 * Load `.env.local` into `process.env` before any test runs.
 *
 * WHY THIS EXISTS. Next.js loads `.env.local` automatically and
 * `scripts/_env.mjs` loads it for the CLI tools, so it is easy to assume
 * everything sees it. Vitest does not. The integration suite reads
 * `process.env.DATABASE_URL`, found nothing, and skipped — **while the database
 * was migrated and reachable**. Thirty-five tests reported themselves skipped
 * for a reason that had stopped being true.
 *
 * That is the failure mode worth naming: a skip is only honest if the condition
 * it claims is real. "No DATABASE_URL" was true of the process and false of the
 * machine, and the suite could not tell the difference.
 *
 * TWO RULES HERE.
 *
 *   1. **A real environment variable always wins.** CI sets `DATABASE_URL` as a
 *      secret; a stray `.env.local` on a runner must never silently redirect a
 *      test run at a different database.
 *   2. **A missing file is not an error.** CI has no `.env.local` and should
 *      not be told about it on every run.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Every git worktree, so `.env.local` is found from a sibling tree too.
 *
 * Agents work in their own worktrees (MISTAKES.md M4) and `.env.local` lives in
 * exactly one of them. `scripts/_env.mjs` already does this for the CLI; a test
 * run from a worktree deserves the same courtesy rather than a mystery skip.
 */
function candidateRoots(): string[] {
  const roots = [repoRoot];
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        const p = line.slice('worktree '.length).trim();
        if (p && !roots.includes(p)) roots.push(p);
      }
    }
  } catch {
    /* not a git repo, or git missing — the local root still applies */
  }
  return roots;
}

for (const root of candidateRoots()) {
  const path = join(root, '.env.local');
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    // Rule 1: never override what the environment already provides.
    if (key && process.env[key] === undefined) {
      process.env[key] = value?.trim() ?? '';
    }
  }
  break;
}
