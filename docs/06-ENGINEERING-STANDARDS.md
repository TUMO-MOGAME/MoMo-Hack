# 06 — Engineering Standards

Repo: <https://github.com/TUMO-MOGAME/MoMo-Hack> · Owner: `TUMO-MOGAME` · Visibility: **public** (ADR-0005)

---

## 1. Bootstrap order

Protection cannot be applied to a branch that does not exist, so there is exactly one push to
`main` that is not a PR — the first one.

```bash
cd /c/Users/tumom/momo-kasi
git add -A
git commit -m "chore: project planning and documentation"

gh repo edit TUMO-MOGAME/MoMo-Hack --visibility public --accept-visibility-change-consequences

git remote add origin https://github.com/TUMO-MOGAME/MoMo-Hack.git
git branch -M main
git push -u origin main        # <-- the only direct push to main, ever
```

Then apply the ruleset (§2). From that point every change is a PR, including yours.

---

## 2. Protecting `main`

Rulesets, not classic branch protection — they are the current API and they work on public repos on
the free plan.

```bash
gh api -X POST repos/TUMO-MOGAME/MoMo-Hack/rulesets \
  -H "Accept: application/vnd.github+json" \
  -f name='protect-main' \
  -f target='branch' \
  -f enforcement='active' \
  -F 'conditions[ref_name][include][]=~DEFAULT_BRANCH' \
  -F 'rules[][type]=deletion' \
  -F 'rules[][type]=non_fast_forward' \
  -F 'rules[][type]=required_linear_history' \
  -F 'rules[][type]=pull_request' \
  -F 'rules[][parameters][required_approving_review_count]=0' \
  -F 'rules[][parameters][dismiss_stale_reviews_on_push]=true' \
  -F 'rules[][parameters][require_last_push_approval]=false' \
  -F 'rules[][parameters][required_review_thread_resolution]=true'
```

Once CI has run once and the check names are registered, add the status-check rule:

```bash
# required_status_checks — add after the first CI run so the contexts exist
gh api -X PUT repos/TUMO-MOGAME/MoMo-Hack/rulesets/<id> \
  -F 'rules[][type]=required_status_checks' \
  -F 'rules[][parameters][strict_required_status_checks_policy]=true' \
  -F 'rules[][parameters][required_status_checks][][context]=quality-gate'
```

**Settings and why:**

| Rule | Value | Why |
|---|---|---|
| `pull_request` | required | Everything is reviewable, and CI runs before merge |
| `required_approving_review_count` | **0** | You cannot approve your own PR. Requiring 1 would block a solo developer entirely. |
| `required_review_thread_resolution` | true | Agent review comments must be resolved, not ignored |
| `required_status_checks` | `quality-gate` | The actual gate. This is what makes count-0 acceptable. |
| `strict_required_status_checks_policy` | true | The branch must be up to date with `main` before merge |
| `required_linear_history` | true | Squash merges only. A readable history is part of the "2-month build" story. |
| `non_fast_forward` | true | No force-pushing `main` |
| `deletion` | true | `main` cannot be deleted |
| Bypass actors | **none** | Including you. Discipline you can bypass is not discipline. |

> With zero required approvals, **CI is the reviewer.** That is why `docs/04` §12 is strict: it is
> carrying the weight that a human reviewer would carry on a team. Treat a red check as a blocked
> merge, never as a suggestion.

**Emergency escape hatch:** set the ruleset to `enforcement=evaluate`, do the fix, set it back to
`active`, and write a line in `STATUS.md` saying you did. Never delete the ruleset.

---

## 3. Branching

```
main                     protected, always deployable
feat/<area>-<slug>       new capability      feat/ledger-split-engine
fix/<area>-<slug>        bug fix             fix/momo-token-refresh
chore/<slug>             tooling, deps       chore/ci-playwright-cache
docs/<slug>              documentation only  docs/momo-api-verification
agent/<wave>-<slug>      agent-authored      agent/w2-telegram-keyboards
```

Branches are short-lived — **merged or deleted within 24 hours.** A branch open longer than that is
a scope error; split it.

---

## 4. Commits

Conventional Commits. The history is a public artefact that judges may read.

```
<type>(<scope>): <subject>

feat(ledger): integer basis-point split with remainder distribution
fix(momo): treat 409 as already-accepted instead of failing
test(rls): assert non-members cannot read a stokvel
docs(momo): confirm disbursement transfer body against the portal
```

Types: `feat` `fix` `docs` `test` `chore` `refactor` `perf` `ci`.

Rules:
- Subject in the imperative, under 72 characters, no trailing full stop.
- One logical change per commit.
- Body explains **why**, not what — the diff shows what.
- `BREAKING CHANGE:` in the footer for anything that changes a schema or an API contract.

---

## 5. Pull requests

`.github/pull_request_template.md`:

