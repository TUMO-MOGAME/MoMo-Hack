/**
 * Artifacts across JSON, without ever touching a floating-point number.
 *
 * This is the THIRD boundary in this codebase where `bigint` cannot pass:
 *
 *   1. Server Component → Client Component  (React has no serialisation for it)
 *   2. `pg` → JavaScript                    (int8 arrives as a string, on purpose)
 *   3. HTTP response → browser              (JSON.stringify THROWS on a bigint)
 *
 * All three have the same wrong answer available — `Number(amount)` — and it is
 * wrong in the same way each time: above 2^53 it silently loses precision, and
 * this is money (ADR-0004, CLAUDE.md #1). A rand value that has been through a
 * float is no longer a rand value, it is an estimate.
 *
 * So the wire format is a decimal STRING, which is lossless and exact, and the
 * conversion happens once at each edge. Between the edges it is always `bigint`.
 *
 * ── WHY A GENERIC WALK RATHER THAN A TYPED MAPPER PER ARTIFACT ───────────────
 *
 * `Artifact` is a discriminated union of eight shapes, and money hides at
 * different depths in each — `balances[].money`, `items[].money`, `fare`,
 * `parts[].money`, `action.money`, `action.fromBalance`. A hand-written mapper
 * per shape is eight chances to miss one, and a missed one does not fail
 * loudly: `JSON.stringify` throws on the way out, but a string that never gets
 * revived on the way in reaches the renderer as a string and formats as
 * garbage.
 *
 * The walk cannot miss one. It converts every `bigint` out and every `amount`
 * back, wherever it sits, and adding a ninth artifact type needs no change
 * here at all.
 */

import type { Artifact } from '@/lib/artifacts/types';

/**
 * Every `bigint` becomes a decimal string. Everything else is untouched.
 *
 * Call this before `JSON.stringify`, not instead of it — `JSON.stringify` on a
 * `bigint` throws `TypeError: Do not know how to serialize a BigInt`, which is
 * the correct behaviour and the reason this function exists.
 */
export function toWire(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWire(v)]));
  }
  return value;
}

/**
 * Revive the money. Only the `amount` key, and only when it holds a string.
 *
 * Deliberately narrow. A blanket "any numeric-looking string becomes a bigint"
 * would eat `bps`, `score`, ISO dates and ids — so this keys off the one
 * property name the money type uses (`SourcedMoney.amount`), and leaves
 * everything else exactly as it arrived.
 *
 * A malformed amount throws here rather than reaching a renderer, which is the
 * right place for it to fail: at the edge, naming the value, before anything is
 * drawn on a screen that claims to be a ledger.
 */
export function fromWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromWire);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        if (k === 'amount' && typeof v === 'string') {
          try {
            return [k, BigInt(v)];
          } catch {
            throw new TypeError(`artifact amount is not an integer: ${JSON.stringify(v)}`);
          }
        }
        return [k, fromWire(v)];
      }),
    );
  }
  return value;
}

/** The wire shape of one agent turn. Money inside `artifact` is stringified. */
export interface WireTurn {
  readonly reply: string;
  readonly artifact?: unknown;
  readonly tool: string;
  readonly modelled: boolean;
}

/** Client-side: a `WireTurn` back into something the renderers accept. */
export function reviveTurn(turn: WireTurn): {
  reply: string;
  artifact?: Artifact;
  tool: string;
  modelled: boolean;
} {
  return {
    reply: turn.reply,
    ...(turn.artifact ? { artifact: fromWire(turn.artifact) as Artifact } : {}),
    tool: turn.tool,
    modelled: turn.modelled,
  };
}

/**
 * The context rail's payload, revived.
 *
 * Same walk as `reviveTurn`, different envelope. The rail holds artifacts too
 * (tapping a row reopens one without a second model call), so its money needs
 * the identical treatment — one conversion, at the edge.
 */
export function reviveContext(raw: unknown): unknown {
  return fromWire(raw);
}
