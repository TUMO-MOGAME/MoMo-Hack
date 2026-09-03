/**
 * ⚠️ THE LANGUAGE DIRECTIVE MUST BE WIRED IN, NOT MERELY PRESENT.
 *
 * ── WHY THIS FILE IS NOT OPTIONAL ────────────────────────────────────────────
 *
 * Every other guard in this repo fires on something going wrong. This one fires
 * on something going *quiet*.
 *
 * If an edit drops `${LANGUAGE_DIRECTIVE}` out of `SYSTEM_PROMPT`, nothing
 * throws. Typecheck passes — the constant is still imported and still exists.
 * Lint passes. The build passes. Every existing test passes, because they all
 * assert on English input and English output. The product simply starts
 * answering every isiZulu, Setswana and Afrikaans message in English.
 *
 * And we would not hear about it. The users that failure lands on are the least
 * likely of anyone to open a GitHub issue about it; they conclude the app is not
 * for them and stop typing. `docs/12` §2 makes a public claim about eleven
 * languages, and until this file existed that claim was carried by a template
 * literal that nothing checked.
 *
 * So: assert the WIRING. "The constant is defined" is not the property that
 * matters — `expect(LANGUAGE_DIRECTIVE).toBeTruthy()` would pass on a product
 * that never sends it anywhere.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DOMAIN_VOCAB,
  EVAL_VERIFIED,
  FALLBACK_LANGUAGE,
  LANGUAGES,
  LANGUAGE_DIRECTIVE,
  MACHINE_LITERALS,
} from '@/lib/agent/language';
import { SYSTEM_PROMPT } from '@/lib/agent/persona';
import { EVAL_MESSAGES } from '../../eval/language/fixtures';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

describe('the directive says what it has to say', () => {
  // Built from LANGUAGES rather than a literal list, so adding a twelfth
  // language to the array fails here until it is named in the prose. The array
  // is deliberately NOT interpolated into the directive — if it were, this
  // assertion would be checking that a template literal contains its own
  // inputs, which is true no matter what the model is actually told.
  test.each(LANGUAGES)('it names %s', (language) => {
    expect(LANGUAGE_DIRECTIVE).toContain(language);
  });

  test('it is a rule about mirroring, not a list of supported languages', () => {
    expect(LANGUAGE_DIRECTIVE).toMatch(/SAME language the user writes to you in/i);
    // A picker is the thing this feature exists instead of.
    expect(LANGUAGE_DIRECTIVE).toMatch(/code-switch/i);
  });

  test('it forbids correcting or announcing the language choice', () => {
    // Correction reads as judgement, and "I see you are writing in isiZulu!" is
    // the tell of a product that treats a language as a mode rather than as how
    // someone talks.
    expect(LANGUAGE_DIRECTIVE).toMatch(/never ["“]?correct["”]?/i);
    expect(LANGUAGE_DIRECTIVE).toMatch(/never comment on or announce/i);
  });

  test(`it falls back to ${FALLBACK_LANGUAGE} when there is nothing to mirror`, () => {
    expect(LANGUAGE_DIRECTIVE).toMatch(
      new RegExp(`ambiguous[\\s\\S]*written nothing[\\s\\S]*${FALLBACK_LANGUAGE}`, 'i'),
    );
  });

  test('it says the substance does not change with language', () => {
    // THE WHOLE POINT. Mirroring the language while quietly giving a shorter,
    // vaguer, more hedged answer is a worse product than answering in English,
    // because it looks like it worked.
    expect(LANGUAGE_DIRECTIVE).toMatch(/substance never changes with language/i);
    expect(LANGUAGE_DIRECTIVE).toMatch(/reasoning[\s\S]*identical/i);
  });
});

describe('the three carve-outs', () => {
  // 1. DOMAIN VOCABULARY STAYS PUT.
  test.each(DOMAIN_VOCAB)('%s is named as staying in English', (term) => {
    expect(LANGUAGE_DIRECTIVE).toContain(term);
  });

  test('the carve-out says which language they stay in', () => {
    expect(LANGUAGE_DIRECTIVE).toMatch(new RegExp(`KEEP THESE IN ${FALLBACK_LANGUAGE}`, 'i'));
  });

  // 2. MACHINE-PARSED STRUCTURE NEVER TRANSLATES.
  //
  // The highest-severity failure available here, and the only silent one: a
  // translated literal breaks a parser while the user still reads a perfectly
  // good answer, so the symptom never points at the cause.
  test.each(MACHINE_LITERALS)('the machine-read literal %s is pinned', (literal) => {
    expect(LANGUAGE_DIRECTIVE).toContain(literal);
  });

  test('the pinned commands are the commands the bot actually parses', () => {
    // MACHINE_LITERALS drifting from the real command table is how this carve-out
    // rots: the directive keeps pinning `/pay` long after the handler stopped
    // caring, and stops pinning the one it added last week.
    const handler = read('src/server/telegram/handle.ts');
    for (const command of MACHINE_LITERALS.filter((l) => l.startsWith('/'))) {
      expect(handler, `${command} is pinned in the directive`).toContain(command.slice(1));
    }
  });

  test('the pinned status words are the terminal states the ledger uses', () => {
    const replies = read('src/server/momo/pay-replies.ts');
    expect(replies).toContain('PAYER_NOT_FOUND');
    for (const status of ['SUCCESSFUL', 'FAILED', 'REJECTED', 'TIMEOUT']) {
      expect(MACHINE_LITERALS).toContain(status);
    }
  });

  // 3. VERBATIM CONTENT IS NEVER TRANSLATED.
  test('quotes and echoed user text are explicitly never translated', () => {
    expect(LANGUAGE_DIRECTIVE).toMatch(/NEVER TRANSLATE SOMEONE'S OWN WORDS/i);
    expect(LANGUAGE_DIRECTIVE).toMatch(
      /do not clean it up.*do not\s*summarise it.*do not\s*translate it/is,
    );
    // LEDGER DATA is named specifically: `grounding()` puts real amounts and real
    // labels in front of the model, and a translated label beside a real number
    // is a card and a sentence disagreeing with each other.
    expect(LANGUAGE_DIRECTIVE).toContain('LEDGER DATA');
  });
});

describe('it is wired into every prompt a user can see', () => {
  test('SYSTEM_PROMPT actually contains the directive', () => {
    // ⚠️ THE LOAD-BEARING ASSERTION OF THIS ENTIRE FILE.
    //
    // Not "persona.ts imports it" — an unused import is still a valid import.
    // This compares the composed prompt against the constant, so dropping the
    // interpolation fails here and nowhere else.
    expect(SYSTEM_PROMPT).toContain(LANGUAGE_DIRECTIVE);
  });

  test('persona.ts imports it from the one module', () => {
    expect(read('src/lib/agent/persona.ts')).toMatch(
      /import \{ LANGUAGE_DIRECTIVE \} from '\.\/language'/,
    );
  });

  test('every model call site carries SYSTEM_PROMPT', () => {
    // A NEW prompt is the way this regresses. Somebody adds a second provider, a
    // summariser, a sub-agent whose raw output is rendered into the artifact
    // panel — and it ships with no directive, so half the product mirrors and
    // half of it answers in English.
    //
    // So: find every file that builds a request to a model, and require it to
    // route through the single prompt. This fails loudly on a new call site
    // rather than waiting for someone to notice the output.
    const callSites = walk('src').filter((f) =>
      /system_instruction|:generateContent/.test(read(f)),
    );

    expect(callSites, 'no model call site found — this test has stopped testing').not.toHaveLength(
      0,
    );

    for (const file of callSites) {
      expect(read(file), `${file} builds a model request without SYSTEM_PROMPT`).toContain(
        'SYSTEM_PROMPT',
      );
    }
  });

  test('there is exactly one copy of the language rule', () => {
    // The old two-liner in VOICE was removed rather than left beside the module.
    // Two copies always drift: one gets tuned and the other does not, and the
    // user gets their own language in chat and English everywhere else.
    const persona = read('src/lib/agent/persona.ts');
    expect(persona).not.toMatch(/Match the user's language and register/);

    // And the directive appears once in the composed prompt, not twice — a
    // second interpolation is the same drift risk wearing a different hat.
    expect(SYSTEM_PROMPT.split('LANGUAGE — MIRROR, DO NOT ASK')).toHaveLength(2);
  });

  test('docs/12 §4.2 and persona.ts VOICE still agree after the language lines moved out', () => {
    // `refusal.test.ts` owns this comparison. It is repeated here because THIS
    // change is the one that edited both sides of it, and a reviewer reading
    // this file should see that the doc moved with the code rather than having
    // to take it on trust.
    const section =
      read('docs/12-VOICE-AND-CONVERSATIONAL-AI.md')
        .split(/^### 4\.2 /m)[1]
        ?.split(/^### 4\.2a /m)[0] ?? '';
    const fromDoc = section.split('```')[1]?.trim();
    const fromCode = read('src/lib/agent/persona.ts')
      .split('const VOICE = `')[1]
      ?.split('`;')[0]
      ?.trim();

    expect(fromDoc, 'the fenced prompt in docs/12 §4.2').toBeTruthy();
    expect(fromCode, 'the VOICE template literal in persona.ts').toBeTruthy();
    expect(fromCode).toBe(fromDoc);
    expect(fromDoc).not.toMatch(/Match the user's language and register/);
  });
});

describe('the deterministic layers were audited, and the decision is written down', () => {
  // Step 6 of the brief, and the step it says gets skipped. The requirement is
  // not "extend every pattern" — it is "decide, and leave the decision where the
  // next person will read it". An undecided layer is the two-tier failure that
  // hides itself: full coverage for English, zero for everyone else, and a
  // telemetry line reporting 0% that reads as clean.
  test('the router states its language decision', () => {
    const respond = read('src/server/agent/respond.ts');
    expect(respond).toMatch(/LANGUAGE AUDIT/);
    expect(respond).toMatch(/DECISION: extend the patterns/);
  });

  test('the English-only refusal text is an ACCEPTED gap, with its consequence named', () => {
    const respond = read('src/server/agent/respond.ts');
    expect(respond).toMatch(/ACCEPTED GAP/);
    expect(respond).toMatch(/USER-VISIBLE CONSEQUENCE/);
  });

  test('routing telemetry records which language family matched', () => {
    // Without this the gap conceals itself: an unrouted isiZulu question and an
    // unrouted English one are the same log line, so "we see no non-English
    // payment requests" cannot be distinguished from "we cannot see them".
    const respond = read('src/server/agent/respond.ts');
    expect(respond).toMatch(/log\('info', 'agent\.intent', \{ intent, matched \}\)/);
  });

  test('the pay amount parser accepts the South African decimal comma', () => {
    // The language audit reaching the money path. `/pay 0,20` is a correctly
    // written twenty cents on an af-ZA keypad and used to be answered with
    // "tell me how much".
    const collect = read('src/server/momo/demo-collect.ts');
    expect(collect).toMatch(/\[\.,\]\\d\{1,2\}/);
  });
});

describe('the eval covers what we claim, and only what we claim', () => {
  test('every verified language is a language we actually declare', () => {
    for (const language of EVAL_VERIFIED) expect(LANGUAGES).toContain(language);
  });

  test('every verified language has eval fixtures', () => {
    // Ship the language support you have evidence for. A language in
    // EVAL_VERIFIED with nothing to grade is a claim with no evidence behind it,
    // which is the failure `docs/12` §2 already refuses to make about spoken
    // isiZulu.
    for (const language of EVAL_VERIFIED) {
      const messages = EVAL_MESSAGES.filter((m) => m.language === language);
      expect(
        messages.length,
        `${language} is claimed verified but has no fixtures`,
      ).toBeGreaterThan(0);
    }
  });

  test('the unverified languages are named as such in the docs', () => {
    const doc = read('docs/12-VOICE-AND-CONVERSATIONAL-AI.md');
    expect(doc).toMatch(/Declared, unverified/);
    for (const language of LANGUAGES.filter((l) => !EVAL_VERIFIED.includes(l))) {
      expect(doc, `${language} is declared but never named as unverified`).toContain(language);
    }
  });

  test('every language asks the SAME questions, so the answers are comparable', () => {
    // (c) in the grading rubric is "did the substance survive" — which can only
    // be judged against the English answer to the same question. Different
    // questions per language would make the eval unfalsifiable.
    const byLanguage = new Map<string, string[]>();
    for (const m of EVAL_MESSAGES) {
      byLanguage.set(m.language, [...(byLanguage.get(m.language) ?? []), m.id]);
    }
    const english = [...(byLanguage.get('English') ?? [])].sort();
    expect(english.length).toBeGreaterThan(0);
    for (const [language, ids] of byLanguage) {
      expect([...ids].sort(), `${language} does not ask the same questions as English`).toEqual(
        english,
      );
    }
  });
});
