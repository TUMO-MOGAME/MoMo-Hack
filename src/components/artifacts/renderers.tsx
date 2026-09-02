'use client';

/**
 * Artifact renderers + the registry (docs/13 §3, §8).
 *
 * A `type` maps to exactly one component here. The agent picks from this set;
 * it cannot invent a layout, and it cannot emit markup.
 *
 * TODO(S7d): split into one file per artifact as the set grows past ~8.
 */

import { formatZAR, type Minor } from '@/domain/money';
import type { Artifact, SourcedMoney } from '@/lib/artifacts/types';

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Money({ money, className = '' }: { money: SourcedMoney; className?: string }) {
  // Provenance is required by the contract. If it is missing, that is a bug we
  // want visible, not a number we want rendered.
  const sourced = Boolean(money.sourceTxnId ?? money.sourceAccountId);
  return (
    <span
      className={`tabular ${className} ${sourced ? '' : 'text-destructive line-through'}`}
      title={sourced ? undefined : 'unsourced amount — see docs/13 §3'}
    >
      {formatZAR(money.amount as Minor)}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-3">{children}</div>;
}

function Label({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm text-foreground">{children}</div>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

const KIND_ACCENT: Record<string, string> = {
  WALLET: 'text-brand',
  ESCROW: 'text-info',
  LOCKED: 'text-warning',
  POOL: 'text-success',
};

/* ── renderers ───────────────────────────────────────────────────────────── */

function Wallet({ a }: { a: Extract<Artifact, { type: 'wallet' }> }) {
  const available = a.balances.find((b) => b.kind === 'WALLET');
  return (
    <div>
      {available ? (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Available</div>
          <div className="font-display text-5xl tabular text-brand">
            {formatZAR(available.money.amount as Minor)}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {a.balances
          .filter((b) => b.kind !== 'WALLET')
          .map((b) => (
            <Row key={b.label}>
              <Label sub={b.note}>{b.label}</Label>
              <Money money={b.money} className={`text-base ${KIND_ACCENT[b.kind] ?? ''}`} />
            </Row>
          ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Held and locked money sits in its own account, so it is never counted as spendable.
        That is the ledger, not a UI rule.
      </p>
    </div>
  );
}

function Transactions({ a }: { a: Extract<Artifact, { type: 'transactions' }> }) {
  return (
    <div>
      {a.caption ? <p className="mb-4 text-sm text-muted-foreground">{a.caption}</p> : null}
      <div className="divide-y divide-border">
        {a.items.map((t) => (
          <Row key={t.id}>
            <Label sub={`${t.at}${t.counterparty ? ` · ${t.counterparty}` : ''}`}>
              {t.label}
              {t.status === 'PENDING' ? (
                <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                  pending
                </span>
              ) : null}
            </Label>
            <Money
              money={t.money}
              className={`text-base ${t.direction === 'IN' ? 'text-success' : 'text-foreground'}`}
            />
          </Row>
        ))}
      </div>
    </div>
  );
}

function SplitBreakdown({ a }: { a: Extract<Artifact, { type: 'split-breakdown' }> }) {
  const total = a.parts.reduce<bigint>((s, p) => s + p.money.amount, 0n);
  const balances = total === a.fare.amount;
  const chart = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{a.route}</div>
      <div className="font-display text-4xl tabular text-brand">
        {formatZAR(a.fare.amount as Minor)}
      </div>

      <div className="mt-6 flex h-2 overflow-hidden rounded-full">
        {a.parts.map((p, i) => (
          <div
            key={p.key}
            className={chart[i % chart.length]}
            style={{ width: `${p.bps / 100}%` }}
            aria-hidden
          />
        ))}
      </div>

      <div className="mt-4 divide-y divide-border">
        {a.parts.map((p, i) => (
          <Row key={p.key}>
            <div className="flex min-w-0 items-center gap-3">
              <span className={`size-2 shrink-0 rounded-full ${chart[i % chart.length]}`} aria-hidden />
              <Label sub={`${(p.bps / 100).toFixed(0)}%`}>{p.label}</Label>
            </div>
            <Money money={p.money} className="text-base" />
          </Row>
        ))}
      </div>

      <div
        className={`mt-5 rounded-md px-3 py-2 text-xs ${
          balances ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        }`}
      >
        {balances
          ? 'Parts sum to the fare exactly. The remainder cent is distributed deterministically — property-tested with 5 000 generated cases.'
          : 'LEDGER DOES NOT BALANCE — this is a bug.'}
      </div>
    </div>
  );
}

function Stokvel({ a }: { a: Extract<Artifact, { type: 'stokvel' }> }) {
  const pct = Number((a.pool.amount * 100n) / (a.target.amount || 1n));
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{a.cadence}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-4xl tabular text-brand">
          {formatZAR(a.pool.amount as Minor)}
        </span>
        <span className="text-sm text-muted-foreground">
          of {formatZAR(a.target.amount as Minor)}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="mt-5 space-y-2">
        {a.members.map((m) => (
          <li key={m.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span
                className={`size-1.5 rounded-full ${m.paid ? 'bg-success' : 'bg-muted-foreground/40'}`}
                aria-hidden
              />
              <span className={m.paid ? 'text-foreground' : 'text-muted-foreground'}>{m.name}</span>
            </span>
            {m.next ? (
              <span className="rounded-sm bg-brand/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-brand">
                collects this round
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{m.paid ? 'paid' : 'due'}</span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        800 000 stokvels. 11 million members. R50bn a year, in cash and paper books.
        Nobody defaults — their aunt is in the group.
      </p>
    </div>
  );
}

function JobList({ a }: { a: Extract<Artifact, { type: 'job-list' }> }) {
  return (
    <div className="space-y-3">
      {a.jobs.map((j) => (
        <div
          key={j.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/40"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{j.title}</div>
            <div className="truncate text-xs text-muted-foreground">{j.where}</div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Money money={j.money} className="text-base text-success" />
            <button className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition-opacity hover:opacity-90">
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrustScore({ a }: { a: Extract<Artifact, { type: 'trust-score' }> }) {
  return (
    <div>
      <div className="flex items-end gap-3">
        <span className="font-display text-5xl tabular text-brand">{a.score}</span>
        <span className="pb-2 text-sm text-muted-foreground">
          from {a.completed} completed jobs
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${a.score}%` }} />
      </div>
      <ul className="mt-6 space-y-3">
        {a.factors.map((f) => (
          <li key={f.label} className="flex items-center gap-3 text-sm">
            <span
              className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${
                f.met ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
              }`}
              aria-hidden
            >
              {f.met ? '✓' : ''}
            </span>
            <span className={f.met ? 'text-foreground' : 'text-muted-foreground'}>{f.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Confirm({ a }: { a: Extract<Artifact, { type: 'confirm' }> }) {
  const { action } = a;
  return (
    <div>
      <div className="rounded-lg border border-brand/30 bg-card p-5 glow-brand">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Pay</div>
        <div className="font-display text-5xl tabular text-brand">
          {formatZAR(action.money.amount as Minor)}
        </div>

        <div className="mt-5 divide-y divide-border">
          <Row>
            <Label sub={action.payeeMasked}>To</Label>
            <span className="text-sm text-foreground">{action.payeeLabel}</span>
          </Row>
          <Row>
            <Label>For</Label>
            <span className="text-right text-sm text-foreground">{action.purpose}</span>
          </Row>
          <Row>
            <Label>From</Label>
            <span className="text-sm text-muted-foreground">
              {action.fromLabel} · <Money money={action.fromBalance} />
            </span>
          </Row>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="rounded-lg border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary">
          Cancel
        </button>
        <button className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90">
          Confirm
        </button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The assistant prepared this. It cannot move money on its own — this card is rendered from a
        server-signed proposal, and your tap is the only thing that settles it.
      </p>
    </div>
  );
}

function ErrorCard({ a }: { a: Extract<Artifact, { type: 'error' }> }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      {a.message}
    </div>
  );
}

/* ── registry ────────────────────────────────────────────────────────────── */

export function ArtifactBody({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case 'wallet':
      return <Wallet a={artifact} />;
    case 'transactions':
      return <Transactions a={artifact} />;
    case 'split-breakdown':
      return <SplitBreakdown a={artifact} />;
    case 'stokvel':
      return <Stokvel a={artifact} />;
    case 'job-list':
      return <JobList a={artifact} />;
    case 'trust-score':
      return <TrustScore a={artifact} />;
    case 'confirm':
      return <Confirm a={artifact} />;
    case 'error':
      return <ErrorCard a={artifact} />;
  }
}
