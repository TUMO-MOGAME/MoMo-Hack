#!/usr/bin/env node
/**
 * `npm run demo` — the presentation, in one command.
 *
 *   npm run demo                 # run it
 *   npm run demo -- --check      # pre-flight only, spends nothing
 *   npm run demo -- --emulator   # force the offline emulator (the fallback)
 *   npm run demo -- --api        # force the real MTN API
 *
 * This is a thin launcher around `tests/demo/walkthrough.test.ts`. The
 * demonstration itself is a test because a test is the only thing that ASSERTS
 * — every number on the screen has an `expect` behind it, so the demo cannot
 * print a balanced ledger unless the ledger actually balanced. A script that
 * merely prints is a script that can lie on stage.
 *
 * ── WHY THERE IS A PRE-FLIGHT ────────────────────────────────────────────────
 *
 * `MOMO_TARGET_ENVIRONMENT` can be a LIVE MTN environment — production
 * credentials for `mtnsouthafrica` exist for this project and authenticate —
 * and the whole live testing budget is about R10 (CLAUDE.md #15). A demo
 * command is exactly the thing somebody runs twice while setting up the
 * projector. So: if the run would send REAL money, this refuses unless
 * `--live` is passed, and prints what it would have cost first.
 *
 * The emulator is not a lesser demo. It replays recorded MTN responses,
 * deterministically and offline (ADR-0009), which on conference wifi is the
 * more likely of the two to actually work.
 */

import { spawnSync } from 'node:child_process';
import { loadEnv, colour as c } from './_env.mjs';

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const allowLive = argv.includes('--live');
const forceEmulator = argv.includes('--emulator');
const forceApi = argv.includes('--api');

const { env, path } = loadEnv();

// ── THE DEMO-DAY SWITCH ──────────────────────────────────────────────────────
//
// ADR-0009 promises the MoMo client can be swapped "ninety seconds before we
// present". That promise is worthless if honouring it means opening a dotfile
// in front of an audience and editing it correctly under pressure.
//
//   npm run demo -- --emulator    recorded responses, offline, deterministic
//   npm run demo -- --api         the real MTN API
//
// So when the venue wifi is hostile or MTN is having an afternoon, the fallback
// is one word on a command line. Neither flag can spend more than the other:
// the budget guard sits below both.
const mode = forceEmulator
  ? 'emulator'
  : forceApi
    ? 'sandbox'
    : env.MOMO_MODE === 'emulator'
      ? 'emulator'
      : 'sandbox';
env.MOMO_MODE = mode === 'emulator' ? 'emulator' : 'sandbox';
const target = env.MOMO_TARGET_ENVIRONMENT ?? 'sandbox';
const live = target !== 'sandbox';
const cap = env.MOMO_LIVE_MAX_MINOR || '100';
const payMinor = live ? BigInt(cap) : 1250n;
const rand = (m) => `R${m / 100n}.${(m % 100n).toString().padStart(2, '0')}`;

console.log(`\n  ${c.b('MoMo Kasi — demo pre-flight')}  ${c.d(path)}\n`);
console.log(
  `  client         ${mode === 'emulator' ? c.g('emulator') + c.d('  recorded, offline, deterministic') : c.y('sandbox') + c.d('   the real MTN sandbox API')}`,
);
console.log(`  environment    ${live ? c.r(target) : c.g(target)}`);
console.log(
  `  database       ${env.DATABASE_URL ? c.g('configured') : c.r('MISSING — the demo needs DATABASE_URL')}`,
);
console.log(
  `  payment        ${c.b(rand(payMinor))}${live ? c.d(`   (capped at ${rand(BigInt(cap))} — budget guard)`) : c.d('  (sandbox money is not real)')}`,
);
console.log(
  `  split shown    ${c.b('R12.50')} ${c.d('— pure function, no money, always exact')}\n`,
);

if (!env.DATABASE_URL) {
  console.error(`  ${c.r('✖')} DATABASE_URL is not set. The ledger half cannot run.\n`);
  process.exitCode = 1;
} else if (live && mode !== 'emulator' && !allowLive) {
  // The dangerous combination, and the only one that is refused: a live
  // environment AND a real client. Either alone is safe.
  console.error(
    `  ${c.r('✖')} This would send ${c.b(rand(payMinor))} of ${c.r('REAL MONEY')} to "${target}".\n\n` +
      `    The whole live testing budget is about R10, and a demo gets run more\n` +
      `    than once. Two safer options, in order:\n\n` +
      `      ${c.b('MOMO_MODE=emulator')}          rehearse offline, spend nothing\n` +
      `      ${c.b('MOMO_TARGET_ENVIRONMENT=sandbox')}  the proven demo path\n\n` +
      `    If you genuinely mean to spend real money: ${c.b('npm run demo -- --live')}\n`,
  );
  process.exitCode = 1;
} else if (checkOnly) {
  console.log(`  ${c.g('✓')} pre-flight only. Nothing was sent.\n`);
} else {
  // Only the REAL client spends. Announcing "sending real money" while the
  // emulator answers is the exact false claim this file exists to prevent —
  // and it is worse on stage than saying nothing.
  if (live && mode !== 'emulator') {
    console.log(`  ${c.r('⚠')} sending ${c.b(rand(payMinor))} of REAL money to "${target}".\n`);
  } else {
    console.log(`  ${c.d('running…')}\n`);
  }

  // Through a shell, as ONE string. Two reasons, both learned the hard way:
  //
  //   - `spawnSync('npx.cmd', [...])` without a shell returned status 0 having
  //     run nothing at all on Windows — a silent success that printed no demo.
  //     That is the kind of thing you discover in front of an audience.
  //   - `shell: true` WITH an args array is deprecated (DEP0190), because the
  //     args are concatenated rather than escaped. A single fixed string with
  //     no interpolation has nothing to escape.
  const result = spawnSync('npx vitest run tests/demo/walkthrough.test.ts', {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env, MOMO_DEMO: '1' },
  });

  if (result.error) {
    console.error(`\n  ${c.r('✖')} could not start vitest: ${result.error.message}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
