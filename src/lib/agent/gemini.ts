/**
 * The agent LLM (docs/11 §9a, A11).
 *
 * WHY GEMINI AND NOT GROQ. ADR-0012 picks Groq as the agent LLM with Gemini
 * Flash as the fallback on a 429. That ordering is unchanged as a decision — but
 * `GROQ_API_KEY` is present in `.env.local` and **empty**, so today Groq cannot
 * serve a single request and the documented fallback is the only path that
 * works. This module is the fallback, promoted, and the shape is deliberately
 * provider-shaped so adding Groq in front is a new module and a branch, not a
 * rewrite. Ordering returns to ADR-0012 the moment a Groq key exists.
 *
 * MODEL. `gemini-3.6-flash`, pinned. Two facts behind that, both measured
 * against the live API on 2026-09-02 rather than recalled:
 *
 *   - `gemini-2.5-flash` returns 404 for new keys — Google retired it, and the
 *     error names 3.6-flash as the replacement.
 *   - 3.6-flash is a thinking model. Left alone it spends the output budget on
 *     reasoning tokens and returns a truncated sentence. `thinkingLevel: 'low'`
 *     fixes it: ~4s and a clean `STOP`, inside the 10s Vercel Hobby ceiling that
 *     ADR-0012 §12 is worried about.
 *
 * No streaming. Telegram has no partial-message primitive worth the complexity
 * — `editMessageText` polling would cost more requests than it saves — so the
 * turn is one request and one reply.
 */

import { AppException } from '@/lib/errors';
import { SYSTEM_PROMPT } from './persona';

export type EnvBag = Record<string, string | undefined>;

export const GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** 8s: leaves ~2s of the 10s function budget to answer Telegram. */
export const DEFAULT_TIMEOUT_MS = 8000;

export interface AgentMessage {
  readonly role: 'user' | 'model';
  readonly text: string;
}

export interface AgentClient {
  reply(history: readonly AgentMessage[]): Promise<string>;
}

interface GeminiPart {
  readonly text?: string;
}

function extractText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;

  const content = (candidates[0] as { content?: { parts?: unknown } }).content;
  if (!content || !Array.isArray(content.parts)) return undefined;

  // A thinking model returns several parts; only the ones carrying `text` are
  // the answer. Join rather than take [0].
  const text = (content.parts as GeminiPart[])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return text.length > 0 ? text : undefined;
}

export function createAgentClient(env: EnvBag = process.env): AgentClient {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AppException({
      kind: 'VALIDATION',
      field: 'GEMINI_API_KEY',
      message: 'GEMINI_API_KEY is not set',
    });
  }

  return {
    async reply(history) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
              generationConfig: {
                maxOutputTokens: 800,
                temperature: 0.7,
                thinkingConfig: { thinkingLevel: 'low' },
              },
            }),
          },
        );

        if (!response.ok) {
          // The key is in the query string, so nothing about the request goes
          // into the error.
          await response.text().catch(() => '');
          throw new AppException({
            kind: 'UPSTREAM',
            provider: 'gemini',
            retryable: response.status === 429 || response.status >= 500,
            status: response.status,
          });
        }

        const text = extractText(await response.json());
        if (!text) {
          // A safety block or an empty candidate. Not retryable — the same
          // prompt produces the same block.
          throw new AppException({ kind: 'UPSTREAM', provider: 'gemini', retryable: false });
        }
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
