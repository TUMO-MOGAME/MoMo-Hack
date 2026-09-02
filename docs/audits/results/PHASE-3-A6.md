# PHASE-3 — A6 SEO & content (repo-level)

**Project:** MoMo Kasi · **Phase:** 3 — Money engine · **Date:** 2026-09-02
**Commit:** `162faed` · **Audit source:** tumoOLO_Audits @ `main` (no pinned sha)
**Result:** 0 Critical · 2 High · 4 Medium · 2 Low · 0 waived · 3 not measured

**Scope:** metadata, crawlability, structured data and copy, read from source and verified against
the live deployment. **Not measured against a ranking goal** — this is a hackathon submission whose
"traffic" is a judging panel and a shared link.
**Report only — nothing was fixed during this audit.**

---

## 1. Executive summary

**The words are good and the machine-readable layer is almost entirely absent.** Every page has a
distinct, well-written title and description; `lang="en-ZA"` is set correctly, which matters for a
product whose copy code-switches; the marketing page has a clean, deep heading hierarchy (21
headings, `h1 → h2 → h3` with no skipped levels); and the copy itself is specific and honest —
"Earn through micro-gigs, share through stokvels, spend on taxi fare, electricity and school fees"
tells a reader exactly what this is without a single growth-marketing cliché.

Against that: **`robots.txt`, `sitemap.xml` and `favicon.ico` all return 404**, there are **zero
Open Graph or Twitter Card tags**, no canonical link, no `metadataBase`, and no structured data.
Verified live, not inferred.

Two of those have consequences that land tomorrow rather than in some future indexing cycle.

**The link has no preview.** When a judge or a teammate pastes `momo.tumoolo.tech` into WhatsApp,
Slack, LinkedIn or a Twitter DM, it renders as a bare grey URL — no title, no description, no
image. Every other submission with three lines of metadata renders as a card. This is the single
highest-visibility, lowest-effort gap in the entire audit suite, and for a hackathon whose sharing
surface *is* chat apps, it is worth more than most of the ranking work A6 normally asks about.

**And there is no favicon**, so the browser tab shows a blank sheet of paper. A judge with eight
submissions open sees seven icons and one blank. `public/` is empty; there is no `src/app/icon.*`
either.

One further correctness issue: `mo-mo-hack.vercel.app` still serves the identical site with a `200`
and there is no canonical tag, so two hosts publish the same content with no signal about which is
authoritative — while `momo.tumoolo.tech` is the host the MoMo API user is bound to.

### Top 5 risks

1. **No Open Graph or Twitter tags (A6-01, High).** The shared link is a bare URL everywhere.
2. **No favicon (A6-02, High).** Blank tab, next to competitors who have one.
3. **Two hosts, no canonical (A6-03, Medium).** Duplicate content with no authority signal.
4. **`robots.txt` and `sitemap.xml` 404 (A6-04, Medium).**
5. **`siteUrl` is empty in `audits.config.json` (A6-07, Low)** — the config's own note says an empty
   field is reported as *Not measured*, and it propagates into every future audit.

---

## 2. Findings

| ID | Severity | Location | Finding | Why it matters | Fix |
|---|---|---|---|---|---|
| A6-01 | **High** | `src/app/layout.tsx:11-16` and every page `metadata` | **No Open Graph and no Twitter Card tags anywhere.** Verified live: a grep for `og:`, `twitter:` and `canonical` over the rendered home page returns nothing | The sharing surface for this project is chat apps and a judging panel, not a search engine. A pasted link currently renders as bare grey text in WhatsApp, Slack, LinkedIn and Discord. Three lines of `openGraph` metadata turn it into a titled card with an image. This is the cheapest credibility available anywhere in the six audits | Add `openGraph` and `twitter` to the root `metadata`, plus an OG image. Next can generate one at build time with `opengraph-image.tsx` — no design asset needed, and the brand mark already exists in `src/components/brand-marks.tsx` |
| A6-02 | **High** | `public/` is empty; no `src/app/icon.*` or `favicon.ico` | **No favicon.** `GET /favicon.ico` returns **404** | The browser tab is blank. A judge comparing submissions has several tabs open; the one with no icon reads as unfinished before it is opened. It also affects bookmarks, the mobile home-screen icon and the Telegram link preview | `src/app/icon.svg` (Next generates the rest). The MoMo Kasi wordmark or a single gold glyph on black is enough |
| A6-03 | Medium | No `metadataBase`, no canonical; `mo-mo-hack.vercel.app` returns **200** | The Vercel alias serves the identical site and nothing declares which host is authoritative. `metadataBase` is unset, so relative OG URLs would resolve incorrectly once A6-01 is fixed | Duplicate content across two hosts with no canonical. It also matters operationally: `momo.tumoolo.tech` is the host the **MoMo API user is bound to**, and a mismatched `X-Callback-Url` is a hard 500 (`momoAPIs.md` §4.1). Anything that encourages the alias to be treated as equivalent is a small trap | Set `metadataBase: new URL('https://momo.tumoolo.tech')` and `alternates: { canonical: '/' }` in the root layout. Both are one line and A6-01 needs `metadataBase` anyway |
| A6-04 | Medium | No `src/app/robots.ts`, no `src/app/sitemap.ts` | **`/robots.txt` 404, `/sitemap.xml` 404** — verified live | Low stakes for a hackathon, but they are four lines each in Next's file conventions, and their absence is the kind of thing a thorough judge checks precisely *because* it is cheap. A `robots.ts` is also where you would exclude `/api/*` from crawling, which is currently unstated | `src/app/robots.ts` and `src/app/sitemap.ts`, listing `/`, `/chat`, `/ledger` and disallowing `/api/` |
| A6-05 | Medium | `/chat` renders **zero** headings — verified live | No `h1` on the product's primary surface. Also filed as **A3-02** (accessibility), where it is High | Search and accessibility want the same thing here: a page should say what it is. A `<title>` alone does not give the document an outline | One `<h1>` — see A3-02 |
| A6-06 | Medium | No `application/ld+json` on any page — verified, count is 0 | No structured data. For this product the natural fits are `SoftwareApplication` or `Organization` on `/`, and `FAQPage` if the marketing page's sections are question-shaped | Not a ranking issue at this scale; it is a completeness one, and it is what makes a rich result possible at all | Optional. If added, `SoftwareApplication` on `/` is the honest choice |
| A6-07 | Low | `audits.config.json` — `project.siteUrl: ""` | Empty, and the file's own `$comment` says *"anything left empty is reported as 'Not measured', never as a pass"* | It propagates: every future audit that resolves `SITE_URL` gets nothing, and S1 (the deployed-site audit at Phase 6) is built entirely around it | Set it to `https://momo.tumoolo.tech` |
| A6-08 | Low | `src/app/(app)/layout.tsx:5-9` | The `(app)` segment's description is written for `/chat` specifically, but the segment also contains `/ledger`, which overrides it with its own | Correct in effect, confusing to read — a segment-level description that only describes one of its children | Move the chat description onto the chat page, or make the segment's generic |

