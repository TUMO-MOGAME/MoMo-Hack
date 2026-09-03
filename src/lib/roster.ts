/**
 * The roster's shape and its one pure parser. **Client-safe.**
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `server/agent/roster.ts` ────────────────
 *
 * It was not, and the ADR-0010 guard in `tests/unit/ledger/single-writer.test.ts`
 * rejected it by name: `chat/page.tsx` and `people-strip.tsx` both carried
 * `import type { Person } from '@/server/agent/roster'`, and that module opens
 * the service-role Postgres connection.
 *
 * The import was `import type`, so it is erased at build and no connection
 * could ever have reached the browser. The guard does not care, and it is
 * right not to: **`import type` is one keyword away from `import`**, the
 * deletion of that keyword is invisible in review, and in a PUBLIC repository
 * the service-role key is the single most damaging thing that could leak. A
 * boundary that holds only while everyone remembers a keyword is not a
 * boundary.
 *
 * So the types live here, where a client component may import them, and
 * `server/agent/roster.ts` imports them from here too — one definition, no
 * duplication (`MISTAKES.md` M11), and the server file keeps sole possession of
 * the database call. This is the same split `@/lib/artifacts/types` already has
 * against `@/server/agent/tools`.
 */

export type KinRelation = 'MOTHER' | 'FATHER' | 'SISTER' | 'GRANDMOTHER' | 'GRANDFATHER' | 'HELPER';

export type SupportKind = 'WAGE' | 'ELECTRICITY' | 'AIRTIME';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly relation: KinRelation;
  /** What the operator sends this person. Empty for family who are not supported. */
  readonly supports: readonly SupportKind[];
  /** Minor units — cents. `null` means there is no usual amount, which is not zero. */
  readonly usualMinor: bigint | null;
  /** True while this demo has one wallet. Rendered, not assumed. */
  readonly settlesToOperatorWallet: boolean;
}

export const SUPPORT_KINDS: ReadonlySet<string> = new Set<SupportKind>([
  'WAGE',
  'ELECTRICITY',
  'AIRTIME',
]);

/**
 * `supports` arrives from Postgres as the raw literal `{AIRTIME,WAGE}`, not as
 * an array.
 *
 * node-pg parses `text[]`, but this column is `support_kind[]` — an array of a
 * CUSTOM ENUM — and pg has no registered parser for that type's OID, so it
 * returns the string Postgres printed. `.map()` on it throws, which is exactly
 * how this was found: at runtime, in the seed script, after the insert had
 * already succeeded.
 *
 * The empty case is the one that bites quietly. `'{}'` stripped of its braces
 * is `''`, and `''.split(',')` is `['']` — one blank entry that renders as a
 * support kind with no name rather than as no support at all.
 */
export function parseEnumArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  const inner = value.replace(/^\{|\}$/g, '');
  return inner === '' ? [] : inner.split(',').filter(Boolean);
}
