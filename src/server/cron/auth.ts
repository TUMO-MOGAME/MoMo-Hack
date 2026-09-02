/**
 * Cron authorisation (A5 §3).
 *
 * An unauthenticated cron route lets anyone trigger settlement, which A5 grades
 * **High**. GitHub Actions is the only caller (ADR-0006) and it holds
 * `CRON_SECRET`.
 *
 * This lives here rather than in the route file because a Next.js route module
 * may only export the HTTP method handlers and a fixed set of config values —
 * exporting a helper from it fails the build. Which is convenient, because a
 * security primitive is easier to test as a module anyway.
 */

/**
 * Constant-time compare.
 *
 * A naive `===` on a secret leaks its length and prefix through timing. It is
 * six lines to not have that conversation with an auditor.
 */
export function secretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** `Authorization: Bearer <CRON_SECRET>`, and nothing else. */
export function isAuthorisedCron(request: Request, expected = process.env.CRON_SECRET): boolean {
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  return secretMatches(bearer, expected);
}
