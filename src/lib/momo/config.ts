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
  /**
   * Per-product API user overrides — **required by the sandbox, measured**.
   *
   * In the SANDBOX an API user belongs to the subscription key it was created
   * under. `scripts/momo-provision.mjs` creates ours with the COLLECTION key,
   * so that user is unknown to the disbursement product and every disbursement
   * call returns `500 NOT_ALLOWED_TARGET_ENVIRONMENT` — a message that sounds
   * like an environment problem and is actually a credential-scope one.
   * Provisioning a second user under the disbursement key fixes it, verified
   * 2026-09-03 by a `202` on `transfer`.
   *
   * On PRODUCTION there is one user for everything; MTN issues it. So this is
   * an override map and not a required field: absent, a product falls back to
   * `apiUser`/`apiKey`, which is exactly what production wants.
   */
  readonly productCredentials: Readonly<
    Partial<Record<MomoProduct, { readonly apiUser: string; readonly apiKey: string }>>
  >;
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
    productCredentials: readProductCredentials(env),
    callbackHost: env.MOMO_CALLBACK_HOST,
    timeoutMs: Number.parseInt(env.MOMO_TIMEOUT_MS ?? '', 10) || DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Per-product credential overrides, and why BOTH halves must be present.
 *
 * A user without its key, or a key without its user, is not a partial
 * credential — it is a credential that will fail authentication while looking
 * configured. Half an override is treated as no override, so the product falls
 * back to the shared pair rather than sending a token request that cannot work.
 */
function readProductCredentials(env: EnvBag): MomoConfig['productCredentials'] {
  const out: Record<string, { apiUser: string; apiKey: string }> = {};
  for (const product of ['collection', 'disbursement', 'remittance'] as const) {
    const prefix = `MOMO_${product.toUpperCase()}`;
    const apiUser = env[`${prefix}_API_USER`];
    const apiKey = env[`${prefix}_API_KEY`];
    if (apiUser && apiKey) out[product] = { apiUser, apiKey };
  }
  return out;
}

/**
 * The credentials to authenticate with for one product.
 *
 * The single place this decision is made, so no caller has to remember that the
 * sandbox scopes users per subscription key.
 */
export function credentialsFor(
  config: MomoConfig,
  product: MomoProduct,
): { readonly apiUser: string; readonly apiKey: string } {
  return config.productCredentials[product] ?? { apiUser: config.apiUser, apiKey: config.apiKey };
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
