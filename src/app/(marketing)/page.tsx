/** @jsxRuntime automatic */
/**
 * The public pitch surface — what a judge opens from the submission link.
 *
 * Still a SERVER component with no client JavaScript. It now carries five
 * photographs, which is a change of position from "no images" and needs saying
 * out loud — because `docs/00` §6a is not a marketing constraint here: the
 * people this page is about get disconnected mid-session when their bundle runs
 * out, so the pitch has to survive Slow 3G as well as the product does.
 *
 * What keeps that true:
 *
 *   - All five are WebP, resized to 1800px on the long edge BEFORE they reached
 *     the repository: 52MB of source JPEGs became 908KB. `next/image` then
 *     serves a width suited to the device, so a phone never pulls the desktop
 *     asset.
 *   - Static imports, so width and height are known at build time and nothing
 *     reflows as they arrive. Cumulative Layout Shift stays at zero.
 *   - `placeholder="blur"` inlines a ~300-byte gradient, so a slow connection
 *     shows the photograph's colour immediately instead of a grey rectangle.
 *   - Only the hero is `priority`. Everything below the fold is lazy, so the
 *     page is READABLE before a single one of them has arrived.
 *
 * The photographs are atmosphere, never evidence. The argument is carried
 * entirely by the text, and no photograph is captioned as one of the three
 * people in "Who it is for" — those are composite personas from `docs/00`, and
 * putting a real photographed face under an invented name would be a small lie
 * on a page whose whole claim is that it does not round anything up.
 *
 * Every figure below is from `docs/00` §2 and is sourced at the foot of the
 * page. Nothing is rounded up for effect; nothing we cannot cite is here.
 */

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MomoMark, TumoOloMark } from '@/components/brand-marks';
import { ShieldIcon } from '@/components/icons';
import earnHustle from '@/assets/images/earn-hustle.webp';
import heroPhone from '@/assets/images/hero-phone.webp';
import identityBeadwork from '@/assets/images/identity-beadwork.webp';
import moveCommute from '@/assets/images/move-commute.webp';
import shareTogether from '@/assets/images/share-together.webp';

export const metadata: Metadata = {
  title: 'MoMo Kasi — daily money for Mzansi',
  description:
    'Earn through micro-gigs, share through stokvels, spend on taxi fare, electricity and school fees. One double-entry ledger across three MTN MoMo APIs.',
};

interface Stat {
  readonly value: string;
  readonly label: string;
  readonly note: string;
}

const STATS: readonly Stat[] = [
  {
    value: '47.4%',
    label: 'youth unemployment',
    note: 'Ages 15-34, Stats SA QLFS Q2 2026. Roughly 5 million people.',
  },
  {
    value: 'R90-100bn',
    label: 'minibus taxi industry, a year',
    note: '70-75% of daily commutes. Effectively all of it cash.',
  },
  {
    value: '11 million',
    label: 'stokvel members',
    note: 'About 800 000 groups, one in five adults, R50bn+ in cash and paper books.',
  },
  {
    value: '70 million',
    label: 'monthly active MoMo users',
    note: 'Across 14 markets. 13bn+ transactions in H1 2026 alone.',
  },
];

interface Module {
  readonly name: string;
  readonly what: string;
  readonly api: string;
}

const MODULES: readonly Module[] = [
  {
    name: 'Kasi Ride',
    what: 'Tap-to-pay taxi fare that splits 60/25/10/5 at the moment of collection — owner, driver float, fuel pool, insurance pool.',
    api: 'Collections + Disbursements',
  },
  {
    name: 'Kasi Gigs',
    what: 'Micro-work with the money escrowed before the job starts, released on photo proof, and a Trust Score that grows with every clean job.',
    api: 'Collections + Disbursements',
  },
  {
    name: 'Kasi Stokvel',
    what: 'The group pool MaDlamini keeps in a handbag, with automated collection, a balance every member can see, and a rotating payout.',
    api: 'Collections + Disbursements',
  },
  {
    name: 'Kasi Bills',
    what: 'Prepaid electricity, school fees, airtime and data — plus split-a-bill, so a shared cost stops being an argument.',
    api: 'Collections',
  },
  {
    name: 'Kasi Home',
    what: 'A purpose-locked sub-wallet funded from the diaspora. R2 000 sent from London can pay school fees and nothing else.',
    api: 'Remittances',
  },
];

interface Person {
  readonly name: string;
  readonly who: string;
  readonly need: string;
}

