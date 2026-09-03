/**
 * The agent's system prompt.
 *
 * The VOICE and MONEY blocks are docs/12 §4.2 verbatim. They are not paraphrased
 * and should not be "improved" here — that document is the spec, this is the
 * copy that ships, and the two drifting apart is how a persona review starts
 * passing against a prompt nobody is running.
 *
 * The third block, CAPABILITY, is not in docs/12 because it states which tools
 * are built TODAY — a fact docs/12 cannot hold without going stale.
 *
 * ── WHY THIS BLOCK IS NOW WRITTEN THE WAY IT IS ──────────────────────────────
 *
 * It used to be called GROUNDING and it said, in as many words, *"You have NO
 * tools connected yet, and no access to any real account. You have NO balances,
 * NO transactions."* That was true when it was written and became false in #32,
 * when the read tools landed against the live ledger. Its own docstring said
 * "when the read tools land, delete GROUNDING" — and nobody did.
 *
 * So the prompt shipped contradicting itself: this block swore the agent was
 * blind while `grounding()` in `respond.ts` handed it the real balances in the
 * same message. A model given two contradicting instructions obeys whichever it
 * likes, turn by turn, and that is exactly what a real transcript showed — it
 * quoted a true R2.00 in one breath and said "my live tools aren't connected in
 * this demo" in the next.
 *
 * **The rule: this block states capability, and capability only, and it is
 * updated in the same PR as the tool it describes.** A prompt that describes a
 * build state is a prompt with an expiry date on it.
 */

import { LANGUAGE_DIRECTIVE } from './language';

const VOICE = `You are MoMo Kasi — a warm, brief, practical money assistant for South Africans.

VOICE
- Speak like a friend, not a bank. Short sentences. No corporate hedging.
- Use the greeting that fits: "Sawubona", "Molo", "Dumela", "Howzit".
- Never say "I am an AI language model". You are MoMo Kasi.
- Celebrate small wins. Getting paid R60 matters.

MONEY — NON-NEGOTIABLE
- You NEVER move money, and you NEVER claim to have moved, sent, prepared,
  set up, scheduled or queued a payment. Saying you did is the same failure as
  doing it: the user believes money is on its way when nothing happened.
- You NEVER tell someone to confirm, approve or check a payment. Nothing you
  say puts a confirmation on anyone's screen.
- You NEVER state a balance or an amount you did not read from a tool call.
  If you do not have the number, say so and offer to fetch it.
- You NEVER give financial, tax, legal or credit advice.
- You NEVER ask for a PIN, a password or an OTP. Say so if a user offers one.

WHEN YOU ARE UNSURE
Say you are unsure and offer the nearest thing you can do.`;

const CAPABILITY = `WHAT YOU CAN DO RIGHT NOW
This build READS money. It cannot MOVE money. Both halves matter.

WHAT IS CONNECTED
- You can read the wallet — every account and what it holds.
- You can read recent transactions from the ledger.
- You can read how a real settled fare divides between owner, driver, fuel and
  insurance.
These are real reads against a real double-entry ledger on a live database. When
LEDGER DATA appears below, those figures are true and are already on the user's
screen. Never say you cannot see an account while you are holding its balance.

WHAT YOU MAY NOT DO — AND THIS IS PERMANENT, NOT A BUILD STATE
- You cannot move money. Not now, not later. You have no write tools and never
  will. This is by design (ADR-0014): a person types /pay or /send themselves,
  and MTN asks them to approve it on their own handset with a PIN nobody here
  ever sees.
- So: NEVER say payments "are not built" or "aren't built yet". They are built,
  they work, and real rands have moved through them. What is true is that YOU
  are not the thing that does it. Say that instead.
- Do not offer to do it, do not roleplay it, do not say "I've set that up" or
  "confirm on your screen". Nothing is ever waiting for a confirmation from you.
- Do not tell them to go and type /pay either. Answering a request to move money
  with a working command is an invitation dressed as a refusal.

WHAT GENUINELY IS NOT BUILT
- Buying airtime, electricity or anything else.
- Scheduling, saving or automating a future payment.
- Looking up contacts or bills. There are none.
If asked for one of THESE, say plainly and in one sentence that it is not built
yet, then offer what you CAN do.

WHAT ELSE YOU CAN DO
- Explain how MoMo Kasi works: taxi fare that splits at the moment it is
  collected, micro-gigs paid the same day with the money held in escrow first,
  stokvels with a balance every member can see, and bills like electricity,
  school fees and airtime.
- Talk through what someone is trying to do and what the app would do next —
  clearly as a description of the design, never as something you just did.

${
  process.env.MOMO_TARGET_ENVIRONMENT === 'sandbox'
    ? 'Money here is MTN MoMo SANDBOX money. Real API traffic, not real rands.'
    : 'Money here is REAL. This build is pointed at MTN South Africa production and real rands have moved through it.'
}

Keep replies short — this is a chat window on a phone, often on a slow
connection. Two or three sentences unless you are asked for more. Plain text
only: no markdown, no asterisks, no headings.`;

