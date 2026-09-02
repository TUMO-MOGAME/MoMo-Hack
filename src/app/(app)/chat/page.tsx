/** @jsxRuntime automatic */
'use client';

/**
 * The MoMo Kasi shell: a conversation that grows a dashboard (docs/13).
 *
 * The chat holds a compact, clickable CHIP; the full artifact lives beside it
 * (desktop) or in a modal bottom sheet (phone) and can be reopened from history
 * without re-prompting. Pattern taken from the Social-Assembly reference.
 *
 * STARTER SCOPE: driven by `mockAgent` — no keys, no network, no database.
 * `src/app/api/agent/route.ts` (S7a) replaces the mock; nothing else changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArtifactPanel, ArtifactSheet, EmptyPanel } from '@/components/artifact-panel';
import { ChipSkeleton } from '@/components/artifacts/skeleton';
import type { ArtifactStatus } from '@/components/artifacts/registry';
import { ArtifactChip } from '@/components/chips/artifact-chip';
import { MicIcon, SendIcon } from '@/components/icons';
import type { Artifact } from '@/lib/artifacts/types';
import { mockAgent, SUGGESTIONS } from '@/lib/agent/mock';

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
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: scrollBehaviour() });
  }, [messages, thinking]);

  const close = useCallback(() => setOpen(null), []);

  const openArtifact = useCallback((artifact: Artifact) => {
    setPanelStatus('complete');
    setOpen(artifact);
  }, []);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;

    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text }]);
    setThinking(true);

    // Stands in for a streamed Groq turn. A real turn arrives in two parts —
    // the prose tokens first, the tool result behind them — so the artifact
    // shows as a skeleton until its payload lands. Sub-second, like the real
    // thing, and it exercises the loading path the demo will actually hit.
    window.setTimeout(() => {
      const turn = mockAgent(text);
      setMessages((m) => [
        ...m,
        { id: `a${Date.now()}`, role: 'agent', text: turn.reply, artifact: turn.artifact },
      ]);
      setThinking(false);
      if (!turn.artifact) return;
      setPanelStatus('streaming');
      setOpen(turn.artifact);
      window.setTimeout(() => setPanelStatus('complete'), 350);
    }, 550);
  }, []);

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <a href="#composer" className="skip-link">
        Skip to the message box
      </a>

      {/* conversation */}
      <section
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col lg:max-w-[520px] lg:border-r lg:border-border"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <Link href="/" className="flex min-h-11 min-w-0 items-baseline gap-2 rounded-md">
            <span className="whitespace-nowrap font-display text-2xl text-brand">MoMo Kasi</span>
            {/* At 320px the wordmark plus the sandbox badge is the whole width,
                and a broken wordmark looks like a bug. The tagline is the part
                that can go. */}
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              daily money for Mzansi
            </span>
          </Link>
          <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            sandbox
          </span>
        </header>

        <main
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6"
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

          <div ref={endRef} />
        </main>

        <div className="border-t border-border px-5 py-4">
          {messages.length <= 1 ? (
            <div className="mb-3 flex flex-wrap gap-2">
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
    </div>
  );
}
