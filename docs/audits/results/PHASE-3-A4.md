# PHASE-3 — A4 Performance & Core Web Vitals

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (no pinned sha)
**Result:** 0 Critical · 1 High · 3 Medium · 2 Low · 0 waived · 5 not measured

**Scope:** production build output, and live timings against <https://momo.tumoolo.tech> from a
South African client. **Target device per the overlay: low-end Android, 320px, Slow 3G.**
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**The bundle is genuinely small and the static path is fast; the problem is entirely in what
happens after the HTML arrives on a dynamic route.** Shared JavaScript is 103 kB and no route
exceeds 119 kB first-load — for a React app with three font families, an artifact component
registry and a chat client, that is a good number and it did not happen by accident. The marketing
page is prerendered and answers in **165–246 ms**. Fonts are self-hosted through `next/font`, so
there is no render-blocking request to `fonts.googleapis.com` and no FOUT from a third-party
origin. Images go through `next/image`, and the repository history shows 52 MB of source JPEGs were
already reduced to 908 kB.

**What is missing is any loading state at all.** There is no `loading.tsx` anywhere in `src/app`,
and `/ledger` is a dynamic Server Component that performs a Postgres round trip before it can emit
anything. Measured live: **722 ms, 836 ms, 1432 ms** time-to-first-byte across three consecutive
requests. For that entire window the user sees the *previous* page — Next holds the old view during
a server navigation — with no spinner, no skeleton and no indication that anything is happening.
On the overlay's Slow 3G target that window is several seconds. The `ChipSkeleton` component this
project would need already exists and is used elsewhere; it simply is not wired to the route.

The agent endpoint is comfortable: **1.9 s, 3.6 s, 1.9 s** end to end including the Gemini call,
against a Vercel Hobby function ceiling of 10 s. The design that makes that safe — a deterministic
answer built before the model is consulted, so a slow or absent model degrades to a correct reply
rather than a hang — is the right architecture for conference wifi and is already in place.

**Core Web Vitals themselves are not measured.** No field data, no Lighthouse run, no lab
throttling — LCP, CLS and INP are unknown rather than good. What is measured is TTFB, payload size
and bundle composition totals, and those are healthy.

### Top 5 risks

1. **No loading UI on a 0.7–1.4 s dynamic route (A4-01, High).** The ledger page appears frozen.
2. **CWV are entirely unmeasured (A4-02, Medium).** LCP/CLS/INP are unknown, not good.
3. **`/ledger` re-queries Postgres on every request (A4-03, Medium)** with no caching at all.
4. **Three font families, one of them a display serif (A4-04, Medium)** on a Slow 3G target.
5. **Cold starts are real and unquantified** — the 1432 ms and 706 ms outliers are almost certainly
   function cold starts, and nothing warms them before a demo.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A4-01 | **High** | `src/app/(app)/ledger/` — no `loading.tsx`; verified none exists anywhere under `src/app` | A dynamic Server Component with a measured **722–1432 ms** TTFB and no loading boundary. During a client-side navigation Next keeps the *old* page on screen until the server responds, so the app looks unresponsive to a tap | This is the screen built specifically to prove the ledger is real, and it is the one a judge is most likely to click. On Slow 3G the dead window is seconds, not milliseconds. `ChipSkeleton` already exists in `src/components/artifacts/skeleton.tsx` | Add `src/app/(app)/ledger/loading.tsx` rendering the existing skeleton. Roughly ten lines, and it converts the worst-feeling screen into the best-feeling one |
