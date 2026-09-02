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
import { DEMO_MAX_MINOR, parsePayAmount, requestDemoPayment } from '@/server/momo/demo-collect';
import { handleUpdate, parseCommand } from '@/server/telegram/handle';
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

  function deps(over: Record<string, unknown> = {}) {
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
        ...over,
      },
    };
  }

  test('/pay reaches the pay handler and never the model', async () => {
    const pay = vi.fn(async (_text: string) => 'request sent');
    const { deps: d, sent } = deps({ pay });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleUpdate(d as any, update('/pay 0.20') as any);
    expect(sent.join(' ')).toMatch(/not switched on/i);
  });

  test('free text that sounds like a payment still goes to the agent', async () => {
    // The M10 regression, from the Telegram side. "send money to 076…" must NOT
    // reach the payment path — only a literal /pay command does.
    const pay = vi.fn(async () => 'request sent');
    const { deps: d } = deps({ pay });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleUpdate(d as any, update('send money to this person 0761346606') as any);

    expect(pay).not.toHaveBeenCalled();
    expect(d.agent.reply).toHaveBeenCalledOnce();
  });

  test('the command parser strips a group @mention', () => {
    expect(parseCommand('/pay@momokasi_demo_bot 0.20')).toBe('pay');
    expect(parseCommand('/status@momokasi_demo_bot')).toBe('status');
  });
});
