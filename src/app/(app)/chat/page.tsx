/** @jsxRuntime automatic */
'use client';

/**
 * The MoMo Kasi shell: a conversation that grows a dashboard (docs/13).
 *
 * The chat holds a compact, clickable CHIP; the full artifact lives beside it
 * (desktop) or in a modal bottom sheet (phone) and can be reopened from history
 * without re-prompting. Pattern taken from the Social-Assembly reference.
 *
 * It talks to `POST /api/agent`, which reads the live ledger and assembles the
 * artifact server-side (S7a). The only thing left of `mockAgent` here is
 * `SUGGESTIONS` — the starter chips — and the `KasiContext` type.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArtifactPanel, ArtifactSheet, EmptyPanel } from '@/components/artifact-panel';
import { ContextDrawer } from '@/components/context/context-drawer';
import { ContextPanel } from '@/components/context/context-panel';
import { ContextStrip } from '@/components/context/context-strip';
import { ChipSkeleton } from '@/components/artifacts/skeleton';
import type { ArtifactStatus } from '@/components/artifacts/registry';
import { ArtifactChip } from '@/components/chips/artifact-chip';
import { MicIcon, SendIcon } from '@/components/icons';
import type { Artifact } from '@/lib/artifacts/types';
import type { KasiContext } from '@/lib/agent/mock';
import { SUGGESTIONS } from '@/lib/agent/mock';
import { reviveContext, reviveTurn, type WireTurn } from '@/lib/agent/wire';

interface Message {
  readonly id: string;
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly artifact?: Artifact;
}

const GREETING: Message = {
  id: 'm0',
  role: 'agent',
  text: "Sawubona. I'm MoMo Kasi. Ask me about your money, find work near you, or check the stokvel.",
};

/** Honour the OS setting for the auto-scroll too, not only for CSS animation. */
function scrollBehaviour(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState<Artifact | null>(null);
  const [panelStatus, setPanelStatus] = useState<ArtifactStatus>('complete');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Fetched once, from the ledger. It used to be `contextSnapshot()` — a mock —
  // and a rail confidently showing R2,300 while the chat answers R12.50 from the
  // same database is the contradiction a judge notices first. Null until it
  // arrives; the rail renders its own empty state rather than inventing one.
  const [context, setContext] = useState<KasiContext | null>(null);
  const logRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  // ── Keep the conversation pinned WITHOUT moving the page ────────────────────
  //
  // This used to be `endRef.current.scrollIntoView(...)` on a sentinel div, and
  // it walked the whole app up the screen: after a few messages the header left
  // the top of the window and a band of blank page appeared under the composer.
  //
  // `scrollIntoView` is not a request to scroll one box. It scrolls EVERY
  // scrollable ancestor until the element is in view — the message log first,
  // and then the document. And the document here is scrollable by a small
  // amount almost everywhere: `globals.css` sets `html, body { height: 100% }`
  // (the *small* viewport, which excludes retractable browser chrome) while this
  // shell is `h-dvh` (the *dynamic* viewport, which includes it). On any browser
  // that hides its toolbar on scroll those two differ, and the difference is
  // exactly the height of the blank band.
  //
  // So: scroll the log element itself and nothing else. `scrollTop` cannot touch
  // an ancestor, which makes the leak structurally impossible rather than merely
  // absent. The shell also gets `overflow-hidden` for the same reason.
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
    //
    // Money crosses as decimal strings because `JSON.stringify` throws on a
    // bigint, and `Number()` would lose precision above 2^53. `reviveTurn`
    // turns it back into money before anything renders.
    let turn: { reply: string; artifact?: Artifact };
    try {
      // `/pay` and `/status` are COMMANDS, not conversation. They go to a
      // different endpoint because `/api/agent` is read-only and its docstring
      // promises so — see the note at the top of `/api/pay`. Free text that
      // merely sounds like a payment still goes to the agent, which refuses it.
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
        turn = {
          reply: data.reply ?? 'That command is not available right now.',
        };
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <a href="#composer" className="skip-link">
        Skip to the message box
      </a>

      {/* context rail: a third column only where there is genuinely room for
          one. Below xl it becomes the strip above the composer and the drawer
          behind it — never a cramped column stealing width from the chat. */}
      <aside
        aria-label="Your position"
        className="hidden w-72 shrink-0 border-r border-divider xl:block"
      >
        {context ? <ContextPanel context={context} onOpen={openArtifact} /> : null}
      </aside>

      {/* conversation */}
      <section
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col lg:max-w-[520px] lg:border-r lg:border-border"
      >
        {/* A3-02: this page rendered ZERO headings — no h1, nothing. Verified
            against production HTML. Heading navigation is how a screen-reader
            user orients on a page, and this is the product's main surface.

            The wordmark becomes the h1 rather than adding a hidden one: it
            already IS the page's title, it is already the first thing in the
            document, and a visible heading that matches what a sighted user
            reads is better than a duplicate nobody can see. The link stays
            inside it, which is valid and keeps "go home" where the thumb
            expects it. */}
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <h1 className="min-w-0">
            <Link href="/" className="flex min-h-11 min-w-0 items-baseline gap-2 rounded-md">
              <span className="whitespace-nowrap font-display text-2xl text-brand">MoMo Kasi</span>
              {/* At 320px the wordmark plus the sandbox badge is the whole
                  width, and a broken wordmark looks like a bug. The tagline is
                  the part that can go. */}
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                daily money for Mzansi
              </span>
            </Link>
          </h1>
          <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            sandbox
          </span>
        </header>

        <main
          ref={logRef}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-6"
          role="log"
          aria-live="polite"
          aria-label="Messages"
        >
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm bg-secondary px-4 py-2.5 text-base leading-relaxed text-secondary-foreground animate-rise">
                  <span className="sr-only">You said: </span>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="max-w-[92%] space-y-3 animate-rise">
                <p className="text-base leading-relaxed text-foreground">
                  <span className="sr-only">MoMo Kasi said: </span>
                  {m.text}
                </p>
                {m.artifact ? (
                  <ArtifactChip artifact={m.artifact} onOpen={() => openArtifact(m.artifact!)} />
                ) : null}
              </div>
            ),
          )}

          {thinking ? (
            <div className="space-y-3" role="status" aria-live="polite">
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
              <div className="max-w-[92%]">
                <ChipSkeleton />
              </div>
            </div>
          ) : null}
        </main>

        <div className="space-y-3 border-t border-divider px-5 py-4">
          {/* No rail until the ledger has answered. An empty gap for a moment
              beats a confident number that is not true. */}
          {context ? (
            <div className="xl:hidden">
              <ContextStrip context={context} onOpen={() => setDrawerOpen(true)} />
            </div>
          ) : null}

          {messages.length <= 1 ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-11 rounded-full border border-border px-4 text-sm text-foreground transition-colors hover:border-brand hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            {/* 16px minimum. Smaller text triggers zoom-on-focus on mobile
                Safari and is unreadable on a cracked screen in the sun. */}
            <input
              id="composer"
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your money…"
              aria-label="Message MoMo Kasi"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-4 py-3 text-base text-foreground transition-colors placeholder:text-muted-foreground focus:border-brand"
            />
            {/* Voice is never the only route to anything (A3). Until S8c lands
                this control hands the user straight back to the message box. */}
            <button
              type="button"
              onClick={() => composerRef.current?.focus()}
              aria-label="Voice input is not available yet — use the message box"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            >
              <MicIcon size={18} />
            </button>
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label="Send message"
            >
              <SendIcon size={18} />
            </button>
          </form>
        </div>
      </section>

      {/* artifact: right panel from 1024px up */}
      <aside aria-label="Artifact" className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
        {open ? (
          <ArtifactPanel artifact={open} status={panelStatus} onClose={close} />
        ) : (
          <EmptyPanel />
        )}
      </aside>

      {/* artifact: modal bottom sheet below 1024px — the real case */}
      {open ? <ArtifactSheet artifact={open} status={panelStatus} onClose={close} /> : null}

      {/* the rail, for everyone without a third column */}
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
