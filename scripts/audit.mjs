#!/usr/bin/env node
/**
 * Locate the shared tumoOLO_Audits suite and forward to its runner.
 *
 * The suite lives OUTSIDE this repo on purpose: a fix to an audit reaches every
 * project on its next run, and this project cannot quietly drift onto its own
 * softer version of the accessibility standard.
 *
 * That means its path is a machine fact, not a repo fact — hence this shim
 * rather than a hardcoded `../tumoOLO_Audits` in package.json, which is wrong on
 * this machine and would be wrong differently in CI.
 *
 *   npm run audit:status
 *   npm run audit:plan
 *   npm run audit:brief -- A5
 *   AUDIT_SUITE="D:/some/other/path" npm run audit:gate
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(import.meta.url), '..', '..');

const CANDIDATES = [
  process.env.AUDIT_SUITE,
  join(projectRoot, '..', 'tumoOLO_Audits'),
  join(projectRoot, '.audit-suite'), // how CI checks it out
  'C:/MY BUSINESS COMPANY/tumoOLO_Audits',
  join(process.env.USERPROFILE || process.env.HOME || '', 'tumoOLO_Audits'),
].filter(Boolean);

const suite = CANDIDATES.find((p) => existsSync(join(p, 'runner', 'audit.mjs')));

if (!suite) {
  console.error(`
  Could not find the tumoOLO_Audits suite.

  Looked in:
${CANDIDATES.map((p) => `    - ${p}`).join('\n')}

  Point at it explicitly:
    AUDIT_SUITE="C:/path/to/tumoOLO_Audits" npm run audit:status

  The suite is intentionally not vendored into this repo — see PLANNING.md §11.
`);
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [join(suite, 'runner', 'audit.mjs'), ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: projectRoot },
);

process.exit(result.status ?? 1);