const PEOPLE: readonly Person[] = [
  {
    name: 'Nomsa, 24',
    who: 'Katlehong. Matric, no formal job, washes taxis at the rank on good days.',
    need: 'To be paid the day she works, without arguing, with proof she did it.',
  },
  {
    name: 'Thabo, 41',
    who: 'Taxi owner, three vehicles. Buys tyres from a mashonisa at 30% a month.',
    need: 'To see his revenue without standing at the rank, and to borrow at a sane rate.',
  },
  {
    name: 'MaDlamini, 52',
    who: 'Soweto. Runs a 12-member grocery stokvel, R300 a week each, in a book.',
    need: 'To stop carrying R3 600 in a handbag and chasing three people every week.',
  },
];

const REPO_URL = 'https://github.com/TUMO-MOGAME/MoMo-Hack';
const BUILDER_URL = 'https://www.tumoolo.tech/work';

/** The source list the statistics above are drawn from, kept one click away. */
const SOURCES_URL = `${REPO_URL}/blob/main/docs/00-PRODUCT-BRIEF.md`;

interface FooterColumn {
  readonly title: string;
  readonly links: readonly { readonly label: string; readonly href: string }[];
}

const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: 'The pitch',
    links: [
      { label: 'Why now', href: '#why' },
      { label: 'The product', href: '#what' },
      { label: 'Who it is for', href: '#who' },
    ],
  },
  {
    title: 'The build',
    links: [
      { label: 'Engineering', href: '#how' },
      { label: 'Open the demo', href: '/chat' },
      // The one page on this site whose numbers are not illustrative. Everything
      // else is driven by the mock agent; /ledger reads Postgres. It earns a
      // link because "we keep a real ledger" is a claim, and this is the proof.
      { label: 'The live ledger', href: '/ledger' },
      { label: 'Source and sources', href: SOURCES_URL },
    ],
  },
];

const ENGINEERING: readonly string[] = [
  'A double-entry ledger. Not a balance column — every cent traces to a journal that sums to zero.',
  'Integer basis-point splits with explicit remainder handling. No floating-point money anywhere.',
  'Idempotency by construction: our UUID is the MoMo X-Reference-Id, so a retry cannot double-pay.',
  'Two independent paths to truth — the webhook callback and a reconciliation poller, both replay-safe.',
  'Property-based tests on the money invariants. Splits always sum. Ledgers always balance.',
  'Offline-first fare capture, demonstrated live in airplane mode.',
];

/**
 * The habit loop, as three pictures.
 *
 * `alt` describes the SCENE, not the label sitting on top of it — a screen
 * reader that hears "Earn" from the caption and "Earn" again from the image has
 * been told nothing twice.
 */
