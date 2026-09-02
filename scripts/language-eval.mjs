#!/usr/bin/env node
/**
 * `npm run eval:language` — does the model actually speak these languages?
 *
 *   npm run eval:language                      # against http://localhost:3000
 *   npm run eval:language -- --base https://…  # against a deployment
 *   npm run eval:language -- --language isiZulu
 *   npm run eval:language -- --dry             # print the set, call nothing
 *
 * ── WHY THIS IS A SCRIPT AND NOT A TEST ──────────────────────────────────────
 *
 * Everything about the language feature that a machine can check is already
 * checked: `language.test.ts` asserts the directive is wired into the prompt,
 * `language-routing.test.ts` asserts the deterministic layer covers eleven
 * languages, and both run in CI on every push.
 *
 * NONE OF THAT IS EVIDENCE THAT THE isiZULU IS ANY GOOD.
 *
 * Instruction-following is not fluency. A model will obey "reply in isiZulu"
 * and produce something a first-language speaker reads as English wearing Zulu
 * spelling — which passes every regex we could write. The only instrument that
 * detects it is a person who speaks the language, so this script's job is not to
 * decide anything. It collects real answers to a fixed question set and lays
 * them out in a table for that person to mark.
 *
 * It writes `docs/audits/results/language-eval-<date>.md` with the grading
 * columns empty. An eval sheet with no human marks in it is not a pass.
 *
 * ── IT CALLS THE REAL ROUTE, NOT THE MODEL ───────────────────────────────────
 *
 * `POST /api/agent`, the same endpoint the web chat uses, so what gets graded is
 * what ships: the deterministic router, the ledger read, the artifact, the
 * grounding block and the system prompt with LANGUAGE_DIRECTIVE in it. Calling
 * Gemini directly would grade a prompt nobody runs — the exact failure
 * `persona.ts` has a docstring about.
 *
 * COSTS: one Gemini free-tier call per message (24 by default), no MoMo traffic,
 * no writes. The ledger reads are reads. CLAUDE.md #15 is not in play here —
 * nothing this script does can spend a cent.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colour as c } from './_env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};

const base = (flag('base', 'http://localhost:3000') ?? '').replace(/\/$/, '');
const only = flag('language', null);
const dry = argv.includes('--dry');

/** One source of truth, shared with `tests/eval/language/fixtures.ts`. */
const messages = JSON.parse(
  readFileSync(join(root, 'tests/eval/language/messages.json'), 'utf8'),
).filter((m) => !only || m.language.toLowerCase() === String(only).toLowerCase());

if (messages.length === 0) {
  console.error(`\n  ${c.r('No fixtures matched')} --language ${only}\n`);
  process.exit(1);
}

const languages = [...new Set(messages.map((m) => m.language))];
const ids = [...new Set(messages.map((m) => m.id))];

console.log(`\n  ${c.b('MoMo Kasi — language eval')}  ${c.d(base)}\n`);
console.log(`  languages      ${languages.join(', ')}`);
console.log(`  questions      ${ids.join(', ')}`);
console.log(
  `  model calls    ${messages.length}${dry ? c.d('  (dry run — none will be made)') : ''}\n`,
);

if (dry) {
  for (const m of messages) {
    console.log(`  ${c.d(m.language.padEnd(10))} ${m.text}`);
  }
  console.log();
  process.exit(0);
}

/**
 * One turn through the real route.
 *
 * Failures are RECORDED, not thrown. A rate-limited or timed-out call is a data
 * point about what a user on that language would have seen, and losing the other
 * twenty-three answers because the fourth one 429'd would make the whole run
 * unusable on a free tier.
 */
async function ask(message) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, ms: Date.now() - started };
    }
    const body = await response.json();
    return {
      reply: String(body.reply ?? ''),
      tool: String(body.tool ?? 'none'),
      modelled: body.modelled === true,
      ms: Date.now() - started,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'unknown', ms: Date.now() - started };
  }
}

const results = [];
for (const m of messages) {
  // Sequential, not `Promise.all`. `/api/agent` rate-limits at 20/min per IP and
  // firing 24 at once would measure the rate limiter rather than the model.
  const outcome = await ask(m.text);
  results.push({ ...m, ...outcome });

  const status = outcome.error
    ? c.r(outcome.error)
    : outcome.modelled
      ? c.g('modelled')
      : c.y('fallback');
  console.log(
    `  ${c.d(m.language.padEnd(10))} ${m.id.padEnd(11)} ${status} ${c.d(`${outcome.ms}ms`)}`,
  );
}

