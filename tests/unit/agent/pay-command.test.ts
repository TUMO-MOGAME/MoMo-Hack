/**
 * ⚠️ THE ONLY PATH IN THIS PRODUCT THAT CAN START A PAYMENT.
 *
 * `/pay` is the first thing ever built here that reaches `initiateCollection`
 * from a deployed route — until now its only callers were tests. So the
 * properties that keep it safe are asserted rather than described:
 *
 *   1. It is a COMMAND. Free text that merely sounds like a payment still
 *      reaches the agent, which refuses (MISTAKES.md M10). A model cannot
 *      trigger this path by choosing to.
 *   2. The payee is CONFIGURATION. Nothing a user types can redirect a payment
 *      request at a phone number of their choosing — which is the difference
 *      between a demo and a machine for harassing strangers over MTN's network.
 *   3. It is BOUNDED, twice: the live budget guard, and a lower demo ceiling.
 *   4. Its replies never claim money moved. MTN accepting a *request* is not a
 *      payment, and the payer can still decline.
 */

import { describe, expect, test, vi } from 'vitest';
import {
  DEMO_MAX_MINOR,
  hasExtraArguments,
  parsePayAmount,
  requestDemoPayment,
} from '@/server/momo/demo-collect';
import { payReply } from '@/server/momo/pay-replies';
import { handleUpdate, parseCommand } from '@/server/telegram/handle';
import { parseChatIds, readPayAllowlist } from '@/lib/telegram/config';
import { minor } from '@/domain/money';

describe('parsing the amount', () => {
  test.each([
    ['/pay 0.20', 20n],
    ['/pay R0.20', 20n],
    ['/pay 12.50', 1250n],
    ['/pay 1', 100n],
    ['0.05', 5n],
  ])('%j → %s minor units', (text, expected) => {
    expect(parsePayAmount(text.replace(/^\/pay/i, ''))).toBe(expected);
  });

  test.each(['/pay', '/pay abc', '/pay -1', '/pay 0.001'])('%j has no amount', (text) => {
    expect(parsePayAmount(text.replace(/^\/pay/i, ''))).toBeNull();
  });

  describe('a phone number is never mistaken for an amount', () => {
    // A REAL user typed `/pay 0.2 0767221345` — "pay this much to this number",
    // the obvious thing to type. The first parser anchored to the END of the
    // string and matched the PHONE NUMBER, reporting
    // "R7 672 213.45 is over the R5.00 demo ceiling".
    //
    // The ceiling caught it. That was LUCK. `/pay 0.20 300` would have parsed as
    // R3.00 and charged it — someone who typed an amount and a reference would
    // be billed the reference.
    test.each(['/pay 0.2 0767221345', '/pay 0.20 300', '/pay 0.20 to 0761234567', '/pay 5 5'])(
      '%j is refused outright, not resolved to one of its numbers',
      (text) => {
        const args = text.replace(/^\/pay/i, '');
        expect(hasExtraArguments(args)).toBe(true);
        expect(parsePayAmount(args)).toBeNull();
      },
    );

    test('the refusal explains that the payee is configuration', async () => {
      const reply = await payReply('/pay 0.20 0767221345', 'test');
      expect(reply).toMatch(/just the amount/i);
      expect(reply).toMatch(/server config|number you type/i);
      // And it must not read as though a payment were attempted. "approve"
      // appears legitimately in the explanation of what /pay does, so the
      // assertion is on the claims that would mislead — a request having been
      // sent, or a ceiling having been hit by a number that was never an amount.
      expect(reply).not.toMatch(/request sent|ceiling|check your phone/i);
    });
  });
});

describe('the payee can never come from user input', () => {
  test('with no MOMO_DEMO_MSISDN configured, it refuses rather than guessing', async () => {
    const result = await requestDemoPayment(minor(20n), 'test', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no payer number/i);
  });

  test('a number in the message does not become the payee', async () => {
    // The whole message is discarded before this point — `requestDemoPayment`
    // takes an AMOUNT and a channel, and has no parameter for a destination.
    // This asserts the shape of the API, which is the actual control: there is
    // no argument through which a typed number could arrive.
    expect(requestDemoPayment.length).toBeLessThanOrEqual(3);
    const result = await requestDemoPayment(minor(20n), 'test', {});
    expect(result.ok).toBe(false);
  });
});

