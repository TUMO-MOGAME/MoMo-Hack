#!/usr/bin/env node
/**
 * Push the deployed environment onto Vercel (F9).
 *
 *   node scripts/vercel-env.mjs            # show the plan, change nothing
 *   node scripts/vercel-env.mjs --yes      # actually write it
 *
 * ── Why this is a script and not ten `vercel env add` calls ──────────────────
 *
 * Three reasons, and the third is the one that matters.
 *
 * 1. It is re-runnable. Every future key rotation is the same one command, and
 *    `upsert` means running it twice is not an error.
 * 2. It needs no `vercel link`, so it cannot accidentally create a SECOND
 *    project and quietly configure the wrong deployment.
 * 3. **Some of these values must not be copied from `.env.local`.** That file
 *    is the LOCAL developer environment, and two of its values are actively
 *    wrong for production:
 *
 *      MOMO_MODE=emulator          → correct locally, a lie in production. The
 *                                    emulator is the demo-day fallback
 *                                    (docs/03 §5); a deployed function running
 *                                    it would report success while touching no
 *                                    real MoMo API at all.
 *      MOMO_CALLBACK_HOST=momo-kasi.vercel.app
 *                                  → 404 DEPLOYMENT_NOT_FOUND. Measured, not
 *                                    assumed. Every X-Callback-Url we handed
 *                                    MTN would have gone nowhere, and the
 *                                    failure would have been invisible: the
 *                                    reconciler would quietly cover for it.
 *
 *    So the values below are split in two. SECRETS come from `.env.local`
 *    because only you have them. PINNED are set by policy, here, in code that
 *    review can see — never copied.
 *
 * ── The budget guard (CLAUDE.md #15) ─────────────────────────────────────────
 *
 * The live MoMo testing budget is about R10 total. This script refuses to set
 * a MOMO_TARGET_ENVIRONMENT other than `sandbox` unless you pass --allow-live,
 * and pins MOMO_LIVE_MAX_MINOR alongside it so the R1.00-per-transaction brake
 * in src/lib/momo/budget.ts is present in the deployed environment rather than
 * relying on its default.
 *
 * ── On Vercel tokens ─────────────────────────────────────────────────────────
 *
 * A token may be scoped to a USER or to a TEAM, and the two behave differently
 * enough to matter here. A team-scoped token has no user identity at all:
 * `/v2/user` answers **404 User not found** and `/v2/teams` answers **403**,
 * while `/v9/projects` answers 200 with exactly the projects it may touch.
 * So the auth probe below is the projects list itself — the thing we actually
 * need — rather than an identity endpoint a perfectly good token can fail.
 */

import { loadEnv, redact, colour as c } from './_env.mjs';

const API = 'https://api.vercel.com';

// ── arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const apply = flag('yes');
const allowLive = flag('allow-live');
const withTelegram = flag('with-telegram');
const wantProject = value('project', null);
const host = value('host', 'momo.tumoolo.tech');
const momoMode = value('mode', 'sandbox');
const targets = value('targets', 'production,preview')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

// ── what to set ──────────────────────────────────────────────────────────────
//
// SECRETS: only you have these, so they come from .env.local and must be there.
// PINNED:  policy. Set here so a reviewer can see the value, never copied from
//          a developer machine.

