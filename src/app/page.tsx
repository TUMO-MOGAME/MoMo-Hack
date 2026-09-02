'use client';

/**
 * The MoMo Kasi shell: a conversation that grows a dashboard (docs/13).
 *
 * Pattern taken from the Social-Assembly reference: the chat holds a compact,
 * clickable CHIP; the full artifact lives beside it (desktop) or in a bottom
 * sheet (mobile) and can be reopened from history without re-prompting.
 *
 * STARTER SCOPE: driven by `mockAgent` — no keys, no network, no database.
 * `src/app/api/agent/route.ts` (S7a) replaces the mock; nothing else changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtifactBody } from '@/components/artifacts/renderers';
import { ARTIFACT_KICKER, type Artifact } from '@/lib/artifacts/types';
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

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState<Artifact | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;

    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text }]);
    setThinking(true);

    // Stands in for a streamed Groq turn. Sub-second, like the real thing.
    window.setTimeout(() => {
      const turn = mockAgent(text);
      const msg: Message = {
        id: `a${Date.now()}`,
        role: 'agent',
        text: turn.reply,
        artifact: turn.artifact,
      };
      setMessages((m) => [...m, msg]);
      setThinking(false);
      // Auto-open once the turn completes — the reference project's behaviour.
      if (turn.artifact) setOpen(turn.artifact);
    }, 550);
  }, []);

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      {/* ── conversation ──────────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-1 flex-col lg:max-w-[520px] lg:border-r lg:border-border">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl text-brand">MoMo Kasi</span>
            <span className="text-xs text-muted-foreground">daily money for Mzansi</span>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            sandbox
          </span>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm bg-secondary px-4 py-2.5 text-[15px] leading-relaxed text-secondary-foreground animate-rise">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="max-w-[92%] space-y-3 animate-rise">
                <p className="text-[15px] leading-[1.65] text-foreground">{m.text}</p>
                {m.artifact ? (
                  <ArtifactChip artifact={m.artifact} onOpen={() => setOpen(m.artifact!)} />
                ) : null}
              </div>
            ),
          )}

          {thinking ? (
            <div className="flex items-center gap-1.5" aria-label="MoMo Kasi is thinking">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="dot size-1.5 rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        <div className="border-t border-border px-5 py-4">
          {messages.length <= 1 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
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
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask MoMo Kasi anything about your money…"
              aria-label="Message MoMo Kasi"
              className="min-w-0 flex-1 rounded-lg border border-input bg-card px-4 py-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
            />
            <button
              type="button"
              aria-label="Speak instead of typing"
              title="Voice — English in v1 (docs/12)"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
            >
              <MicIcon />
            </button>
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </section>

      {/* ── artifact: right panel on desktop ──────────────────────────── */}
      <aside className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
        {open ? (
          <div className="mx-auto max-w-2xl px-8 py-8">
            <ArtifactHeader artifact={open} onClose={() => setOpen(null)} />
            <ArtifactBody artifact={open} />
          </div>
        ) : (
          <EmptyPanel />
        )}
      </aside>

      {/* ── artifact: bottom sheet on mobile ──────────────────────────── */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(null)}
            aria-label="Close"
          />
          <div
            className={`absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-popover animate-sheet ${
              open.type === 'confirm' ? 'top-0 overflow-y-auto' : 'max-h-[85dvh] overflow-y-auto'
            }`}
          >
            <div className="sticky top-0 flex justify-center bg-popover pb-1 pt-3">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <div className="px-5 pb-10 pt-2">
              <ArtifactHeader artifact={open} onClose={() => setOpen(null)} />
              <ArtifactBody artifact={open} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ArtifactChip({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-brand/50"
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-md ${
          artifact.type === 'confirm' ? 'bg-brand text-brand-foreground' : 'bg-secondary text-brand'
        }`}
        aria-hidden
      >
        <DocIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
          {ARTIFACT_KICKER[artifact.type]}
        </span>
        <span className="block truncate text-sm text-foreground">{artifact.title}</span>
      </span>
      <span className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5">
        <ChevronIcon />
      </span>
    </button>
  );
}

function ArtifactHeader({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {ARTIFACT_KICKER[artifact.type]}
        </div>
        <h2 className="text-lg text-foreground">{artifact.title}</h2>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <div className="font-display text-3xl text-muted-foreground/40">MoMo Kasi</div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ask a question and the answer opens here — your wallet, a fare split, the stokvel, work
          near you. Everything stays in the conversation, so you can scroll back and reopen it.
        </p>
      </div>
    </div>
  );
}

/* ── icons (inline: no icon dependency in the starter) ───────────────────── */

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