describe('it is bounded', () => {
  const env = { MOMO_DEMO_MSISDN: '27000000000' };

  test('refuses more than the demo ceiling, before any network call', async () => {
    const result = await requestDemoPayment(minor(DEMO_MAX_MINOR + 1n), 'test', env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ceiling|real money/i);
  });

  test('refuses zero', async () => {
    const result = await requestDemoPayment(minor(0n), 'test', env);
    expect(result.ok).toBe(false);
  });

  test('a negative amount cannot be constructed at all', () => {
    // Stronger than a refusal inside `requestDemoPayment`, and worth asserting
    // where someone will see it: `minor()` throws, so a negative payment is not
    // something the payment path has to defend against — it is unrepresentable.
    // This test was written expecting a refusal and found a guarantee.
    expect(() => minor(-100n)).toThrow(RangeError);
  });
});

describe('the Telegram command routing', () => {
  const chat = { id: 42, type: 'private' as const };
  const update = (text: string) => ({
    update_id: 1,
    message: { message_id: 1, date: 0, chat, text },
  });

  /**
   * The money capability is ONE value (`MoneyCommands`, M5d), so this helper
   * builds it as one. A test can no more wire `/pay` without an allowlist than
   * the route can — which is the entire point of bundling them.
   *
   * `allowlist` defaults to the chat these updates come from, so the tests that
   * are about ROUTING stay about routing. The tests that are about the
   * allowlist pass their own.
   */
  function deps(money?: {
    pay?: (text: string) => Promise<string>;
    status?: () => Promise<string>;
    allowlist?: ReadonlySet<number>;
  }) {
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
        agent: { reply: vi.fn(async () => 'agent answered') },
        ...(money
          ? {
              money: {
                allowlist: money.allowlist ?? new Set([chat.id]),
                pay: money.pay ?? (async () => 'pay was not expected in this test'),
                status: money.status ?? (async () => 'status was not expected in this test'),
              },
            }
          : {}),
      },
    };
  }

  test('/pay reaches the pay handler and never the model', async () => {
    const pay = vi.fn(async (_text: string) => 'request sent');
    const { deps: d, sent } = deps({ pay });

    const outcome = await handleUpdate(d as any, update('/pay 0.20') as any);

    expect(pay).toHaveBeenCalledOnce();
    // The WHOLE message reaches the handler, so the amount is parsed in one
    // place rather than twice with two chances to disagree.
    expect(pay).toHaveBeenCalledWith('/pay 0.20');
    expect(d.agent.reply).not.toHaveBeenCalled();
    expect(sent).toContain('request sent');
    expect(outcome).toEqual({ kind: 'replied', source: 'command' });
  });

  test('/status reaches the status handler and never the model', async () => {
    const status = vi.fn(async () => 'settled');
    const { deps: d, sent } = deps({ status });

    await handleUpdate(d as any, update('/status') as any);

    expect(status).toHaveBeenCalledOnce();
    expect(d.agent.reply).not.toHaveBeenCalled();
    expect(sent).toContain('settled');
  });

  test('with no pay handler injected, it says so instead of erroring', async () => {
    // The default. `handleUpdate` never imports the payment path, so a contract
    // test cannot accidentally reach MTN — the capability arrives only from the
    // route that wires it.
    const { deps: d, sent } = deps();

    await handleUpdate(d as any, update('/pay 0.20') as any);
    expect(sent.join(' ')).toMatch(/not switched on/i);
  });

  test('free text that sounds like a payment still goes to the agent', async () => {
    // The M10 regression, from the Telegram side. "send money to 076…" must NOT
    // reach the payment path — only a literal /pay command does.
    const pay = vi.fn(async () => 'request sent');
    const { deps: d } = deps({ pay });

    await handleUpdate(d as any, update('send money to this person 0761346606') as any);

    expect(pay).not.toHaveBeenCalled();
    expect(d.agent.reply).toHaveBeenCalledOnce();
  });

  test('the command parser strips a group @mention', () => {
    expect(parseCommand('/pay@momokasi_demo_bot 0.20')).toBe('pay');
    expect(parseCommand('/status@momokasi_demo_bot')).toBe('status');
  });
});

/**
 * ⚠️ M5d — THE ALLOWLIST. The gate between a public bot and a real phone.
 *
 * `@momokasi_demo_bot` is public and, from the production deploy, holds
 * production MoMo credentials. Every test here is about one question: can
 * somebody who is not us make this bot ring Tumo's handset?
 *
 * The cases are chosen so that the DANGEROUS direction is the one under test.
 * "An allowed chat can pay" failing is a broken demo. "A stranger cannot pay"
 * failing is the incident, so it gets the plural, the group id, the empty
 * config and the missing config.
 */
