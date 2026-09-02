#!/usr/bin/env node
/**
 * Talk to the bot against a LOCAL server, with no deploy and no tunnel.
 *
 *   npm run dev:telegram                     # bridges to http://localhost:3000
 *   npm run dev:telegram -- http://localhost:3001
 *
 * Telegram will not deliver a webhook to `localhost` — it needs a public HTTPS
 * URL. This closes the loop from the other side: long-poll `getUpdates`, and
 * POST each update into the local route exactly as Telegram would, secret
 * header and all. The reply still goes out through the real Telegram API, so
 * the message genuinely arrives on the phone.
 *
 * It is a DEV TOOL, not a second code path: the route, the handler, the model
 * call and the outbound send are all the deployed ones. The only thing faked is
 * the delivery of the inbound request.
 *
 * MUTUALLY EXCLUSIVE WITH A WEBHOOK. Telegram refuses `getUpdates` while a
 * webhook is set (409). Run `node scripts/telegram-setup.mjs --delete` first, or
 * simply do local work before pointing the bot at a deployment.
 *
 * Ctrl+C to stop.
 */

import { loadEnv } from './_env.mjs';

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;

const env = loadEnv();
const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secret) {
  console.error(`\n  ${r('✖')} TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must both be set.\n`);
  process.exit(1);
}

const target = new URL('/api/telegram/webhook', process.argv[2] ?? 'http://localhost:3000');
const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function tg(method, payload) {
  const response = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return response.json();
}

const me = await tg('getMe');
if (!me.ok) {
  console.error(`\n  ${r('✖')} getMe failed: ${me.description}\n`);
  process.exit(1);
}

const hook = await tg('getWebhookInfo');
if (hook.ok && hook.result.url) {
  console.error(`
  ${r('✖')} A webhook is set, so long-polling is refused by Telegram.

      ${d(hook.result.url)}

      Remove it first:  ${b('node scripts/telegram-setup.mjs --delete')}
`);
  process.exit(1);
}

// Is the local server actually up? Failing here is much clearer than a hundred
// silent connection refusals once messages start arriving.
try {
  await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`
  ${r('✖')} Nothing is listening at ${b(target.origin)}

      Start it first:  ${b('npm run build && npx next start -p 3000')}
`);
  process.exit(1);
}

console.log(`
  ${b('Telegram dev bridge')}

      bot       ${b('@' + me.result.username)}
      forwards  ${d(target.toString())}

  ${g('✓')} listening. Message the bot on Telegram — replies come from your local server.
  ${d('Ctrl+C to stop.')}
`);

let offset;
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  console.log(`\n  ${d('stopped.')}\n`);
  process.exit(0);
});

while (!stopping) {
  let updates;
  try {
    // 25s long poll: one request per 25 idle seconds rather than a busy loop.
    updates = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
  } catch (e) {
    console.log(`  ${y('!')} telegram unreachable, retrying  ${d(e.message)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    continue;
  }

  if (!updates.ok) {
    console.log(`  ${y('!')} getUpdates: ${updates.description}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    continue;
  }

  for (const update of updates.result) {
    // Advance past this update so Telegram stops re-sending it.
    offset = update.update_id + 1;

    const text = update.message?.text ?? d('(no text)');
    console.log(`  ${d('→')} ${b(String(text).slice(0, 60))}`);

    const started = Date.now();
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Exactly what Telegram sends. The route rejects anything else.
          'X-Telegram-Bot-Api-Secret-Token': secret,
        },
        body: JSON.stringify(update),
      });
      const ms = Date.now() - started;
      const mark = response.ok ? g('✓') : r('✖');
      console.log(`  ${mark} ${response.status}  ${d(ms + 'ms')}`);
    } catch (e) {
      console.log(`  ${r('✖')} local server: ${e.message}`);
    }
  }
}
