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
