import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ABOUT_TEXT, cannedReply, CANNED_COMMANDS, helpText } from '@/lib/agent/persona';
import { handleUpdate } from '@/server/telegram/handle';

/**
 * BOTH CHANNELS SAY THE SAME THING.
 *
 * `docs/13` states this as a property of the product, and it was true of
 * `/pay`, `/status` and `/send` — they share `pay-replies.ts`. It was NOT true
 * of `/help`, `/about` and `/start`, which lived in a private map inside the
 * Telegram handler. Typing `/help` in the web chat sent it to the model as
 * ordinary text and got whatever Gemini felt like saying that turn.
 *
 * That is the failure mode parity always has: it holds for the paths someone
 * remembered to share, and quietly does not for the rest. So the assertion here
 * is not "the wiring exists" but "the same function answers both".
 */

const chatPage = readFileSync(
  fileURLToPath(new URL('../../../src/app/(app)/chat/page.tsx', import.meta.url)),
  'utf8',
);
const payRoute = readFileSync(
  fileURLToPath(new URL('../../../src/app/api/pay/route.ts', import.meta.url)),
  'utf8',
);

function update(text: string) {
  const id = Math.floor(Math.random() * 1e9);
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 6975972975, type: 'private' },
      from: { id: 6975972975, is_bot: false, first_name: 'Tumo' },
      text,
    },
  };
}

function wire() {
  const sent: string[] = [];
  return {
    sent,
    deps: {
      telegram: {
        sendMessage: vi.fn(async ({ text }: { text: string }) => {
          sent.push(text);
          return undefined as never;
        }),
        sendChatAction: vi.fn(async () => undefined as never),
      },
      agent: { reply: vi.fn(async () => 'THE MODEL ANSWERED — it must not, for a canned command') },
      money: { allowlist: new Set<number>(), pay: vi.fn(), status: vi.fn() },
    },
  };
}

describe('the canned commands come from one source', () => {
  test.each([...CANNED_COMMANDS])('/%s resolves to text', (command) => {
    expect(cannedReply(command)).toBeTruthy();
  });

  test('an unknown command is not canned, so it falls through to the real handler', () => {
    // The bug this prevents is `/pay` being swallowed as canned text and never
    // reaching the money path.
    for (const command of ['pay', 'status', 'send', 'wallet', '']) {
      expect(cannedReply(command)).toBeNull();
    }
  });

  test('help and start are the same text; about is its own', () => {
    expect(cannedReply('help')).toBe(cannedReply('start'));
    expect(cannedReply('about')).toBe(ABOUT_TEXT);
    expect(cannedReply('help')).not.toBe(ABOUT_TEXT);
  });

  test('it is CASE-insensitive, because people type /Help', () => {
    expect(cannedReply('HELP')).toBe(cannedReply('help'));
  });
});

describe('Telegram answers them without calling the model', () => {
  test.each([...CANNED_COMMANDS])('/%s is canned, not modelled', async (command) => {
    const w = wire();

    await handleUpdate(w.deps as never, update(`/${command}`) as never);

    expect(w.deps.agent.reply).not.toHaveBeenCalled();
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toBe(cannedReply(command));
  });

  test('the reply is the CURRENT environment, not the one at module load', async () => {
    // This deployment went from sandbox to production while running. A canned
    // map built at import would have gone on saying "test money" afterwards.
    vi.stubEnv('MOMO_TARGET_ENVIRONMENT', 'mtnsouthafrica');
    const w = wire();
    await handleUpdate(w.deps as never, update('/help') as never);
    expect(w.sent[0]).toMatch(/production/i);
    expect(w.sent[0]).not.toMatch(/test money/i);
    vi.unstubAllEnvs();
  });
});

describe('the web chat routes them to the same place', () => {
  test('the client sends every canned command to /api/pay', () => {
    // Source assertions, because the alternative is a browser. The failure they
    // catch is real and silent: a command missing from this regex reaches the
    // model instead, and the user gets a plausible improvisation.
    for (const command of CANNED_COMMANDS) {
      expect(chatPage).toMatch(new RegExp(`\\\\/\\(pay\\|status\\|send[^)]*${command}`));
    }
  });

  test('the route answers them from cannedReply, not from its own copy', () => {
    expect(payRoute).toContain('cannedReply(');
    // A second copy of the text in the route is how the two drift apart again.
    expect(payRoute).not.toContain('Sawubona!');
    expect(payRoute).not.toContain('hackathon submission');
  });

  test('canned commands are answered BEFORE the payment dispatch', () => {
    // `/help` must never fall into the `/pay` branch, and the ordering is the
    // thing that guarantees it.
    expect(payRoute.indexOf('cannedReply(')).toBeLessThan(
      payRoute.indexOf('not a payment command'),
    );
  });
});

describe('the help text tells the truth about this build', () => {
  test('it names the commands that actually exist', () => {
    const text = helpText({ MOMO_TARGET_ENVIRONMENT: 'sandbox' });
    for (const command of ['/help', '/about', '/pay', '/status']) {
      expect(text).toContain(command);
    }
  });

  test('it does not claim the agent can move money, in either environment', () => {
    for (const env of ['sandbox', 'mtnsouthafrica']) {
      const text = helpText({ MOMO_TARGET_ENVIRONMENT: env });
      expect(text).toMatch(/can'?t\s+move money myself/i);
    }
  });
});
