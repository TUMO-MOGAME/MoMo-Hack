# Architecture Decision Records

Append-only. A decision that turns out wrong gets a **new** ADR superseding the old one; the old one
stays, marked superseded. The reasoning trail is part of what a technical judge is looking at.

| # | Decision | Status |
|---|---|---|
| [0001](0001-single-nextjs-monolith.md) | Single Next.js + TypeScript monolith | Accepted |
| [0002](0002-product-name-and-scope.md) | Product name **MoMo Kasi**, four modules, one wallet | Accepted |
| [0003](0003-double-entry-ledger.md) | Double-entry ledger as the source of truth | Accepted |
| [0004](0004-integer-money.md) | Money as `bigint` minor units; integer basis-point splits | Accepted |
| [0005](0005-public-repository.md) | Public repository | Accepted |
| [0006](0006-github-actions-scheduler.md) | GitHub Actions as the scheduler | Accepted |
| [0007](0007-telegram-over-whatsapp.md) | Telegram replaces WhatsApp | Accepted |
| [0008](0008-sandbox-currency-shim.md) | ZAR ledger, EUR at the MoMo boundary | Accepted |
| [0009](0009-momo-emulator.md) | Ship a MoMo emulator | Accepted |
| [0010](0010-service-role-boundary.md) | The browser never touches the ledger | Accepted |
| [0011](0011-voice-provider-per-language.md) | Provider-per-language voice with a pre-generated phrase bank | Accepted |
| [0012](0012-groq-as-agent-llm.md) | Groq as the agent LLM | Accepted |
| [0013](0013-typed-artifact-schema.md) | The agent emits typed data, never markup | Accepted |
| [0014](0014-agent-cannot-move-money.md) | The agent cannot move money | Accepted |
| [0015](0015-popia-by-design.md) | POPIA compliance by design | Accepted |
| [0016](0016-shared-audit-suite.md) | Phase gates run the shared audit suite | Accepted |
| [0017](0017-mandates-and-pin-authority.md) | Standing mandates, and a PIN the agent cannot see | Accepted |

Template in `docs/06-ENGINEERING-STANDARDS.md` §10.
