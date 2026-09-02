#!/usr/bin/env node
/**
 * Is the Telegram bot alive, and configured for what we need it to do?
 *
 *   node scripts/telegram-check.mjs
 *
 * Sibling of `momo-smoke.mjs`: a pre-demo health check (docs/08 §2). Telegram
 * is the primary UI for this build (ADR-0007), so "is the bot up" belongs in
 * the same five-second sweep as "is the sandbox up".
 *
 * It also checks one thing that is easy to miss and impossible to fix from
 * code: BotFather's group privacy setting. See the note at the bottom.
 */

import { loadEnv, colour as c } from './_env.mjs';

const { env, path } = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;

console.log(`\n  ${c.b('Telegram bot check')}  ${c.d(path)}\n`);

if (!token) {
  console.error(
    `  ${c.r('✖')} TELEGRAM_BOT_TOKEN is empty.\n` +
      '    Open Telegram, talk to @BotFather, send /newbot, paste the token.\n',
  );
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

// ── identity ─────────────────────────────────────────────────────────────────
const me = await (await fetch(api('getMe'))).json();
if (!me.ok) {
  console.error(
    `  ${c.r('✖')} getMe failed: ${me.description || 'unknown error'}\n` +
      '    A 401 means the token is wrong or the bot was deleted.\n',
  );
  process.exit(1);
}

const b = me.result;
console.log(`  ${c.g('✓')} bot is live`);
console.log(`      username   ${c.b('@' + b.username)}`);
console.log(`      name       ${b.first_name}`);
console.log(`      id         ${b.id}\n`);

// ── capabilities we actually depend on ───────────────────────────────────────
const checks = [
  {
    ok: b.can_join_groups,
    label: 'can join groups',
    why: 'Split-a-bill (S6) posts into a group chat.',
    fix: '@BotFather -> /setjoingroups -> Enable',
  },
  {
    ok: b.can_read_all_group_messages,
    label: 'can read group messages',
    why: 'Split-a-bill needs to see who replied in the group.',
    fix: '@BotFather -> /setprivacy -> Disable',
    optional: true,
  },
];

for (const chk of checks) {
  const mark = chk.ok ? c.g('✓') : chk.optional ? c.y('!') : c.r('✖');
  console.log(`  ${mark} ${chk.label}`);
  if (!chk.ok) {
    console.log(`      ${c.d(chk.why)}`);
    console.log(`      ${c.d('fix: ' + chk.fix)}`);
  }
}

// ── webhook ──────────────────────────────────────────────────────────────────
const wh = await (await fetch(api('getWebhookInfo'))).json();
const w = wh.result || {};
console.log(`\n  ${c.b('webhook')}`);
console.log(`      url               ${w.url || c.d('(none — expected until deployed)')}`);
console.log(`      pending updates   ${w.pending_update_count ?? 0}`);
console.log(
  `      secret token set  ${w.has_custom_certificate === undefined && w.url ? c.d('unknown') : w.url ? c.g('yes') : c.d('n/a')}`,
);
if (w.last_error_message) {
  console.log(`      ${c.r('last error')}        ${w.last_error_message}`);
  console.log(`      ${c.d('Telegram retries; a stale error here is often already resolved.')}`);
}

if (w.pending_update_count > 0 && !w.url) {
  console.log(
    `\n  ${c.y('!')} ${w.pending_update_count} update(s) are queued with no webhook set.\n` +
      `    They will all arrive at once the moment you set one. Harmless — our\n` +
      `    handler is idempotent by update_id (docs/11 §6) — but expect a burst.`,
  );
}

console.log(`\n  ${c.g('✓')} Telegram is ready.\n`);