const BEHAVIOURS = [
  {
    key: 'Earn',
    image: earnHustle,
    alt: 'A man playing a hand-carved flute on a bridge, the Johannesburg skyline behind him.',
    line: 'Micro-gigs, rank work, a trade. Money that has to arrive the same day it was worked for.',
  },
  {
    key: 'Share',
    image: shareTogether,
    alt: 'A woman standing still in warm evening light while a crowd moves around her.',
    line: 'Stokvels, shared bills, black tax. The obligation that makes you open the app on a schedule.',
  },
  {
    key: 'Spend',
    image: moveCommute,
    alt: 'A woman with her bicycle on a township street in the late afternoon.',
    line: 'Taxi fare twice a day, electricity, school fees, airtime. Currently almost all of it cash.',
  },
] as const;

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="border-t border-border px-5 py-14 sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{kicker}</p>
        <h2 id={`${id}-h`} className="mt-2 font-display text-3xl leading-tight text-foreground">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to the content
      </a>

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-8">
        <span className="font-display text-2xl text-brand">MoMo Kasi</span>
        <Link
          href="/chat"
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-brand hover:bg-secondary"
        >
          Open the demo
        </Link>
      </header>

      <main id="main">
        {/* hero */}
        <section aria-labelledby="hero-h" className="relative isolate overflow-hidden">
          {/*
            The photograph sits BEHIND the type, not beside it. A phone in a hand
            on an ochre wall is the product in one frame — this is a wallet for
            someone standing in the street, not sitting at a desk.
          */}
          <Image
            src={heroPhone}
            alt="A young woman sitting on a low wall in the sun, looking at her phone."
            priority
            placeholder="blur"
            sizes="100vw"
            className="absolute inset-0 -z-10 size-full object-cover object-[60%_30%]"
          />
          {/*
            Two stacked scrims rather than one. The vertical gradient anchors the
            text at the bottom on a phone; the flat wash guarantees the contrast
            ratio everywhere else, including the bright ochre top-right corner
            where a single gradient would leave body text at about 2:1.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/85 to-background/40"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-background/45" />

          <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-xs uppercase tracking-widest text-brand">
              MTN MoMo API Hackathon · South Africa
            </p>
            <h1
              id="hero-h"
              className="mt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl"
            >
              Daily money for Mzansi.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground">
              MTN does not have a distribution problem in South Africa. It has a{' '}
              <em className="text-brand not-italic">frequency</em> problem. MoMo Kasi is built
              around the one question that fixes it: what makes someone open this again tomorrow?
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Three money behaviours already happen every day in cash — you{' '}
              <strong className="text-foreground">earn</strong>, you{' '}
              <strong className="text-foreground">share</strong>, you{' '}
              <strong className="text-foreground">spend</strong>. Digitise all three on one ledger
              and the wallet stops being a destination and becomes a habit.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="inline-flex min-h-12 items-center rounded-lg bg-brand px-5 text-base font-semibold text-brand-foreground transition-opacity hover:opacity-90"
              >
                Talk to it
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-base font-medium text-foreground transition-colors hover:border-brand hover:bg-secondary"
              >
                How it is built
              </a>
            </div>

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-0.5 shrink-0 text-brand">
                <ShieldIcon size={14} />
              </span>
              <span>
                MoMo <strong className="text-foreground">sandbox</strong> only. No real money moves,
                and the assistant cannot move money at all — it can only propose, and a human tap
                settles it.
              </span>
            </p>
          </div>
        </section>

        {/* the habit loop, in three frames */}
        <section aria-labelledby="loop-h" className="border-t border-border px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">The loop</p>
            <h2 id="loop-h" className="mt-2 font-display text-3xl leading-tight text-foreground">
              Earn it. Share it. Spend it. Then do it again tomorrow.
            </h2>

            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {BEHAVIOURS.map((b) => (
                <li key={b.key} className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-4/5 overflow-hidden">
                    <Image
                      src={b.image}
                      alt={b.alt}
                      placeholder="blur"
                      // One third of the viewport once the grid splits, the full
                      // width before it. Without this every phone downloads a
                      // desktop-column asset for a picture it shows at 100vw.
                      sizes="(min-width: 640px) 33vw, 100vw"
                      className="size-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent"
                    />
                    <h3 className="absolute bottom-3 left-4 font-display text-2xl text-brand">
                      {b.key}
                    </h3>
                  </div>
                  <p className="p-5 pt-4 text-sm leading-relaxed text-muted-foreground">{b.line}</p>
                </li>
              ))}
            </ul>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground">
              A conventional wallet gets one to four touches a month. This loop is about sixteen a
              week, because other people are counting on you for most of them.
            </p>
          </div>
        </section>

        {/* the two facts that make the case */}
        <Section id="why" kicker="Why now" title="Two facts, one product sitting between them.">
          <dl className="grid gap-4 sm:grid-cols-2">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-5">
                <dt className="text-sm text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 font-display text-4xl tabular text-brand">{s.value}</dd>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground">
            Two of every five young South Africans in the labour force cannot find work, while a
            R90bn transport industry and 800 000 savings groups run on cash that nobody can see.
            MoMo Kasi sits in the middle of those two facts.
          </p>
        </Section>

        {/* the quote */}
        <section aria-label="What MTN said" className="border-t border-border px-5 py-14 sm:px-8">
          <figure className="mx-auto max-w-4xl">
            <blockquote className="border-l-2 border-brand pl-5 font-display text-2xl leading-snug text-foreground sm:text-3xl">
              “We started by giving customers access to financial services. Now we want to move from
              access to active participation.”
            </blockquote>
            <figcaption className="mt-4 pl-5 text-sm text-muted-foreground">
              Serigne Dioum, MTN Group Fintech CEO — 1 September 2026
            </figcaption>
            <p className="mt-6 pl-5 text-base leading-relaxed text-foreground">
              We are building the thing the CEO described, one day after he described it.
            </p>
          </figure>
        </section>

        {/* what it is */}
        <Section id="what" kicker="The product" title="Five modules. One wallet, one ledger.">
          <ul className="space-y-3">
            {MODULES.map((m) => (
              <li key={m.name} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-semibold text-foreground">{m.name}</h3>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {m.api}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.what}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground">
            These are not five apps. A fare paid in Kasi Ride is spendable in Kasi Bills the same
            second, because both are postings against the same account.
          </p>
        </Section>

        {/* who it is for */}
        <Section id="who" kicker="Who it is for" title="Three people, not a segment.">
          <ul className="grid gap-4 sm:grid-cols-3">
            {PEOPLE.map((p) => (
              <li key={p.name} className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-xl text-brand">{p.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.who}</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground">{p.need}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* how it is built */}
        <Section
          id="how"
          kicker="Engineering"
          title="The parts a judge on the panel will look for."
        >
          <ul className="space-y-3">
            {ENGINEERING.map((line) => (
              <li
                key={line}
                className="flex items-start gap-3 text-base leading-relaxed text-foreground"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-lg border border-brand bg-card p-5 glow-brand">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <span className="text-brand">
                <ShieldIcon size={18} />
              </span>
              What if your AI hallucinates a payment?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              It cannot. The agent only ever proposes. The proposal is server-signed and expires in
              120 seconds, the confirmation card renders from that signature rather than from
              anything the model said, and a human thumb is the only thing in the system that moves
              money. No auto-confirm, no voice confirm, at any amount.
            </p>
          </div>
        </Section>

        {/* close */}
        <section
          aria-labelledby="close-h"
          className="relative isolate overflow-hidden border-t border-border"
        >
          <Image
            src={identityBeadwork}
            alt="A young woman in a beaded Ndebele headpiece, looking directly at the camera."
            placeholder="blur"
            sizes="100vw"
            className="absolute inset-0 -z-10 size-full object-cover object-[70%_35%]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-background/55"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-background/40" />

          <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
            <h2
              id="close-h"
              className="max-w-2xl font-display text-3xl leading-tight text-foreground"
            >
              Zaka moved existing money faster.
              <br />
              MoMo Kasi creates money that does not exist yet, and gives it somewhere to go.
            </h2>
            <Link
              href="/chat"
              className="mt-8 inline-flex min-h-12 items-center rounded-lg bg-brand px-5 text-base font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              Open the demo
            </Link>
          </div>
        </section>
      </main>

      {/*
        The footer used to be three dense paragraphs of citation and disclaimer.
        Everything in them was true and worth saying, but stacked as grey prose
        it read as a licence agreement and nobody finished it. The facts did not
        move — the sources sit behind "Source and sources", the sandbox boundary
        is a badge you cannot miss, and the trademark line is one sentence. What
        was lost is the wall, not the honesty.
      */}
      <footer className="border-t border-border">
        {/* A single gold thread, the brand colour used once, to close the page. */}
        <div
          aria-hidden="true"
          className="h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
        />

        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <span className="font-display text-2xl text-brand">MoMo Kasi</span>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Earn, share, spend. One double-entry ledger across three MTN MoMo APIs.
              </p>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
                  {column.title}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-foreground transition-colors hover:text-brand"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          {/*
            The two attributions, given equal weight and held apart: whose rails
            this runs on, and who built it. Neither is decoration — the MoMo mark
            is the reason the app can move money at all, and Tumo Olo is the
            answer to "who do we talk to".
          */}
          <div className="mt-12 grid gap-8 border-t border-border pt-8 sm:grid-cols-2 sm:items-start">
            <div className="flex items-center gap-3.5">
              <MomoMark size={44} />
              <div>
                <p className="text-sm font-medium text-foreground">Built on the MTN MoMo API</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Collections · Disbursements · Remittances
                </p>
              </div>
            </div>

            <div className="sm:justify-self-end sm:text-right">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Built by</p>
              <a
                href={BUILDER_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-block transition-opacity hover:opacity-80"
              >
                <TumoOloMark className="h-6 w-auto sm:h-7" />
              </a>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Built in Johannesburg. Designed to be handed over.
              </p>
            </div>
          </div>

          {/*
            Stacked by default, one row from `sm` up. Three variable-length
            items sharing a single wrapping flex row overflowed a 390px phone —
            the trademark sentence has no break opportunity short enough to save
            it — so the small print is two blocks that cannot fight each other.
          */}
          <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            {/*
              Kept, and made louder rather than quieter. We are showing MTN's
              mark on a page that says "tap to pay your fare"; without this the
              page implies a live integration it does not have.
            */}
            <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-brand/40 px-3 py-1 font-medium text-brand">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              Sandbox only — no real money moves
            </span>
            <p className="text-balance sm:text-right">
              © 2026 Tumo Olo (Pty) Ltd. MTN, MoMo and the MoMo logo are trademarks of MTN Group.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
