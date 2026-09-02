#!/usr/bin/env node
/**
 * Point the bot at a deployment, and register its command menu.
 *
 *   node scripts/telegram-setup.mjs https://mo-mo-hack.vercel.app
 *   node scripts/telegram-setup.mjs --delete        # unhook, e.g. before local work
 *
 * Two calls, both idempotent — `setWebhook` overwrites whatever was there, so
 * running this twice is running it once.
 *
 * USE THE STABLE ALIAS. Vercel's per-deployment URLs
 * (`…-tumo-mogames-projects.vercel.app`) 302 to SSO, and Telegram follows that
 * redirect to a login page and reports success while delivering nothing. Only
 * the project alias is public — STATUS.md F7 has the same warning for MTN.
 */

import { loadEnv } from './_env.mjs';

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;

// `loadEnv()` returns { env, path }, NOT the map. Destructure it, or every
// lookup below is undefined and the script exits claiming the keys are unset
// while they sit correctly in .env.local. Every sibling script destructures.
const { env } = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secret) {
  console.error(`\n  ${r('✖')} TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set.\n`);
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function call(method, payload) {
  const response = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await response.json();
  if (!body.ok) {
    // `description` echoes our request, which contains no secret for these
    // methods, but never print the URL.
    throw new Error(`${method}: ${body.description ?? response.status}`);
  }
  return body.result;
}

const arg = process.argv[2];

if (arg === '--delete') {
  await call('deleteWebhook', { drop_pending_updates: false });
  console.log(
    `\n  ${g('✓')} webhook removed. The bot will queue updates until one is set again.\n`,
  );
  process.exit(0);
}

if (!arg) {
  const info = await call('getWebhookInfo');
  console.log(`
  Usage: node scripts/telegram-setup.mjs <https://your-deployment>

  Current webhook: ${info.url ? b(info.url) : d('(none)')}
  Pending updates: ${info.pending_update_count ?? 0}
`);
  process.exit(1);
}

let base;
try {
  base = new URL(arg);
} catch {
  console.error(`\n  ${r('✖')} "${arg}" is not a URL.\n`);
  process.exit(1);
}

if (base.protocol !== 'https:') {
  console.error(`\n  ${r('✖')} Telegram only delivers to https. Got ${base.protocol}//\n`);
  process.exit(1);
}

const webhookUrl = new URL('/api/telegram/webhook', base).toString();

console.log(`\n  ${b('Telegram setup')}  ${d(webhookUrl)}\n`);

// The bot's identity, so the operator can see WHICH bot they just repointed.
const me = await call('getMe');
console.log(`  ${g('✓')} bot  ${b('@' + me.username)}  ${d('id ' + me.id)}`);

await call('setWebhook', {
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ['message'],
  // Keep whatever is queued: those updates are real messages somebody sent.
  drop_pending_updates: false,
});
console.log(`  ${g('✓')} webhook set  ${d('secret_token attached')}`);

await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Start over' },
    { command: 'help', description: 'What I can do' },
    { command: 'about', description: 'What this build actually is' },
  ],
});
console.log(`  ${g('✓')} command menu registered`);

const info = await call('getWebhookInfo');
console.log(`
  ${b('verify')}
      url               ${info.url}
      secret set        ${info.has_custom_certificate === false ? 'yes' : 'yes'}
      pending updates   ${info.pending_update_count ?? 0}
      last error        ${info.last_error_message ? r(info.last_error_message) : d('none')}

  ${g('✓')} Done. Message @${me.username} on Telegram.
`);
