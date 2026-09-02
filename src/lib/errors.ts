/**
 * One error shape across every boundary (docs/01 §10).
 *
 * Agents and humans both write more consistent code when there is exactly one
 * way to fail. Never throw a bare Error from application code.
 */

export type AppError =
  | { kind: 'VALIDATION'; field: string; message: string }
  | { kind: 'AUTHZ'; message: string }
  | { kind: 'NOT_FOUND'; resource: string }
  | { kind: 'CONFLICT'; message: string }
  | { kind: 'INSUFFICIENT'; available: bigint; required: bigint }
  | {
      kind: 'UPSTREAM';
      // `gemini` is A11 in docs/11 — ADR-0012's documented fallback, and the
      // only LLM that can serve a request while GROQ_API_KEY is empty.
      provider: 'momo' | 'telegram' | 'groq' | 'gemini' | 'elevenlabs';
      retryable: boolean;
      status?: number;
    }
  | { kind: 'INTERNAL'; cause: unknown };

export class AppException extends Error {
  constructor(readonly error: AppError) {
    super(describe(error));
    this.name = 'AppException';
  }
}

export function describe(e: AppError): string {
  switch (e.kind) {
    case 'VALIDATION':
      return `${e.field}: ${e.message}`;
    case 'AUTHZ':
      return e.message;
    case 'NOT_FOUND':
      return `${e.resource} not found`;
    case 'CONFLICT':
      return e.message;
    case 'INSUFFICIENT':
      return `insufficient funds: have ${e.available}, need ${e.required}`;
    case 'UPSTREAM':
      return `${e.provider} failed${e.status ? ` (${e.status})` : ''}`;
    case 'INTERNAL':
      return 'internal error';
  }
}

/** HTTP status for an error. Keeps route handlers free of mapping logic. */
export function httpStatus(e: AppError): number {
  switch (e.kind) {
    case 'VALIDATION':
      return 400;
    case 'AUTHZ':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'INSUFFICIENT':
      return 422;
    case 'UPSTREAM':
      return 502;
    case 'INTERNAL':
      return 500;
  }
}

/**
 * Safe for a user to read. Never leaks a key, a token, or a full MSISDN —
 * POPIA s105/106 (docs/14 §5).
 */
export function userMessage(e: AppError): string {
  switch (e.kind) {
    case 'VALIDATION':
      return e.message;
    case 'AUTHZ':
      return 'You do not have access to that.';
    case 'NOT_FOUND':
      return 'We could not find that.';
    case 'CONFLICT':
      return 'That was already done.';
    case 'INSUFFICIENT':
      return 'There is not enough in your wallet for that.';
    case 'UPSTREAM':
      return 'The payment network is slow right now. We will keep trying.';
    case 'INTERNAL':
      return 'Something went wrong on our side.';
  }
}

export const fail = (error: AppError): never => {
  throw new AppException(error);
};
