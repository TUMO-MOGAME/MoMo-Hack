#!/usr/bin/env node
/**
 * Merge a pull request without repeating M1 or M2 (see MISTAKES.md).
 *
 *   npm run pr:merge -- 12
 *
 * M1 — a push is not synchronous from GitHub's side. Chaining `git push` and
 *      `gh pr merge` merged a stale head once and left `main` with the docs and
 *      none of the code. So: assert the PR head SHA equals what we pushed,
 *      and refuse otherwise.
 *
 * M2 — `--delete-branch` reported success and left the remote branch alive. It
 *      later became a conflicting duplicate PR that would have reverted nine
 *      files. So: prune afterwards and assert the branch is actually gone.
 *
 * Use this instead of `gh pr merge`. It is slower by about two seconds.
 */

import { execFileSync } from 'node:child_process';

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const die = (msg) => {
  console.error(`\n  ${r('✖')} ${msg}\n`);
  process.exit(1);
};

const pr = process.argv[2];
if (!pr || !/^\d+$/.test(pr)) die('Usage: npm run pr:merge -- <pr-number>');

console.log(`\n  ${d('Safe merge')}  PR #${pr}\n`);

// ── 1. What does GitHub think the head is? ───────────────────────────────────
let meta;
try {
  meta = JSON.parse(
    sh('gh', ['pr', 'view', pr, '--json', 'headRefOid,headRefName,mergeable,state,title']),
  );
} catch {
  die(`Could not read PR #${pr}. Is the number right, and is gh authenticated?`);
}

if (meta.state !== 'OPEN') die(`PR #${pr} is ${meta.state}, not OPEN.`);

const branch = meta.headRefName;
console.log(`  ${d('branch')}  ${branch}`);
console.log(`  ${d('title ')}  ${meta.title}`);

// ── 2. M1 guard — the head must be what we actually pushed ───────────────────
sh('git', ['fetch', '--quiet', 'origin']);

let remoteSha;
try {
  remoteSha = sh('git', ['rev-parse', `origin/${branch}`]);
} catch {
  die(`origin/${branch} does not exist locally even after fetch.`);
}

if (meta.headRefOid !== remoteSha) {
  die(
    `M1 GUARD: GitHub's PR head does not match origin/${branch}.\n` +
      `    PR head        ${meta.headRefOid}\n` +
      `    origin/${branch}  ${remoteSha}\n\n` +
      '    GitHub has not caught up with the push yet. Wait a few seconds and re-run.\n' +
      '    Merging now would merge a stale commit — that is exactly M1.',
  );
}
console.log(`  ${g('✓')} head matches origin  ${d(remoteSha.slice(0, 8))}`);

// If the branch exists locally too, it must agree — otherwise we have unpushed work.
try {
  const localSha = sh('git', ['rev-parse', branch]);
  if (localSha !== remoteSha) {
    die(
      `M1 GUARD: local ${branch} differs from origin/${branch}.\n` +
        `    local   ${localSha}\n` +
        `    origin  ${remoteSha}\n\n` +
        '    You have unpushed commits. Push them first, or you will merge without them.',
    );
  }
  console.log(`  ${g('✓')} local branch agrees`);
} catch {
  console.log(`  ${d('–')} no local copy of ${branch} ${d('(fine)')}`);
}

// ── 3. Mergeability ──────────────────────────────────────────────────────────
if (meta.mergeable === 'CONFLICTING') {
  die(
    `PR #${pr} is CONFLICTING.\n\n` +
      '    Before resolving anything by hand, ask the M2 question:\n' +
      '    "Is this content already on main by another route?"\n' +
      '    A squash merge leaves the original branch looking permanently\n' +
      '    divergent. A stale duplicate must be CLOSED, never merged.\n\n' +
      `    Check with:  git diff origin/${branch} origin/main --stat`,
  );
}

// ── 4. Merge ─────────────────────────────────────────────────────────────────
console.log(`\n  ${d('merging (squash)…')}`);
try {
  execFileSync('gh', ['pr', 'merge', pr, '--squash', '--delete-branch'], { stdio: 'inherit' });
} catch {
  die('The merge itself failed. Nothing was pruned; the branch is untouched.');
}

// ── 5. M2 guard — the branch must actually be gone ───────────────────────────
sh('git', ['fetch', '--quiet', '--prune', 'origin']);

let survived = false;
try {
  sh('git', ['rev-parse', `origin/${branch}`]);
  survived = true;
} catch {
  /* good — it is gone */
}

if (survived) {
  console.log(`\n  ${y('!')} M2 GUARD: origin/${branch} survived the merge. Deleting it.`);
  try {
    sh('git', ['push', 'origin', '--delete', branch]);
    sh('git', ['fetch', '--quiet', '--prune', 'origin']);
    console.log(`  ${g('✓')} deleted`);
  } catch {
    die(
      `Could not delete origin/${branch}. Delete it on GitHub before it becomes\n` +
        '    a duplicate PR — that is M2, and it nearly reverted nine files.',
    );
  }
} else {
  console.log(`  ${g('✓')} origin/${branch} is gone`);
}

// ── 6. Report what is left ───────────────────────────────────────────────────
const remotes = sh('git', ['branch', '-r'])
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s && !s.includes('->') && s !== 'origin/main');

console.log(`\n  ${g('✓')} PR #${pr} merged.  ${d(sh('git', ['log', '--oneline', '-1', 'origin/main']))}`);
if (remotes.length) {
  console.log(`\n  ${d('remaining remote branches:')}`);
  remotes.forEach((b) => console.log(`    ${b}`));
} else {
  console.log(`  ${d('no stale remote branches')}`);
}
console.log();
