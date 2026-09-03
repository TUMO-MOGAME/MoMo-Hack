/** @jsxRuntime automatic */
'use client';

/**
 * The MoMo Kasi shell: a conversation that grows a dashboard (docs/13).
 *
 * The chat holds a compact, clickable CHIP; the full artifact lives beside it
 * (desktop) or in a modal bottom sheet (phone) and can be reopened from history
 * without re-prompting.
 *
 * It talks to `POST /api/agent`, which reads the live ledger and assembles the
 * artifact server-side (S7a), and to `POST /api/pay` for the slash commands.
 *
 * ── THE REDESIGN, AND THE THREE THINGS IT DOES NOT COPY ─────────────────────
 *
 * The layout follows the supplied UI: a 264px rail, a centred thread with an
 * opening state, a rounded composer, and the artifact as a right-hand panel on
 * desktop / a bottom sheet on phone.
 *
 * Three pieces of the mockup are deliberately NOT built, because building them
 * would mean putting things on screen that are not true:
 *
 *  1. **The signed-in account** (*"Thabo · •••• 4821 · Katlehong"*). There is no
 *     authentication yet — A5-04 and A1-01 are open on exactly that. A rail
 *     confidently naming a user we cannot identify is a lie with a face on it.
 *  2. **"Continue with Telegram"**. A button that cannot sign anyone in is an
 *     invented action, which is `MISTAKES.md` M10 with a cursor on it.
 *  3. **Recent conversations**. We store none. Four plausible titles would be
 *     four fabrications sitting under a real balance.
 *
 * What replaces them is real: the position block is fed from `/api/context`
 * (the ledger), and the trust line is a promise the architecture actually keeps
 * — we never see a MoMo PIN, because MTN asks for it on the payer's own handset.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArtifactPanel, ArtifactSheet } from '@/components/artifact-panel';
import { ContextDrawer } from '@/components/context/context-drawer';
import { ChipSkeleton } from '@/components/artifacts/skeleton';
import type { ArtifactStatus } from '@/components/artifacts/registry';
import { ArtifactChip } from '@/components/chips/artifact-chip';
import { SendIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Artifact } from '@/lib/artifacts/types';
import type { KasiContext } from '@/lib/agent/mock';
import { reviveContext, reviveTurn, type WireTurn } from '@/lib/agent/wire';
import { formatZAR, posting } from '@/domain/money';

interface Message {
  readonly id: string;
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly artifact?: Artifact;
}

/** Honour the OS setting for the auto-scroll too, not only for CSS animation. */
function scrollBehaviour(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** The rail's shortcuts. Each one SENDS A REAL QUESTION — none of them navigate. */
const SHORTCUTS: readonly { readonly label: string; readonly ask: string; readonly d: string }[] = [
  { label: 'Wallet', ask: 'How much do I have?', d: 'M3 6h18v13H3zM3 10h18' },
  { label: 'Taxi fares', ask: 'Where did my taxi fare go?', d: 'M4 12h16M12 4v16' },
  {
    label: 'Your month',
    ask: 'How am I doing this month?',
    d: 'M4 19h16M6 15v-4M12 15V7M18 15v-7',
  },
  { label: 'Transactions', ask: 'Show me my transactions', d: 'M4 7h16M4 12h16M4 17h10' },
];

const OPENING_CHIPS: readonly string[] = [
  'How much do I have?',
  'Where did my taxi fare go?',
  'How am I doing this month?',
  'Ngifuna ukubona my balance',
];

/**
 * What this build can and cannot do, on the opening screen.
 *
 * The last row is the important one and it is styled as a refusal on purpose.
 * Saying what the product will NOT do, before anyone asks, is the same move the
 * agent's `unbuilt` route makes — and it is why the M10 transcript cannot
 * happen twice.
 */
const CAPABILITIES: readonly {
  readonly title: string;
  readonly body: string;
  readonly no?: true;
}[] = [
  {
    title: 'Your balance',
    body: 'and the difference between what you have and what you can spend.',
  },
  { title: 'Where a taxi fare went', body: 'a R12.50 fare split four ways, to the cent.' },
  { title: 'Your transactions', body: 'read from the ledger, every one with its journal id.' },
  {
    title: 'Not from me: sending or paying',
    body: 'a person types the command, and MTN asks them on their own phone.',
    no: true,
  },
];

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState<Artifact | null>(null);
  const [panelStatus, setPanelStatus] = useState<ArtifactStatus>('complete');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Fetched once, from the ledger. It used to be `contextSnapshot()` — a mock —
  // and a rail confidently showing R2,300 while the chat answers R12.50 from the
  // same database is the contradiction a judge notices first. Null until it
  // arrives; the rail renders nothing rather than inventing a number.
  const [context, setContext] = useState<KasiContext | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const isOpening = messages.length === 0 && !thinking;

  // ── Keep the conversation pinned WITHOUT moving the page ────────────────────
  //
  // This used to be `endRef.current.scrollIntoView(...)` on a sentinel div, and
  // it walked the whole app up the screen: after a few messages the header left
  // the top of the window and a band of blank page appeared under the composer.
  //
  // `scrollIntoView` is not a request to scroll one box. It scrolls EVERY
  // scrollable ancestor until the element is in view. So: scroll the log element
  // itself and nothing else. `scrollTop` cannot touch an ancestor, which makes
  // the leak structurally impossible rather than merely absent.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({ top: log.scrollHeight, behavior: scrollBehaviour() });
  }, [messages, thinking]);

  // The send handler reads history without depending on it, so a new message
  // does not rebuild the callback (and drop focus) on every keystroke.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let live = true;
    fetch('/api/context')
      .then((r) => r.json())
      .then((raw) => {
        if (live) setContext(reviveContext(raw) as KasiContext);
      })
      .catch(() => {
        // Leave it null. An empty rail is honest; a mock one is not.
      });
    return () => {
      live = false;
    };
  }, []);

  const close = useCallback(() => setOpen(null), []);

  const openArtifact = useCallback((artifact: Artifact) => {
    setPanelStatus('complete');
    setOpen(artifact);
    setDrawerOpen(false);
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text }]);
    setThinking(true);

    // The real turn. `/api/agent` reads the ledger, builds the artifact
    // server-side, and asks the model only for the prose — so no amount on
    // this screen was generated by a model (CLAUDE.md #14).
    let turn: { reply: string; artifact?: Artifact };
    try {
      // `/pay`, `/status` and `/send` are COMMANDS, not conversation. They go to
      // a different endpoint because `/api/agent` is read-only and its docstring
      // promises so. Free text that merely sounds like a payment still goes to
      // the agent, which refuses it.
      if (/^\/(pay|status|send)\b/i.test(text)) {
        const response = await fetch('/api/pay', {
          method: 'POST',
          // `x-momo-chat` marks this as our own page's request. A browser will
          // not let another site attach a custom header to a cross-origin POST
          // without a CORS preflight, and we answer no preflight — so this
          // closes the "no Origin header, therefore allowed" default on the
          // route. It is friction, not authentication: see `/api/pay`.
          headers: { 'content-type': 'application/json', 'x-momo-chat': '1' },
          body: JSON.stringify({ message: text }),
        });
        const data = (await response.json()) as { reply?: string; error?: string };
        turn = { reply: data.reply ?? 'That command is not available right now.' };
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'agent', text: turn.reply }]);
        setThinking(false);
        return;
      }

      const history = messagesRef.current
        .slice(-8)
        .map((m) => ({ role: m.role === 'agent' ? 'model' : 'user', text: m.text }));

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      turn = reviveTurn((await response.json()) as WireTurn);
    } catch {
      // Offline, or the route is unreachable. Say something true rather than
      // nothing — and never imply money moved.
      turn = {
        reply:
          "I couldn't reach the ledger just then. Nothing was changed — I only ever read. Try again in a moment.",
      };
    }

    setMessages((m) => [
      ...m,
      { id: `a${Date.now()}`, role: 'agent', text: turn.reply, artifact: turn.artifact },
    ]);
    setThinking(false);
    if (!turn.artifact) return;
    setPanelStatus('streaming');
    setOpen(turn.artifact);
    window.setTimeout(() => setPanelStatus('complete'), 350);
  }, []);

  const spendable = context?.balances.find((b) => b.kind === 'WALLET');
  // `posting`, not `minor`: a sum across accounts can legitimately be negative
  // (a credit-normal account carries a negative balance), and `minor()` throws
  // on negatives. Branding it wrong here would turn a correct total into a
  // crash on the one screen that must never look broken.
  const heldTotal = context
    ? posting(context.balances.reduce((sum, b) => sum + b.money.amount, 0n))
    : undefined;

  return (
    <div
      // THE THIRD COLUMN HAS TO BE DECLARED, not just rendered. The grid was
      // `lg:grid-cols-[264px_minmax(0,1fr)]` with the artifact panel rendered
      // as a third child — which does not sit beside the chat, it wraps onto a
      // new implicit ROW and pushes the whole conversation off screen. Caught by
      // reading the markup rather than by a test, because nothing here has a
      // browser to fail in.
      className={`grid h-dvh grid-cols-1 overflow-hidden bg-background text-foreground ${
        open ? 'lg:grid-cols-[264px_minmax(0,1fr)_448px]' : 'lg:grid-cols-[264px_minmax(0,1fr)]'
      }`}
    >
      <a href="#composer" className="skip-link">
        Skip to the message box
      </a>

      {/* ── the rail ──────────────────────────────────────────────────────── */}
      <aside
        aria-label="Shortcuts and your position"
        className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-3.5 lg:flex"
      >
        <h1 className="px-2.5 pb-4 pt-1.5">
          <Link href="/" className="rounded-md font-display text-2xl leading-none text-foreground">
            MoMo <em className="italic text-brand-text">Kasi</em>
          </Link>
        </h1>

        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setOpen(null);
            composerRef.current?.focus();
          }}
          aria-current={isOpening}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[15px] transition-colors hover:bg-secondary aria-[current=true]:bg-secondary"
        >
          <Icon d="M4 20l4-1 10-10-3-3L5 16z" />
          New chat
        </button>

        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => void send(s.ask)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[15px] transition-colors hover:bg-secondary"
          >
            <Icon d={s.d} />
            {s.label}
          </button>
        ))}

        <div className="mt-auto flex flex-col gap-2.5 pt-4">
          {/* THE POSITION BLOCK — real, or absent. Never a placeholder number. */}
          {spendable && heldTotal !== undefined ? (
            <button
              type="button"
              onClick={() => context && openArtifact(context.wallet)}
              className="flex flex-col gap-1.5 rounded-[14px] bg-brand p-3.5 text-left text-brand-foreground transition-[filter] hover:brightness-[1.06]"
            >
              <span className="text-xs font-medium uppercase tracking-[0.06em] opacity-80">
                Spendable now
              </span>
              <span className="font-mono text-[26px] font-medium leading-[1.05] tracking-[-0.02em] tabular-nums">
                {formatZAR(spendable.money.amount)}
              </span>
              <span className="text-[13px] opacity-85">
                of <span className="font-mono tabular-nums">{formatZAR(heldTotal)}</span> held at
                MTN
              </span>
            </button>
          ) : null}

          {/* True of the architecture, not a marketing line: the PIN is typed
              into MTN's own app on the payer's handset and never reaches us. */}
          <div className="flex items-start gap-2.5 p-1 text-[13px] leading-[1.35] text-muted-foreground">
            <span className="text-brand-text">
              <Icon d="M8 11V7a4 4 0 0 1 8 0v4" />
            </span>
            <span>
              We never ask for your <b className="font-semibold">MoMo PIN</b>.
            </span>
          </div>
        </div>
      </aside>

      {/* ── the conversation ──────────────────────────────────────────────── */}
      <main
        aria-label="Conversation"
        className="relative flex min-h-0 min-w-0 flex-col bg-card lg:border-l lg:border-divider"
      >
        <div className="absolute inset-x-0 top-0 z-[2] flex items-center justify-between gap-3 bg-gradient-to-b from-card from-70% to-transparent px-4 py-3 lg:px-6">
          <span className="font-mono text-xs text-muted-foreground">
            {context ? 'live ledger' : 'connecting…'}
          </span>
          <div className="flex items-center gap-1">
            <Link
              href="/ledger"
              className="rounded-lg border border-input px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              ledger
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Messages"
          className={`flex min-h-0 flex-col gap-[22px] overflow-y-auto overscroll-contain px-5 pb-2 pt-16 lg:px-10 lg:pt-[72px] ${
            isOpening ? 'flex-none justify-center overflow-visible pt-0' : 'flex-1'
          }`}
        >
          {isOpening ? (
            <section className="mx-auto flex max-w-[640px] flex-col items-center gap-3 px-2 text-center">
              <h2 className="text-[32px] font-medium leading-[1.2] tracking-[-0.01em]">
                <em className="font-display not-italic text-brand-text">Sawubona.</em>
                <br />
                What do you want to know about your money?
              </h2>
              <p className="max-w-[520px] text-base leading-normal text-muted-foreground">
                Ask in English, isiZulu, or both in one sentence. Every rand comes from a
                transaction in the ledger, with its id on it — I don&apos;t guess, round up, or give
                advice.
              </p>
            </section>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <article key={m.id} className="mx-auto flex w-full max-w-[760px] flex-col items-end">
                <div className="max-w-[85%] rounded-[22px] bg-secondary px-4 py-3 text-base leading-normal text-secondary-foreground animate-rise">
                  <span className="sr-only">You said: </span>
                  {m.text}
                </div>
              </article>
            ) : (
              <article
                key={m.id}
                className="mx-auto flex w-full max-w-[760px] flex-col items-start gap-2 animate-rise"
              >
                <div className="font-mono text-xs text-muted-foreground">MoMo Kasi</div>
                <div className="whitespace-pre-line border-l-[3px] border-brand py-1 pl-3.5 text-base leading-normal">
                  {m.text}
                </div>
                {m.artifact ? (
                  <ArtifactChip artifact={m.artifact} onOpen={() => openArtifact(m.artifact!)} />
                ) : null}
              </article>
            ),
          )}

          {thinking ? (
            <div
              className="mx-auto flex w-full max-w-[760px] flex-col gap-3"
              role="status"
              aria-live="polite"
            >
              <span className="sr-only">MoMo Kasi is thinking.</span>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="dot size-1.5 rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
              <ChipSkeleton />
            </div>
          ) : null}
        </div>

        {/* Phone-only position strip. The rail is hidden below lg, and a
            balance you cannot see is a balance you do not trust. */}
        {spendable && heldTotal !== undefined ? (
          <div className="flex gap-2 overflow-x-auto px-4 pt-2 lg:hidden [scrollbar-width:none]">
            <span className="inline-flex min-h-9 flex-none items-center gap-2 rounded-full border border-brand bg-brand px-3 text-[13px] font-medium text-brand-foreground">
              Spendable{' '}
              <span className="font-mono tabular-nums">{formatZAR(spendable.money.amount)}</span>
            </span>
            <span className="inline-flex min-h-9 flex-none items-center gap-2 rounded-full border border-divider bg-card px-3 text-[13px]">
              Held <span className="font-mono tabular-nums">{formatZAR(heldTotal)}</span>
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex min-h-9 flex-none items-center rounded-full border border-divider bg-card px-3 text-[13px]"
            >
              Details
            </button>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="mx-auto flex w-full max-w-[792px] items-end gap-2.5 px-4 pb-4 pt-3 lg:pb-5"
        >
          <label className="flex min-h-14 flex-1 items-end gap-2 rounded-[28px] border border-input bg-card py-1.5 pl-2 pr-1.5 shadow-[0_6px_28px_rgba(0,0,0,0.08)] focus-within:border-brand-text focus-within:ring-2 focus-within:ring-brand-text">
            <span className="sr-only">Message MoMo Kasi</span>
            {/* 17px. Below 16px mobile Safari zooms on focus, and this is a
                cracked screen in the sun. */}
            <textarea
              id="composer"
              ref={composerRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about your money…"
              className="max-h-[140px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[17px] leading-[1.4] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition-[filter] hover:brightness-[1.06] disabled:bg-secondary disabled:text-muted-foreground"
          >
            <SendIcon size={20} />
          </button>
        </form>

        {isOpening ? (
          <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-5 px-4 pb-6">
            <div className="flex flex-wrap justify-center gap-2">
              {OPENING_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void send(c)}
                  className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:border-brand-text hover:bg-brand-soft"
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid w-full gap-2.5 sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <div
                  key={c.title}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                    c.no
                      ? 'border-dashed border-input text-muted-foreground'
                      : 'border-divider bg-card'
                  }`}
                >
                  <span className={c.no ? 'text-muted-foreground' : 'text-brand-text'}>
                    <Icon d={c.no ? 'M5.6 5.6l12.8 12.8' : 'M4 12h16'} size={18} />
                  </span>
                  <span>
                    <b className="font-semibold">{c.title}</b> — {c.body}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      {/* artifact: right panel from lg up, as a third column */}
      {open ? (
        <aside
          aria-label="Artifact"
          className="hidden min-h-0 overflow-y-auto border-l border-divider bg-card lg:block"
        >
          <ArtifactPanel artifact={open} status={panelStatus} onClose={close} />
        </aside>
      ) : null}

      {/* artifact: modal bottom sheet below lg — the real case */}
      {open ? <ArtifactSheet artifact={open} status={panelStatus} onClose={close} /> : null}

      {drawerOpen && context ? (
        <ContextDrawer
          context={context}
          onOpen={openArtifact}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}