describe('the pay allowlist (M5d)', () => {
  const update = (text: string, chatId: number) => ({
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: 1, date: 0, chat: { id: chatId, type: 'private' as const }, text },
  });

  function wire(allowlist: ReadonlySet<number>) {
    const sent: string[] = [];
    const pay = vi.fn(async () => 'REQUEST SENT — this must not appear for a denied chat');
    const status = vi.fn(async () => 'LEDGER READ — this must not appear for a denied chat');
    return {
      sent,
      pay,
      status,
      deps: {
        telegram: {
          sendMessage: vi.fn(async ({ text }: { text: string }) => {
            sent.push(text);
            return undefined as never;
          }),
          sendChatAction: vi.fn(async () => undefined as never),
        },
        agent: { reply: vi.fn(async () => 'agent answered') },
        money: { allowlist, pay, status },
      },
    };
  }

  describe('parseChatIds', () => {
    test('an unset variable is nobody, not everybody', () => {
      // THE most important assertion in this file. If this ever returns a set
      // that `.has()` anything, a deploy that forgets the variable opens the
      // bot to the world.
      expect(parseChatIds(undefined).size).toBe(0);
      expect(parseChatIds('').size).toBe(0);
      expect(parseChatIds('   ').size).toBe(0);
      expect(parseChatIds(',,').size).toBe(0);
    });

    test('reads one id, several ids, and tolerates the spacing people type', () => {
      expect([...parseChatIds('123')]).toEqual([123]);
      expect([...parseChatIds('123,456')]).toEqual([123, 456]);
      expect([...parseChatIds('123, 456')]).toEqual([123, 456]);
      expect([...parseChatIds(' 123 , 456 ')]).toEqual([123, 456]);
      expect([...parseChatIds('123 456')]).toEqual([123, 456]);
    });

    test('keeps negative ids, because that is what a Telegram group is', () => {
      // A parser written as /^\d+$/ passes every other test in this block and
      // silently drops every group chat.
      expect(parseChatIds('-1001234567890').has(-1001234567890)).toBe(true);
      expect([...parseChatIds('42,-1001234567890')]).toEqual([42, -1001234567890]);
    });

    test('drops a malformed entry without dropping the good ones', () => {
      expect([...parseChatIds('123,abc,456')]).toEqual([123, 456]);
      expect([...parseChatIds('12.5,7')]).toEqual([7]);
      expect([...parseChatIds('<your chat id>,7')]).toEqual([7]);
    });

    test('a garbage-only value denies everyone rather than throwing', () => {
      // Read on the request path. A throw here is a webhook that 500s on every
      // update, which Telegram then retries thousands of times.
      expect(() => parseChatIds('abc')).not.toThrow();
      expect(parseChatIds('abc').size).toBe(0);
    });

    test('reads the variable by its documented name', () => {
      expect(readPayAllowlist({ TELEGRAM_PAY_CHAT_IDS: '42' }).has(42)).toBe(true);
      expect(readPayAllowlist({}).size).toBe(0);
    });
  });

  describe('a chat that is not on the list', () => {
    test('/pay never reaches the payment handler', async () => {
      const w = wire(new Set([42]));

      const outcome = await handleUpdate(w.deps as any, update('/pay 1.00', 999) as any);

      expect(w.pay).not.toHaveBeenCalled();
      expect(outcome).toEqual({ kind: 'replied', source: 'denied' });
    });

    test('/status never reaches the ledger', async () => {
      // Gated too: /status drives the reconciler and reads out somebody else's
      // amount and split. Neither belongs to a stranger.
      const w = wire(new Set([42]));

      const outcome = await handleUpdate(w.deps as any, update('/status', 999) as any);

      expect(w.status).not.toHaveBeenCalled();
      expect(outcome).toEqual({ kind: 'replied', source: 'denied' });
    });

    test('is told plainly that nothing was sent or charged', async () => {
      const w = wire(new Set([42]));

      await handleUpdate(w.deps as any, update('/pay 1.00', 999) as any);

      const reply = w.sent.join('\n');
      // The M10 rule, applied to a refusal: never leave it ambiguous whether
      // money moved.
      expect(reply).toMatch(/nothing was sent/i);
      expect(reply).toMatch(/nothing was charged/i);
      // And the operator's fix path is in the message.
      expect(reply).toContain('999');
    });

    test('the @botname suffix does not slip past the gate', async () => {
      // `/pay@momokasi_demo_bot` is what Telegram delivers in a GROUP — the
      // exact place an outsider is most likely to find the bot.
      const w = wire(new Set([42]));

      await handleUpdate(w.deps as any, update('/pay@momokasi_demo_bot 1.00', 999) as any);
      expect(w.pay).not.toHaveBeenCalled();
    });

    test('an empty allowlist denies the whole world, including chat 0', async () => {
      const w = wire(new Set());
      for (const chatId of [0, 42, -1001234567890, 999]) {
        await handleUpdate(w.deps as any, update('/pay 1.00', chatId) as any);
      }
      expect(w.pay).not.toHaveBeenCalled();
    });

    test('can still use the rest of the bot', async () => {
      // A denial is scoped to money. Turning a stranger away from `/pay` must
      // not turn the product into a brick for them — the read-only assistant
      // is the part we actually want people to try.
      const w = wire(new Set([42]));

      const outcome = await handleUpdate(w.deps as any, update('how do stokvels work', 999) as any);

      expect(outcome).toEqual({ kind: 'replied', source: 'agent' });
      expect(w.deps.agent.reply).toHaveBeenCalledOnce();
    });
  });

  describe('/send is gated by the same list (M3a)', () => {
    function wireSend(allowlist: ReadonlySet<number>, withSend = true) {
      const sent: string[] = [];
      const send = vi.fn(async () => 'PAYOUT SENT — must not appear for a denied chat');
      return {
        sent,
        send,
        deps: {
          telegram: {
            sendMessage: vi.fn(async ({ text }: { text: string }) => {
              sent.push(text);
              return undefined as never;
            }),
            sendChatAction: vi.fn(async () => undefined as never),
          },
          agent: { reply: vi.fn(async () => 'agent answered') },
          money: {
            allowlist,
            pay: async () => 'pay',
            status: async () => 'status',
            ...(withSend ? { send } : {}),
          },
        },
      };
    }

    test('a chat not on the list can never pay OUT', async () => {
      // The worst case in the product. A collection a stranger triggers asks a
      // human who declines; a payout a stranger triggers is our money, gone.
      const w = wireSend(new Set([42]));

      const outcome = await handleUpdate(w.deps as any, update('/send 0.10', 999) as any);

      expect(w.send).not.toHaveBeenCalled();
      expect(outcome).toEqual({ kind: 'replied', source: 'denied' });
    });

    test('the @botname form does not slip past it either', async () => {
      const w = wireSend(new Set([42]));

      await handleUpdate(w.deps as any, update('/send@momokasi_demo_bot 0.10', 999) as any);
      expect(w.send).not.toHaveBeenCalled();
    });

    test('an allowed chat reaches the payout handler with the whole message', async () => {
      const w = wireSend(new Set([42]));

      await handleUpdate(w.deps as any, update('/send 0.10', 42) as any);
      expect(w.send).toHaveBeenCalledWith('/send 0.10');
    });

    test('with payouts not wired, an allowed chat is told so plainly', async () => {
      const w = wireSend(new Set([42]), false);

      await handleUpdate(w.deps as any, update('/send 0.10', 42) as any);
      expect(w.sent.join(' ')).toMatch(/paying out is not switched on/i);
    });

    test('a DENIED chat is never told which capabilities exist', async () => {
      // The allowlist is checked BEFORE the capability check, so an outsider
      // learns only that they may not spend money — not whether this
      // deployment can pay out at all.
      const w = wireSend(new Set([42]), false);

      await handleUpdate(w.deps as any, update('/send 0.10', 999) as any);
      expect(w.sent.join(' ')).not.toMatch(/not switched on/i);
      expect(w.sent.join(' ')).toMatch(/nothing was sent/i);
    });

    test('free text that sounds like a payout still goes to the agent', async () => {
      // M10, on the payout side. Only a literal /send command pays anyone.
      const w = wireSend(new Set([42]));

      await handleUpdate(w.deps as any, update('please send me 0.10', 42) as any);

      expect(w.send).not.toHaveBeenCalled();
      expect(w.deps.agent.reply).toHaveBeenCalledOnce();
    });
  });

  describe('a chat that is on the list', () => {
    test('/pay works exactly as before', async () => {
      const w = wire(new Set([42, 999]));

      const outcome = await handleUpdate(w.deps as any, update('/pay 0.20', 42) as any);

      expect(w.pay).toHaveBeenCalledWith('/pay 0.20');
      expect(outcome).toEqual({ kind: 'replied', source: 'command' });
    });

    test('a group on the list works, negative id and all', async () => {
      const w = wire(new Set([-1001234567890]));

      await handleUpdate(w.deps as any, update('/status', -1001234567890) as any);
      expect(w.status).toHaveBeenCalledOnce();
    });
  });
});
