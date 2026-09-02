/**
 * The MoMo client factory.
 *
 * ```ts
 * export const momo = process.env.MOMO_MODE === 'emulator' ? ... : ...   // NO
 * ```
 *
 * That line, at module scope, is a BUILD-TIME constant. docs/03 §5 is explicit
 * that the switch must be read PER REQUEST: "if the sandbox dies ninety seconds
 * before we present, we flip it in the Vercel dashboard and the demo
 * continues." So this is a function, and every caller calls it.
 */

import { createTransport, type CreateClientOptions } from './client';
import { createCollectionsApi } from './collections';
import { type EnvBag, readMomoMode } from './config';
import { createEmulatorClient } from './emulator';
import type { MomoClient } from './types';

export function createSandboxClient(options: CreateClientOptions = {}): MomoClient {
  const transport = createTransport(options);
  return { mode: 'sandbox', collections: createCollectionsApi(transport) };
}

export interface GetClientOptions extends CreateClientOptions {
  readonly now?: () => number;
}

/**
 * The client for THIS request. Never cache the result across requests.
 *
 * Anything other than the literal `MOMO_MODE=emulator` gives the real sandbox,
 * so a typo fails towards the truthful path rather than towards a fake one.
 */
export function getMomoClient(options: GetClientOptions = {}): MomoClient {
  const env: EnvBag | undefined = options.env;
  if (readMomoMode(env ?? process.env) === 'emulator') {
    return createEmulatorClient({
      ...(env ? { env } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  }
  return createSandboxClient(options);
}

export * from './types';
export { MomoRequestError, isMomoRequestError, eventForSendFailure } from './errors';
export { toMomoAmount, fromMomoAmount, momoCurrency, isExpectedCurrency } from './currency';
export { readMomoConfig, readMomoMode, callbackUrlFor } from './config';
export { createTokenCache, tokenCache, TOKEN_TTL_SAFETY } from './token';
export { createTransport, isUuidV4, assertReferenceId, assertExternalId } from './client';
export { createCollectionsApi } from './collections';
export {
  ASYNC_SETTLE_MS,
  createEmulatorClient,
  createEmulatorStore,
  emulatorStore,
  forcedOutcome,
  outcomeFor,
} from './emulator';
