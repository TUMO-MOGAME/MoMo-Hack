/**
 * Telegram configuration, read from the environment PER CALL.
 *
 * Same reasoning as `src/lib/momo/config.ts`: no module-level
 * `const token = process.env.TELEGRAM_BOT_TOKEN`. A serverless function can be
 * warm across a credential change, and a build-time constant means the only way
 * to rotate a leaked bot token is a redeploy.
 */

import { AppException } from '@/lib/errors';

export type EnvBag = Record<string, string | undefined>;

export const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** docs/03 §1.3 reasoning, applied here: Vercel Hobby kills the function at 10s. */
export const DEFAULT_TIMEOUT_MS = 6000;

export interface TelegramConfig {
  readonly botToken: string;
  readonly webhookSecret: string;
  readonly timeoutMs: number;
}

function requireEnv(env: EnvBag, key: string): string {
  const value = env[key];
  if (!value) {
    // The KEY name is safe to surface. The value never is — a bot token in a
    // log is a bot somebody else owns.
    throw new AppException({ kind: 'VALIDATION', field: key, message: `${key} is not set` });
  }
  return value;
}

export function readTelegramConfig(env: EnvBag = process.env): TelegramConfig {
  return {
    botToken: requireEnv(env, 'TELEGRAM_BOT_TOKEN'),
    webhookSecret: requireEnv(env, 'TELEGRAM_WEBHOOK_SECRET'),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Which Telegram chats may spend real money (M5d).
 *
 * ── WHY THIS EXISTS, STATED PLAINLY ──────────────────────────────────────────
 *
 * `@momokasi_demo_bot` is PUBLIC, and from the production deploy it holds
 * production MoMo credentials. `/pay` asks MTN to push a payment prompt at ONE
 * configured handset — a real phone belonging to a real person. Without this
 * gate, every stranger who finds the bot in Telegram's search has a button that
 * rings that phone, as often as the rate limiter allows.
 *
 * The payee being configuration rather than input (`pay-replies.ts`) stops the
 * bot being aimed at *other* people. It does nothing to stop it being aimed at
 * *us*. That is what the allowlist is for.
 *
 * ── EMPTY MEANS NOBODY, NEVER EVERYBODY ──────────────────────────────────────
 *
 * An unset or empty `TELEGRAM_PAY_CHAT_IDS` returns an EMPTY set, and an empty
 * set denies everyone. This is the one design choice in the file worth
 * defending: the failure mode of denying too much is a demo that says "not this
 * chat" until someone pastes an id; the failure mode of allowing too much is a
 * stranger spending the budget and ringing a personal phone at 03:00. Those are
 * not comparable, so the default is the safe one even though it is the annoying
 * one.
 *
 * `scripts/vercel-env.mjs` refuses a live push when this is unset, so the
 * annoying failure is caught at deploy time rather than on stage.
 *
 * ── GROUP IDS ARE NEGATIVE ───────────────────────────────────────────────────
 *
 * Telegram gives groups and supergroups negative chat ids
 * (`-1001234567890`). A parser anchored to `\d+` silently drops every group,
 * which is a bug that only shows up in the one setting — a shared demo group —
 * where you would least like to debug it.
 */
export function parseChatIds(raw: string | undefined): ReadonlySet<number> {
  if (!raw) return new Set();

  const ids = new Set<number>();
  for (const token of raw.split(/[,\s]+/)) {
    if (!token) continue;
    // Integers only, optionally negative. A malformed entry is DROPPED rather
    // than throwing: this is read on the request path, and a throw here would
    // turn one typo in an env var into a webhook that 500s on every update.
    // Dropping fails closed — the effect is "that chat cannot pay", which is
    // visible the first time someone tries and is never dangerous.
    if (!/^-?\d+$/.test(token)) continue;
    const id = Number(token);
    if (Number.isSafeInteger(id)) ids.add(id);
  }
  return ids;
}

/** The allowlist as configured. Read per call, like everything else here. */
export function readPayAllowlist(env: EnvBag = process.env): ReadonlySet<number> {
  return parseChatIds(env.TELEGRAM_PAY_CHAT_IDS);
}

/**
 * Is the inbound request really from Telegram?
 *
 * Telegram echoes the `secret_token` given to `setWebhook` back in this header
 * on every update (docs/11 §6). Unlike the MoMo callback, this one **is**
 * genuinely authenticated, so the handler may trust the body.
 *
 * Compared in constant time. A timing oracle on a 64-character secret is a
 * stretch, but the whole point of the header is that it is a shared secret, and
 * comparing shared secrets with `===` is the habit that eventually costs you.
 */
export function isFromTelegram(header: string | null, expected: string): boolean {
  if (typeof header !== 'string') return false;
  if (header.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < header.length; i += 1) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