---

## 3. What was verified live

| Check | Result |
|---|---|
| `/robots.txt` | **404** |
| `/sitemap.xml` | **404** |
| `/favicon.ico` | **404** |
| `og:` / `twitter:` / `canonical` tags | **none** |
| `application/ld+json` blocks | **0** |
| `<html lang>` | `en-ZA` ✓ |
| `<meta name="robots">` | absent — so indexable by default, which is correct |
| Titles | `/` "MoMo Kasi — daily money for Mzansi" · `/chat` "Chat · MoMo Kasi" · `/ledger` "Ledger · MoMo Kasi" — all distinct ✓ |
| Heading hierarchy | `/` 21 headings, `h1→h2→h3`, no skipped levels ✓ · `/ledger` `h1→h2×3` ✓ · `/chat` **none** ✗ |
| Vercel alias | `mo-mo-hack.vercel.app` → **200**, same content |

---

## 4. Not measured

| Check | Why |
|---|---|
| **Indexing status and crawl behaviour** | No Search Console access, and the site is days old. Whether Google has crawled it is unknown |
| **Rendered OG preview** | Nothing to preview — no tags exist (A6-01). Once added, verify with a real unfurl in WhatsApp and Slack rather than trusting the markup |
| **Reading level and comprehension of the copy for a second-language reader** | The overlay's user frequently reads English as a second or third language. The copy is short and concrete, which is the right instinct, but no readability measure was applied and no speaker was asked |

---

## 5. Waived

None.

---

## 6. Remediation roadmap

**Quick wins (< 1 day) — and the first two are worth doing before the presentation**
- A6-01 — OG and Twitter tags plus a generated `opengraph-image`. Perhaps 30 minutes, and it changes
  what every shared link looks like.
- A6-02 — `src/app/icon.svg`. Ten minutes.
- A6-03 — `metadataBase` + canonical. Two lines, and A6-01 needs it.
- A6-04 — `robots.ts` + `sitemap.ts`. Eight lines total.
- A6-07 — fill in `siteUrl`.

**Medium**
- A6-05 — the `/chat` heading, shared with A3-02.
- A6-08 — tidy the segment description.

**Structural**
- A6-06 — structured data, if it is ever worth it. Phase 6 at the earliest.

---

## 7. What is genuinely good

- **The copy is specific and honest.** "Earn through micro-gigs, share through stokvels, spend on
  taxi fare, electricity and school fees. One double-entry ledger across three MTN MoMo APIs."
  That is a description a reader can act on, with no growth-marketing filler, and it names the
  technical claim the product actually makes.
- **`lang="en-ZA"`, not `en` or `en-US`.** Correct for the market, correct for screen-reader
  pronunciation, and the sort of detail usually left at the framework default.
- **Every route has a distinct title in a consistent `Page · Brand` pattern.** No duplicates, no
  truncation risk, and the brand is last where it belongs.
- **The marketing page's heading hierarchy is deep and correct** — 21 headings, no skipped levels.
  That is unusual; skipped levels are the single most common structural error on a landing page.
- **No `noindex` left behind.** Easy to ship by accident from a staging config, and it has not been.
