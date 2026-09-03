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

/**
 * Which MoMo environment this deployment actually talks to.
 *
 * The footer used to state "Sandbox only — no real money moves" as a literal.
 * That was true when written and false from the moment R0.50 cleared on MTN
 * South Africa production — the fifth sentence in this codebase to describe a
 * build state and then outlive it. It is read from the environment now, so it
 * cannot expire again: change the deployment and the badge changes with it.
 *
 * CLAUDE.md #15: anything other than the exact string `sandbox` spends real
 * money. So the comparison is against that exact string, and every other value
 * — including unset — reads as live. Erring toward "real money moves" is the
 * safe direction for a warning; the opposite understates it.
 *
 * Safe in a server component: this file has no `use client`, so the value is
 * resolved at render time on the server and never shipped to the browser.
 */
const MOMO_IS_SANDBOX = process.env.MOMO_TARGET_ENVIRONMENT === 'sandbox';

const FOOTER_LINKS: readonly { readonly label: string; readonly href: string }[] = [
  { label: 'Why now', href: '#why' },
  { label: 'Who it is for', href: '#who' },
  { label: 'Open the demo', href: '/chat' },
  // The page whose numbers have always been real: /ledger reads Postgres. It
  // earns a link because "we keep a real ledger" is a claim and this is the
  // proof. (This entry used to carry "everything else is driven by the mock
  // agent" — untrue since #32: the chat answers from the same database.)
  { label: 'The live ledger', href: '/ledger' },
  { label: 'Source and sources', href: SOURCES_URL },
];

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
      className="border-t border-divider px-5 py-14 sm:px-8"
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

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-5 py-4 sm:px-8">
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
                href="/ledger"
                className="inline-flex min-h-12 items-center rounded-lg border border-border px-5 text-base font-medium text-foreground transition-colors hover:border-brand hover:bg-secondary"
              >
                See the live ledger
              </a>
            </div>

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <span className="mt-0.5 shrink-0 text-brand">
                <ShieldIcon size={14} />
              </span>
              <span>
                The assistant <strong className="text-foreground">cannot move money</strong>. It has
                no write tools, by design — a person types a command, and MTN asks them to approve
                it on their own handset, with a PIN we never see.
              </span>
            </p>
          </div>
        </section>

        {/* the habit loop, in three frames */}
        <section aria-labelledby="loop-h" className="border-t border-divider px-5 py-14 sm:px-8">
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
        <section aria-label="What MTN said" className="border-t border-divider px-5 py-14 sm:px-8">
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

        {/* close */}
        <section
          aria-labelledby="close-h"
          className="relative isolate overflow-hidden border-t border-divider"
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
      <footer className="border-t border-divider">
        {/* A single gold thread, the brand colour used once, to close the page. */}
        <div
          aria-hidden="true"
          className="h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
        />

        {/*
          ONE ROW, EDGE TO EDGE. This was four stacked blocks — a wordmark and
          tagline, two link columns, two attributions and a small-print row —
          which on a laptop pushed the page's last real content most of a screen
          above the fold. It is now a single flex row that runs the full width
          rather than sitting inside `max-w-4xl`, because the constraint is what
          forced the wrapping in the first place.

          `flex-wrap` and not a grid: the four groups have wildly different
          natural widths, and a grid would give the shortest one a column as wide
          as the longest. Wrapping lets each take what it needs and drop to the
          next line only when it genuinely cannot fit — which on a 390px phone is
          immediately, and that is the correct outcome there.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="font-display text-lg leading-none text-brand">MoMo Kasi</span>
            <p className="text-xs leading-snug text-muted-foreground">
              Earn, share, spend. One double-entry ledger across three MTN MoMo APIs.
            </p>
          </div>

          {/*
            The column headings are gone with the columns. "The pitch" and "The
            build" were labels for a shape that no longer exists, and five links
            on one line need no taxonomy.
          */}
          <nav aria-label="Site" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-foreground transition-colors hover:text-brand"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/*
            The two attributions, still held apart and still given equal weight:
            whose rails this runs on, and who built it. Neither is decoration —
            the MoMo mark is the reason the app can move money at all, and Tumo
            Olo is the answer to "who do we talk to".
          */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <MomoMark size={26} />
              <div className="leading-tight">
                <p className="text-xs font-medium text-foreground">Built on the MTN MoMo API</p>
                <p className="text-[11px] text-muted-foreground">
                  Collections · Disbursements · Remittances
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <a
                href={BUILDER_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-block transition-opacity hover:opacity-80"
              >
                <TumoOloMark className="h-4 w-auto" />
              </a>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Built in Johannesburg.
                <br />
                Designed to be handed over.
              </p>
            </div>
          </div>
        </div>

        {/*
          The small print keeps its own row. The badge is a claim about real
          money and the trademark line is a legal notice; neither should have to
          compete for space with a navigation link.
        */}
        <div className="flex flex-col gap-2 border-t border-divider px-5 py-2.5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          {/*
            Kept, and made louder rather than quieter. We show MTN's mark on a
            page that says "tap to pay your fare"; without this the page implies
            a live integration it does not have — or, now, understates one it
            does. Derived, so it cannot expire again.
          */}
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-brand/40 px-2.5 py-0.5 font-medium text-brand">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            {MOMO_IS_SANDBOX
              ? 'MoMo sandbox — no real money moves'
              : 'Live on MTN production — real money moves'}
          </span>
          <p className="text-balance sm:text-right">
            © 2026 Tumo Olo (Pty) Ltd. MTN, MoMo and the MoMo logo are trademarks of MTN Group.
          </p>
        </div>
      </footer>
    </div>
  );
}