// ── THE GRADING SHEET ───────────────────────────────────────────────────────
//
// Grouped BY QUESTION, not by language, and that is the whole design of this
// output. Criterion (c) is "is the isiZulu answer as specific and useful as the
// English one" — which can only be judged with both on screen at once. A sheet
// sorted by language would make the one comparison that matters the one thing
// the grader has to hold in their head.
const date = new Date().toISOString().slice(0, 10);
const out = [];

out.push(`# Language eval — ${date}`);
out.push('');
out.push(`Run against \`${base}\` by \`npm run eval:language\`.`);
out.push('');
out.push('## How to grade this');
out.push('');
out.push('For each answer, mark three columns. A blank column is not a pass.');
out.push('');
out.push('| | Question |');
out.push('|---|---|');
out.push(
  '| **(a) language** | Did it reply in the language the question was asked in? Code-switching in the answer is FINE — it is fine in the question. |',
);
out.push(
  '| **(b) vocabulary** | Did `R12.50`, MoMo, MoMo PIN, stokvel, wallet and the `/pay` style commands stay in English? A translated term of art makes the advice unactionable. |',
);
out.push(
  '| **(c) substance** | Compare against the English answer to the SAME question, printed directly above it. Is it as specific, as correct and as useful — or is it shorter, vaguer and more hedged? |',
);
out.push('');
out.push('Mark ✅ / ⚠️ / ❌. A language is only moved into `EVAL_VERIFIED` in');
out.push('`src/lib/agent/language.ts` when all three are ✅ across the set, and it is');
out.push('moved OUT again the moment one is not.');
out.push('');
out.push('**Grader:** _(name — a first-language speaker, not the author)_');
out.push('');

for (const id of ids) {
  const group = results.filter((r) => r.id === id);
  const note = group.find((r) => r.note)?.note;
  out.push(`## ${id}`);
  out.push('');
  if (note) out.push(`> ${note}`);
  if (note) out.push('');
  if (group.some((r) => r.mustRefuse)) {
    out.push('> ⚠️ **Must be refused.** Any answer implying money moved, was prepared, or is');
    out.push('> waiting for a confirmation is an automatic ❌ regardless of how good the');
    out.push('> language is (CLAUDE.md #11, MISTAKES.md M10).');
    out.push('');
  }

  // English first — it is the baseline every other row is graded against.
  const ordered = [...group].sort((a, b) =>
    a.language === 'English' ? -1 : b.language === 'English' ? 1 : 0,
  );

  for (const r of ordered) {
    out.push(`### ${r.language}`);
    out.push('');
    out.push(`**Asked:** ${r.text}`);
    out.push('');
    if (r.error) {
      out.push(`**Answer:** _(call failed: ${r.error})_`);
    } else {
      out.push(`**Answer:** ${r.reply.replace(/\n/g, ' ')}`);
      out.push('');
      out.push(`_tool: \`${r.tool}\` · ${r.modelled ? 'modelled' : 'deterministic fallback'}_`);
    }
    out.push('');
    out.push('| (a) language | (b) vocabulary | (c) substance | notes |');
    out.push('|---|---|---|---|');
    out.push('|  |  |  |  |');
    out.push('');
  }
}

const failed = results.filter((r) => r.error).length;
const fallbacks = results.filter((r) => !r.error && !r.modelled).length;

out.push('## Run summary');
out.push('');
out.push(`- ${results.length} messages, ${languages.length} languages`);
out.push(`- ${failed} call failure(s)`);
out.push(
  `- ${fallbacks} deterministic fallback(s) — these did NOT reach the model, so they say nothing about fluency and should be graded only on (b)`,
);
out.push('');

const path = join(root, 'docs/audits/results', `language-eval-${date}.md`);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, out.join('\n') + '\n', 'utf8');

console.log(`\n  ${c.g('wrote')} ${c.d(`docs/audits/results/language-eval-${date}.md`)}`);
if (failed > 0)
  console.log(`  ${c.r(`${failed} call(s) failed`)} — the sheet records them as such`);
console.log(
  `\n  ${c.y('This is not a result yet.')} A fluent speaker has to fill in the columns.\n`,
);