| A4-02 | Medium | Whole site | **No Core Web Vitals measurement of any kind.** No Lighthouse run, no `web-vitals` reporting, no field data. LCP, CLS and INP are unknown | The audit cannot report them as passing and does not. Given three font families and a hero image on `/`, CLS and LCP are the two plausibly-weak metrics and neither has been looked at | `npx lighthouse` against the live URL with mobile throttling — no dependency, one command. Record the three numbers here |
| A4-03 | Medium | `src/app/(app)/ledger/page.tsx`, `src/app/api/context/route.ts` | Both hit Postgres on every request with `dynamic = 'force-dynamic'` and `cache-control: no-store`. No revalidation window, no cache | Correct for a ledger, where a stale balance is a worse failure than a slow one — so this is a deliberate and defensible trade. It becomes a cost when several judges load the page at once against a free-tier database in `eu-west-2` while the function runs elsewhere | Keep `no-store` for correctness. If latency matters more during the demo, a `revalidate: 5` on `/ledger` would be invisible to a viewer and remove most of the round trips. Decide deliberately rather than by default |
| A4-04 | Medium | `src/app/layout.tsx:6-8` | Three Google font families loaded on every page — Geist, Geist Mono, **Playfair Display**. All `subsets: ['latin']`, self-hosted via `next/font`, but all three ship on every route | Playfair is a display serif used, per the tokens, for "the brand moment and large amounts". On the overlay's Slow 3G target a third family is real bytes on the critical path. Self-hosting and `next/font`'s automatic `swap` already remove the worst of it | Confirm Playfair is actually used above the fold on `/chat` and `/ledger`; if not, load it only on the routes that use it. Consider `preload: false` on the mono family if it is only used inside artifacts |
| A4-05 | Low | Live timings | First-request outliers — `/chat` 706 ms vs 278 ms steady, `/ledger` 1432 ms vs 722 ms — consistent with serverless cold starts | Not a defect, and worth knowing before a demo: the first click of the day is the slow one | Warm the routes with a `curl` to `/`, `/chat`, `/ledger` and `/api/context` a minute before presenting. Add it to `docs/08-DEMO-RUNBOOK.md` |
| A4-06 | Low | `package.json` | No bundle analyzer, so the 103 kB shared chunk is a total with no composition | The total is healthy so this is not urgent, and adding an analyzer costs a dependency (`docs/10`) — a real trade-off, not an oversight | `ANALYZE=1` with `@next/bundle-analyzer` as a dev-only dependency, if and when the total grows |

---

## 3. Measurements

**Build output** (`npm run build`, commit `162faed`):

| Route | Route JS | First-load JS | Rendering |
|---|---|---|---|
| `/` | 6.30 kB | 112 kB | Static (prerendered) |
| `/chat` | 5.96 kB | 119 kB | Static shell, client-driven |
| `/ledger` | 1.97 kB | 115 kB | Dynamic (server-rendered per request) |
| shared by all | — | 103 kB | — |

**Live timings**, three consecutive requests each, from a South African client:

| Path | TTFB | Total | Payload |
|---|---|---|---|
| `/` | 172 / 165 / 246 ms | 213 / 197 / 284 ms | 81.7 kB |
| `/chat` | 706 / 278 / 351 ms | same | 12.5 kB |
| `/ledger` | 1432 / 723 / 836 ms | same | 20.9 kB |
| `POST /api/agent` | — | 2.15 / 3.59 / 1.90 s | — |
| `GET /api/context` | — | 2.13 / 0.62 s | — |

`/api/agent` sits well inside the Vercel Hobby 10 s function ceiling even at its slowest.

---

## 4. Not measured

| Check | Why |
|---|---|
| **LCP, CLS, INP** | No Lighthouse run and no field data. Unknown, not passing (A4-02) |
| **Slow 3G / low-end Android** | No device, no emulator, no throttled run. All timings above are from a desktop client on a good connection and are therefore a **best case** |
| **Bundle composition** | No analyzer installed; totals only (A4-06) |
| **Animation jank** | Requires a real device and a profiler. The CSS animations are short (240–400 ms) and transform-based by inspection, but frame timing was not captured |
| **Behaviour under concurrent load** | No load testing. Free-tier Supabase connection limits under several simultaneous `/ledger` loads are untested, and a demo audience clicking at once is exactly that scenario |

---

## 5. Waived

None.

---

## 6. Remediation roadmap

**Quick wins (< 1 day)**
- A4-01 — `loading.tsx` for `/ledger`. Ten lines using a component that already exists. **Do this
  before the presentation.**
- A4-05 — add a warm-up curl to the demo runbook. Five minutes.
- A4-02 — one Lighthouse command, and record the numbers.

**Medium**
- A4-04 — check Playfair's above-the-fold usage per route.
- A4-03 — decide the `/ledger` caching posture deliberately.

**Structural**
- Field CWV via `web-vitals` reporting, and a throttled device pass. Phase 6.

---

## 7. What is genuinely good

- **103 kB shared, 112–119 kB first load.** For React 19 + Next 15 with three font families and a
  component registry, that is a lean build and it needs no apology.
- **Fonts are self-hosted through `next/font`.** No render-blocking third-party origin, no
  connection to `fonts.googleapis.com`, automatic `swap`. This is the single highest-leverage font
  decision and it was made correctly.
- **Images were taken seriously before it was urgent** — 52 MB of source JPEGs down to 908 kB, and
  `next/image` on top of that. The MTN mark is a 174 px lossless WebP rather than a full-size PNG.
- **The agent's latency budget is designed, not hoped for.** The deterministic answer is built
  *before* the model is called, so a slow Gemini degrades to a correct reply instead of a timeout.
  Measured worst case 3.6 s against a 10 s ceiling — and the fallback means even a ceiling breach is
  survivable.
- **The static marketing page is genuinely fast** — 165 ms TTFB, prerendered, served from cache.
  That is the first thing a judge loads.