const SECRETS = [
  ['MOMO_COLLECTION_SUBSCRIPTION_KEY', 'Collections product key'],
  ['MOMO_DISBURSEMENT_SUBSCRIPTION_KEY', 'Disbursements product key'],
  ['MOMO_REMITTANCE_SUBSCRIPTION_KEY', 'Remittances product key'],
  ['MOMO_API_USER', 'the API user UUID'],
  ['MOMO_API_KEY', 'its secret'],
  ['DATABASE_URL', 'Postgres, via the Supabase session pooler'],
  ['NEXT_PUBLIC_SUPABASE_URL', 'public by design'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public by design; RLS is what protects us'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'bypasses RLS — server only, never the browser'],
  ['CRON_SECRET', 'guards /api/cron/reconcile'],
];

/**
 * Telegram is deliberately NOT in the list above, and is opt-in behind
 * `--with-telegram`.
 *
 * M5a is owned by another agent, in another worktree. A Vercel project's
 * environment is shared mutable state with no merge step: if that agent
 * regenerates `TELEGRAM_WEBHOOK_SECRET` while this script has already pinned a
 * different one, every update Telegram delivers 401s — and the failure looks
 * identical to a bug in the handler, in a place neither owner is looking.
 *
 * So these two have exactly one owner, and it is not this script. Whoever
 * builds M5a runs `--with-telegram` when the value is settled.
 */
const TELEGRAM = [
  ['TELEGRAM_BOT_TOKEN', 'the bot identity'],
  ['TELEGRAM_WEBHOOK_SECRET', 'proves an update really came from Telegram'],
];

/** Exit codes are returned, never `process.exit`ed — see the note in `main`. */
async function main() {
  const { env, path } = loadEnv();
  const secrets = withTelegram ? [...SECRETS, ...TELEGRAM] : SECRETS;
  console.log(`\n  ${c.b('Vercel environment')}  ${c.d(path)}\n`);

  // ── the token ──────────────────────────────────────────────────────────────

  const token = env.VERCEL_TOKEN || process.env.VERCEL_TOKEN;
  if (!token) {
    console.error(
      `  ${c.r('✖')} VERCEL_TOKEN is empty.\n\n` +
        '    https://vercel.com/account/tokens → Create Token\n' +
        '    scope: your own account · expiration: 1 day\n\n' +
        '    Paste it into .env.local, then run this again.\n' +
        `    ${c.d('It is a deploy-time credential. Revoke it when you are done.')}\n`,
    );
    return 1;
  }

  async function vercel(pathname, init = {}) {
    const res = await fetch(`${API}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = body?.error?.message ?? body?.message ?? res.statusText;
      throw new Error(`${res.status} ${detail}`);
    }
    return body;
  }

  // ── find the project ───────────────────────────────────────────────────────
  //
  // The projects list doubles as the auth probe. A team-scoped token cannot
  // enumerate teams, so we ask for its default scope first — which for such a
  // token is already the team — and only widen if it can tell us about others.

  const scopes = [{ label: 'default scope', query: '' }];
  try {
    const teams = await vercel('/v2/teams');
    for (const t of teams.teams ?? []) {
      scopes.push({ label: `team ${t.slug}`, query: `?teamId=${t.id}` });
    }
  } catch {
    /* 403 here is normal for a team-scoped token; its own scope still works */
  }

  const found = [];
  let lastError = null;
  for (const scope of scopes) {
    const sep = scope.query ? '&' : '?';
    try {
      const { projects = [] } = await vercel(`/v9/projects${scope.query}${sep}limit=100`);
      for (const p of projects) if (!found.some((f) => f.id === p.id)) found.push({ ...p, scope });
    } catch (e) {
      lastError = e;
    }
  }

  if (found.length === 0) {
    console.error(
      `  ${c.r('✖')} the token can see no projects${lastError ? `: ${lastError.message}` : '.'}\n` +
        '    A 403 usually means it expired, was revoked, or is scoped elsewhere.\n',
    );
    return 1;
  }

  let project;
  if (wantProject) {
    project = found.find((p) => p.name === wantProject);
    if (!project) {
      console.error(
        `  ${c.r('✖')} no project named ${c.b(wantProject)}. Visible:\n` +
          found.map((p) => `      ${p.name}`).join('\n') +
          '\n',
      );
      return 1;
    }
  } else if (found.length === 1) {
    project = found[0];
  } else {
    const guesses = found.filter((p) => /momo/i.test(p.name));
    if (guesses.length === 1) {
      project = guesses[0];
    } else {
      console.error(
        `  ${c.r('✖')} more than one project is visible. Name the one to configure:\n` +
          found.map((p) => `      --project ${p.name}`).join('\n') +
          '\n',
      );
      return 1;
    }
  }

  const scopeQuery = project.scope.query;
  console.log(`  ${c.g('✓')} token accepted`);
  console.log(`  ${c.g('✓')} project ${c.b(project.name)} ${c.d(project.accountId ?? '')}\n`);

  const targetEnvironment = env.MOMO_TARGET_ENVIRONMENT ?? 'sandbox';

  const PINNED = [
    ['MOMO_TARGET_ENVIRONMENT', targetEnvironment, 'anything but "sandbox" is real money'],
    ['MOMO_BASE_URL', env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com', ''],
    ['MOMO_MODE', momoMode, 'NOT emulator — the deployed function hits the real sandbox'],
    ['MOMO_CALLBACK_HOST', host, 'host only, no scheme (momoAPIs.md §4.1)'],
    ['MOMO_LIVE_MAX_MINOR', env.MOMO_LIVE_MAX_MINOR || '100', 'R1.00 per txn, off sandbox'],
  ];

  // ── refuse before writing anything ─────────────────────────────────────────

  const problems = [];

  const missing = secrets.filter(([k]) => !env[k]).map(([k]) => k);
  if (missing.length) problems.push(`these are empty in .env.local: ${missing.join(', ')}`);

  if (targetEnvironment !== 'sandbox' && !allowLive) {
    problems.push(
      `MOMO_TARGET_ENVIRONMENT is "${targetEnvironment}", not "sandbox" — that is REAL MONEY,\n` +
        '      and the entire live testing budget is about R10 (CLAUDE.md #15).\n' +
        '      Pass --allow-live only if you genuinely mean it.',
    );
  }

  if (momoMode === 'emulator') {
    problems.push(
      'MOMO_MODE=emulator would deploy the FAKE client. It would look like it worked\n' +
        '      and touch no MoMo API. Only pin this deliberately, as a demo-day fallback.',
    );
  }

  if (/^https?:\/\//.test(host) || host.includes('/')) {
    problems.push(`MOMO_CALLBACK_HOST must be a bare host, no scheme and no path — got "${host}"`);
  }

  if (problems.length) {
    console.error(`  ${c.r('✖')} refusing to write:\n`);
    for (const p of problems) console.error(`    · ${p}\n`);
    return 1;
  }

  // ── the plan ───────────────────────────────────────────────────────────────

  console.log(`  ${c.b('from .env.local')}  ${c.d('(values never printed in full)')}`);
  for (const [key, why] of secrets) {
    console.log(`      ${key.padEnd(36)} ${c.d(redact(env[key]))}  ${c.d(why)}`);
  }
  console.log(`\n  ${c.b('pinned by policy')}  ${c.d('(set here, not copied)')}`);
  for (const [key, val, why] of PINNED) {
    console.log(`      ${key.padEnd(36)} ${c.y(val)}  ${c.d(why)}`);
  }
  console.log(`\n  ${c.b('targets')}  ${targets.join(', ')}`);

  if (!apply) {
    console.log(
      `\n  ${c.y('Nothing written.')} This was the plan only.\n` +
        `  Re-run with ${c.b('--yes')} to apply it.\n`,
    );
    return 0;
  }

  // ── write ──────────────────────────────────────────────────────────────────
  //
  // One request per variable, so a single failure names the key that failed
  // rather than collapsing twelve into one opaque 400. `upsert=true` makes a
  // re-run idempotent, which is what turns this into a rotation tool.

  console.log('');
  const all = [...secrets.map(([k]) => [k, env[k]]), ...PINNED.map(([k, v]) => [k, v])];

  let written = 0;
  for (const [key, val] of all) {
    const sep = scopeQuery ? '&' : '?';
    try {
      await vercel(`/v10/projects/${project.id}/env${scopeQuery}${sep}upsert=true`, {
        method: 'POST',
        body: JSON.stringify({
          key,
          value: val,
          type: key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'encrypted',
          target: targets,
        }),
      });
      console.log(`  ${c.g('✓')} ${key}`);
      written += 1;
    } catch (e) {
      console.log(`  ${c.r('✖')} ${key}  ${c.d(e.message)}`);
    }
  }

  // ── read it back ───────────────────────────────────────────────────────────
  //
  // Trusting a 200 is how MISTAKES.md M2 happened. Ask the API what is actually
  // there now, and compare it against what we meant to set.

  const sep = scopeQuery ? '&' : '?';
  const { envs = [] } = await vercel(
    `/v9/projects/${project.id}/env${scopeQuery}${sep}decrypt=false`,
  );
  const present = new Set(envs.map((e) => e.key));
  const absent = all.map(([k]) => k).filter((k) => !present.has(k));

  console.log(
    `\n  ${written === all.length ? c.g('✓') : c.y('!')} ${written}/${all.length} written` +
      `, ${present.size} variables now on the project`,
  );

  if (absent.length) {
    console.error(`  ${c.r('✖')} still missing after the write: ${absent.join(', ')}\n`);
    return 1;
  }

  console.log(
    `\n  ${c.b('Environment variables apply at BUILD time.')}\n` +
      `  ${c.d('Nothing changes until the next deployment. Redeploy, then:')}\n\n` +
      `      curl -s https://${host}/api/health\n\n` +
      `  ${c.d('Expect')} database: configured ${c.d('— it says')} unconfigured ${c.d('today.')}\n`,
  );
  return 0;
}

// `process.exit()` while a fetch is still settling trips a libuv assertion on
// Windows (`!(handle->flags & UV_HANDLE_CLOSING)`), which turns a clean "the
// token was rejected" into a crash dump. Setting `exitCode` lets Node close its
// handles and leave on its own terms.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(`\n  ${c.r('✖')} ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
