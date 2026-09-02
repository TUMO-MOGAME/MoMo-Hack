#!/usr/bin/env node
/**
 * `npm run hooks:install` — point git at `.githooks/`.
 *
 * ── WHY THIS IS AN EXPLICIT COMMAND AND NOT A `prepare` SCRIPT ───────────────
 *
 * The idiomatic way to install a hook is an npm `prepare` script, so it happens
 * on every `npm install` and nobody has to remember. It is not done that way
 * here, for one specific reason:
 *
 * `core.hooksPath` lives in `.git/config`, which is SHARED BY EVERY WORKTREE of
 * this repository. This project runs parallel agents in `git worktree`s
 * (`docs/07`, `npm run agent:worktree`), so a `prepare` script would reach out
 * of the tree it was run in and change how `git push` behaves in someone else's
 * — mid-session, without telling them. That is a surprising amount of blast
 * radius for a convenience.
 *
 * So it is one command, run once per clone, by a person who meant to.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────
 *
 * Overwrite an existing `core.hooksPath` that is not ours. If husky, lefthook or
 * a hand-rolled setup already owns hooks here, this says so and stops rather
 * than silently disabling someone's pre-commit checks.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';

const PATH = '.githooks';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!existsSync(PATH)) {
  console.error(`\n  ${PATH}/ does not exist — run this from the repository root.\n`);
  process.exit(1);
}

let current = '';
try {
  current = git('config', '--get', 'core.hooksPath');
} catch {
  // Unset. `git config --get` exits 1 when the key is absent, which is the
  // normal case on a fresh clone and is not an error.
}

if (current && current !== PATH) {
  console.error(`\n  core.hooksPath is already set to "${current}".`);
  console.error(`  Refusing to overwrite it — something else owns hooks in this clone.`);
  console.error(`  If that is stale:  git config core.hooksPath ${PATH}\n`);
  process.exit(1);
}

git('config', 'core.hooksPath', PATH);

// Git needs the hook to be executable on POSIX. On Windows this is a no-op that
// git happily ignores, so it is unconditional rather than platform-branched.
try {
  chmodSync(`${PATH}/pre-push`, 0o755);
} catch {
  // A filesystem that does not carry a mode bit. Git on Windows runs the hook
  // through sh regardless, so this is not worth failing over.
}

console.log(`\n  core.hooksPath → ${PATH}`);
console.log(`  pre-push now checks that the language directive is still wired in.`);
console.log(`  Skip a single push with: git push --no-verify\n`);