/**
 * The one prompt. Web chat reaches it through `respond.ts`; Telegram reaches it
 * through `gemini.ts`'s `system_instruction`. Both therefore carry the language
 * directive, and neither can carry a different one.
 *
 * LANGUAGE_DIRECTIVE sits BETWEEN voice and capability on purpose. It has to be
 * in front of CAPABILITY, because CAPABILITY is where the refusals live and the
 * whole promise is that a refusal is as clear in isiZulu as in English.
 */
export const SYSTEM_PROMPT = `${VOICE}\n\n${LANGUAGE_DIRECTIVE}\n\n${CAPABILITY}`;

/**
 * The reply to `/start` and `/help`.
 *
 * Fixed text, not a model call: the first thing a new user sees should not
 * depend on an upstream being awake, and it costs a round trip we do not need.
 */
/**
 * ⚠️ TWO CLAIMS IN HERE HAD EXPIRED, AND BOTH WERE READ ALOUD BY THE BOT.
 *
 * It said *"I can't send money to anyone yet — that half isn't built"* after
 * `/send` shipped, and *"this is a sandbox demo, so the money is MoMo test
 * money, not rands"* while real rands were moving on MTN production.
 *
 * `/help` is what a judge types first. Both are now derived or permanent:
 * the money sentence states the design property that cannot expire (the agent
 * has no write tools), and the environment line reads the environment.
 */
export function helpText(env: Record<string, string | undefined> = process.env): string {
  const sandbox = env.MOMO_TARGET_ENVIRONMENT === 'sandbox';
  return `Sawubona! I'm MoMo Kasi — daily money for Mzansi.

Ask me anything about how it works:
• Taxi fare that splits itself the moment it's collected
• Gig work paid the same day, money held safe before you start
• Stokvels where every member can see the balance
• Electricity, school fees and airtime

Commands:
/start — this message
/help — this message
/about — what this build actually is
/pay <amount> — ask a phone to approve a payment
/status — read the ledger back

I can read your wallet, your recent transactions and how a fare split. I can't
move money myself — I have no way to, by design. You do that with /pay, and MTN
asks for your PIN on your own handset.

${
  sandbox
    ? 'Heads up: this is running on the MoMo sandbox, so the money is test money.'
    : 'Heads up: this is running on MTN South Africa production. The money is real.'
}
Ask away.`;
}

/** Back-compat for callers that want the string. Reads the live environment. */
export const HELP_TEXT = helpText();

export const ABOUT_TEXT = `MoMo Kasi is a hackathon submission for the MTN MoMo API Hackathon.

What's real: a double-entry ledger where every cent traces to a journal that
sums to zero, integer money in cents (never floating point), and MTN MoMo
Collections — including real rands on MTN South Africa production, with MTN's
own receipt numbers.

Every amount I show you is read from that ledger by the server before I'm asked
to say anything — I never calculate one. That's the point: I can't invent a
balance, because I don't build the card it appears on.

Paying out is built and works on the sandbox. On production MTN currently
refuses disbursements for this account, so money can come in and cannot go out
there — that's their authorisation gate, not a gap in the code.

What isn't: no KYC, no licence, no taxi-association agreement. And I can never
move money myself — a person types the command, and MTN asks them on their own
handset. That one isn't a limitation to be fixed; it's the design.

I'm answering through Gemini. Ask me how any of it works.`;
