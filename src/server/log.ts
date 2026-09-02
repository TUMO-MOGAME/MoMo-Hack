/**
 * Structured JSON logging (docs/01 §11).
 *
 * No paid APM on a free tier. What we have instead is Vercel's log drain, one
 * JSON object per line, always carrying `correlation_id` — which is the
 * `momo_transaction.id` wherever one exists, so a whole payment's life can be
 * grepped out of the drain with a single uuid.
 *
 * POPIA s105/106 (docs/14 §5): an MSISDN never appears in full in a log, a URL,
 * a query string or an error message. Callers mask with `maskMsisdn` before
 * they get here; `scrub` below is the second line of defence, not the first.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  readonly correlation_id?: string;
  readonly [key: string]: unknown;
}

/**
 * A bare 9-15 digit run, masked before it is printed.
 *
 * The lookaround deliberately excludes hyphens and hex letters. Without it
 * this shreds the correlation id, because
 * `00000000-0000-4000-8000-000000000001` contains a twelve-digit run — and a
 * logger that destroys the one field used to trace a payment end to end is
 * worse than no logger at all.
 */
const MSISDN_LIKE = /(?<![0-9a-zA-Z-])(\d{5,11})(\d{4})(?![0-9a-zA-Z-])/g;

export function scrub(value: string): string {
  return value.replace(MSISDN_LIKE, (_m, _head, tail) => `•••• ${String(tail)}`);
}

function serialise(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return scrub(value);
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialise(v)]));
  }
  return value;
}

export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...(serialise(fields) as Record<string, unknown>),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
