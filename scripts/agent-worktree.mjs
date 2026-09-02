#!/usr/bin/env node
/**
 * Give an agent its own git worktree before it starts (MISTAKES.md M4).
 *
 *   npm run agent:worktree -- agent/p3-backend-money-engine
 *
 * M4 — I launched an agent into the repo root and then ran `git checkout` in
 *      that same directory to verify a merge. Its uncommitted work survived
 *      only because the files happened to be untracked. A checkout that wanted
 *      those paths would have destroyed hours of work.
 *
 * The rule: the repo root is MINE. Every agent works somewhere else.
 * Print the resulting path into the agent's brief so it never touches the root.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const sh = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', cwd: root, ...opts }).trim();

const branch = process.argv[2];
if (!branch) {
  console.error(`
  Usage: npm run agent:worktree -- <branch>

  Existing worktrees:
${sh(['worktree', 'list'])
  .split('\n')
  .map((l) => '    ' + l)
  .join('\n')}
`);
  process.exit(1);
}

// One directory per branch, as a sibling of the repo. `agent/p3-foo` -> ..-p3-foo
const slug = branch.replace(/^agent\//, '').replace(/[^a-zA-Z0-9]+/g, '-');
const target = join(dirname(root), `${basename(root)}-${slug}`);

// Already there? Say so and stop — re-creating would strand uncommitted work.
const existing = sh(['worktree', 'list', '--porcelain']);
if (existing.includes(`branch refs/heads/${branch}`)) {
  const line = existing
    .split('\n\n')
    .find((b) => b.includes(`branch refs/heads/${branch}`))
    ?.split('\n')[0]
    ?.replace('worktree ', '');
  console.log(`\n  ${g('✓')} ${branch} already has a worktree\n     ${line}\n`);
  process.exit(0);
}

if (existsSync(target)) {
  console.error(`\n  ${r('✖')} ${target} already exists but is not a worktree for ${branch}.\n`);
  process.exit(1);
}

// Create the branch off origin/main if it does not exist yet.
let hasBranch = true;
try {
  sh(['rev-parse', '--verify', branch], { stdio: 'pipe' });
} catch {
  hasBranch = false;
}

sh(['fetch', '--quiet', 'origin']);
const args = hasBranch
  ? ['worktree', 'add', target, branch]
  : ['worktree', 'add', '-b', branch, target, 'origin/main'];

execFileSync('git', args, { cwd: root, stdio: 'inherit' });

console.log(`
  ${g('✓')} worktree ready

     path    ${target}
     branch  ${branch}
     base    ${hasBranch ? '(existing branch)' : 'origin/main'}

  ${d('Put this path in the agent brief. The repo root is not the agent’s to touch.')}
  ${d('Dependencies: run `npm install` in the new worktree — node_modules is not shared.')}
`);
