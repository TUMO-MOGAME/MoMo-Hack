/**
 * MoMo configuration, read from the environment PER CALL.
 *
 * "The switch is an environment variable read per-request, not a build-time
 * constant. If the sandbox dies ninety seconds before we present, we flip it in
 * the Vercel dashboard and the demo continues." (docs/03 §5)
 *
 * So: no module-level `const mode = process.env.MOMO_MODE`. Every function here
 * takes an env bag, defaulting to `process.env`, and reads it when called.
 */

import { AppException } from '@/lib/errors';
import { type MomoMode, type MomoProduct } from './types';

export interface MomoConfig {
  readonly mode: MomoMode;
  readonly baseUrl: string;
  readonly targetEnvironment: string;
  readonly apiUser: string;
  readonly apiKey: string;
  readonly subscriptionKeys: Readonly<Record<MomoProduct, string>>;
  /** Host only — no scheme, no path (momoAPIs.md §4.1). */
  readonly callbackHost: string | undefined;
  /** docs/03 §1.3 — 6s leaves ~4s of the 10s Vercel budget for our own work. */
  readonly timeoutMs: number;
}

export type EnvBag = Record<string, string | undefined>;

export const DEFAULT_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
export const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Which client to build. Read fresh every time — see the note at the top.
 * Anything other than the literal 'emulator' means the real sandbox, so a typo
 * fails towards the truthful path rather than towards a fake one.
 */
export function readMomoMode(env: EnvBag = process.env): MomoMode {
  return env.MOMO_MODE === 'emulator' ? 'emulator' : 'sandbox';
}

function requireEnv(env: EnvBag, key: string): string {
  const value = env[key];
  if (!value) {
    // The KEY name is safe to surface; the value never is.
    throw new AppException({ kind: 'VALIDATION', field: key, message: `${key} is not set` });
  }
  return value;
}

/**
 * Build the config. Throws VALIDATION naming the missing variable — never the
 * value, and never a partial key (no secrets in logs, CLAUDE.md).
 */
export function readMomoConfig(env: EnvBag = process.env): MomoConfig {
  return {
    mode: readMomoMode(env),
    baseUrl: (env.MOMO_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    targetEnvironment: env.MOMO_TARGET_ENVIRONMENT ?? 'sandbox',
    apiUser: requireEnv(env, 'MOMO_API_USER'),
    apiKey: requireEnv(env, 'MOMO_API_KEY'),
    subscriptionKeys: {
      collection: requireEnv(env, 'MOMO_COLLECTION_SUBSCRIPTION_KEY'),
      disbursement: env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ?? '',
      remittance: env.MOMO_REMITTANCE_SUBSCRIPTION_KEY ?? '',
    },
    callbackHost: env.MOMO_CALLBACK_HOST,
    timeoutMs: Number.parseInt(env.MOMO_TIMEOUT_MS ?? '', 10) || DEFAULT_TIMEOUT_MS,
  };
}

/**
 * The per-request callback URL for a product.
 *
 * `MOMO_CALLBACK_HOST` is a HOST, not a URL — no scheme, no path (momoAPIs.md
 * §4.1, rated **[P]**). If it is unset we send no `X-Callback-Url` at all,
 * which is fine: the callback is a latency optimisation, and the reconciler is
 * the authoritative path (docs/03 §3).
 */
export function callbackUrlFor(config: MomoConfig, kind: MomoProduct): string | undefined {
  if (!config.callbackHost) return undefined;
  const host = config.callbackHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/api/momo/callback/${kind}`;
}