```markdown
## What
One sentence.

## Why
The problem this solves. Link the STATUS.md row.

## How
Notable decisions. Anything a reviewer would otherwise have to reverse-engineer.

## Testing
- [ ] Unit
- [ ] Property (required if this touches money)
- [ ] Integration / RLS (required if this touches the database)
- [ ] Contract (required if this touches MoMo)
- [ ] E2E (required if this changes a user-visible flow)
- [ ] Manually verified on a real phone

## Checklist
- [ ] `STATUS.md` updated
- [ ] `momoAPIs.md` updated if MoMo behaviour was learned
- [ ] `docs/11-API-USAGE-MAP.md` updated if a new external call was added
- [ ] ADR added if this decision constrains future work
- [ ] Migrations are forward-only; no merged migration was edited
- [ ] No secrets, no `NEXT_PUBLIC_` on anything sensitive
- [ ] No floating-point money
```

Merge method: **squash only.** Squash merging is enabled; merge commits and rebase merging are
disabled in repo settings.

---

## 6. The CI quality gate

`.github/workflows/ci.yml`, one job named `quality-gate` so the ruleset has a single stable context.

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true          # do not waste minutes on superseded runs

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      MOMO_MODE: emulator            # CI never depends on MTN being up
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci

      - run: npx gitleaks detect --no-banner --redact
      - run: npm audit --audit-level=high
      - run: npm run typecheck
      - run: npm run lint

      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset                     # replays every migration + seed
      - run: npm run db:types && git diff --exit-code src/types/database.ts

      - run: npm run test:unit -- --coverage
      - run: npm run test:contract
      - run: npm run test:integration
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:critical

      - name: STATUS.md must be updated
        if: github.event_name == 'pull_request'
        run: |
          git fetch origin ${{ github.base_ref }} --depth=1
          git diff --name-only origin/${{ github.base_ref }} \
            | grep -qx 'STATUS.md' \
            || { echo "::error::This PR does not update STATUS.md"; exit 1; }
```

Notes:
- `concurrency` with `cancel-in-progress` matters even with unlimited minutes: it keeps feedback fast.
- `MOMO_MODE: emulator` is non-negotiable. A CI suite that fails because someone else's sandbox is
  down is a CI suite people learn to ignore.
- The STATUS.md check is deliberately blunt. It is the mechanism that keeps a fresh session oriented.

---

## 7. Deployment

| Trigger | Target | Database | Gate |
|---|---|---|---|
| PR opened | Vercel preview | Supabase **staging** | quality-gate |
| Merge to `main` | Vercel production | Supabase **prod** | quality-gate + migration job |
| Manual | — | — | `workflow_dispatch` |

Migrations deploy in a separate job that runs **before** the Vercel production promotion:

```yaml
  migrate:
    needs: quality-gate
    if: github.ref == 'refs/heads/main'
    steps:
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROD_REF }}
      - run: supabase db push
```

**Migrations are always additive-first.** A column is added, code is deployed to use it, and only a
later migration drops the old one. We will not need to roll back in 25 days, but a deploy that
cannot be rolled back is a deploy that cannot be made on the morning of a demo.

---

## 8. Secrets

| Secret | GitHub Actions | Vercel | Local |
|---|---|---|---|
| `MOMO_*` (5 values) | ✓ | ✓ | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | `.env.local` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | ✓ | ✓ | `.env.local` |
| `CRON_SECRET` | ✓ | ✓ | `.env.local` |

Rules:
- `.env.local` is gitignored. `.env.example` is committed with blank values.
- `gitleaks` runs pre-commit **and** in CI.
- **The repo is public.** Anything committed is compromised permanently — rotate immediately, do not
  rely on a force-push to erase it.
- Secrets are never logged. The MoMo client redacts `Authorization` and `Ocp-Apim-Subscription-Key`
  before any log line, and there is a test asserting that.

---

## 9. Code style

- TypeScript `strict: true`. No `any` — use `unknown` and narrow.
- No default exports except Next.js pages and layouts, which require them.
- `src/domain/**` is pure: no imports of `fs`, `process`, `next`, `react`, or the Supabase client.
  Enforced by an ESLint `no-restricted-imports` boundary rule.
- Money is `bigint` everywhere. An ESLint rule bans `parseFloat`, `Number()` and `toFixed()` in any
  file under `src/domain/` or `src/server/`.
- Errors are `AppError` (`docs/01` §10), never bare `Error`.
- Prettier, default config, no arguments about formatting.

---

## 10. ADRs

`docs/adr/NNNN-kebab-title.md`. Write one whenever a decision constrains future work.

```markdown
# ADR-NNNN — Title
- Status: Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context
The forces at play. What made this a decision rather than an obvious default.

## Options
What we considered, with the real trade-offs, including the one we rejected.

## Decision
What we chose.

## Consequences
What this makes easy. What this makes hard. What we will have to live with.
```

ADRs are **append-only**. A decision that turns out wrong gets a new ADR that supersedes the old one;
the old one stays, marked superseded. The reasoning trail is part of what a technical judge is
looking at.

---

## 11. Definition of Ready

Before work starts on any item, it must have:

1. A row in `STATUS.md`.
2. A clear acceptance criterion — what observable behaviour proves it works.
3. Its required test level named (`docs/04`).
4. Its file-tree ownership identified, so an agent can be pointed at it without collision.
5. Any blocking decision already made and recorded.

Work that is not Ready does not get an agent pointed at it. That is the single most common way
parallel agent work goes wrong.
